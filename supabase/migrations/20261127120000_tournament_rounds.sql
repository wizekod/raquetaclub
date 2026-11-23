-- ═══════════════════════════════════════════════════════════════════════════
-- Paso 4: torneos, grupos y publicación de rondas.
--
-- 1. Una sola ronda abierta (borrador o activa) por torneo.
-- 2. `save_round_groups`: reemplaza los grupos de una ronda en borrador de
--    forma atómica. Sólo admite inscripciones aceptadas.
-- 3. `publish_round`: genera el round robin de cada grupo (todos contra todos),
--    activa la ronda y pone el torneo "en curso". Una vez publicada, los
--    jugadores la ven (`round_is_visible`) y los grupos ya no se reemplazan.
--
-- Ambas son SECURITY INVOKER: corren con la RLS del admin que las llama.
-- ═══════════════════════════════════════════════════════════════════════════

set search_path = public, extensions;

create unique index rounds_one_open_per_tournament_idx
  on public.rounds(tournament_id) where status <> 'closed';

-- p_groups: [{"level": 1, "name": "Grupo 1", "entries": ["<entry uuid>", …]}, …]
-- El orden de `entries` es la siembra dentro del grupo.
create or replace function public.save_round_groups(p_round uuid, p_groups jsonb)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  r       public.rounds%rowtype;
  g       jsonb;
  v_group uuid;
  v_pos   int;
  v_entry text;
begin
  select * into r from public.rounds where id = p_round;
  if r.id is null or not public.can_manage_club(r.club_id) then
    raise exception 'Ronda no encontrada' using errcode = '42501';
  end if;
  if r.status <> 'draft' then
    raise exception 'La ronda ya está publicada' using errcode = '55000';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(coalesce(p_groups, '[]'::jsonb)) as grp,
         jsonb_array_elements_text(grp -> 'entries') as e(id)
    left join public.tournament_entries te
      on te.id = e.id::uuid and te.tournament_id = r.tournament_id and te.status = 'accepted'
    where te.id is null
  ) then
    raise exception 'Hay jugadores que no están aceptados en el torneo' using errcode = '22023';
  end if;

  delete from public.groups where round_id = p_round;   -- cascada: integrantes

  for g in select * from jsonb_array_elements(coalesce(p_groups, '[]'::jsonb)) loop
    insert into public.groups (club_id, round_id, level, name)
    values (r.club_id, p_round, (g ->> 'level')::int,
            coalesce(nullif(trim(g ->> 'name'), ''), 'Grupo ' || (g ->> 'level')))
    returning id into v_group;

    v_pos := 0;
    for v_entry in select jsonb_array_elements_text(g -> 'entries') loop
      v_pos := v_pos + 1;
      insert into public.group_members (club_id, tournament_id, round_id, group_id, entry_id, position)
      values (r.club_id, r.tournament_id, p_round, v_group, v_entry::uuid, v_pos);
    end loop;
  end loop;
end;
$$;

revoke all on function public.save_round_groups(uuid, jsonb) from public, anon;
grant execute on function public.save_round_groups(uuid, jsonb) to authenticated, service_role;

-- Devuelve el número de partidos creados.
create or replace function public.publish_round(p_round uuid)
returns int
language plpgsql
security invoker
set search_path = public
as $$
declare
  r       public.rounds%rowtype;
  v_count int;
begin
  select * into r from public.rounds where id = p_round;
  if r.id is null or not public.can_manage_club(r.club_id) then
    raise exception 'Ronda no encontrada' using errcode = '42501';
  end if;
  if r.status <> 'draft' then
    raise exception 'La ronda ya está publicada' using errcode = '55000';
  end if;

  -- Los grupos vacíos no cuentan; uno de un solo jugador no tendría partidos.
  delete from public.groups g
  where g.round_id = p_round
    and not exists (select 1 from public.group_members m where m.group_id = g.id);
  if not exists (select 1 from public.group_members where round_id = p_round) then
    raise exception 'La ronda no tiene grupos' using errcode = '55000';
  end if;
  if exists (
    select 1 from public.group_members where round_id = p_round
    group by group_id having count(*) < 2
  ) then
    raise exception 'Cada grupo necesita al menos 2 jugadores' using errcode = '55000';
  end if;

  delete from public.matches where round_id = p_round;

  -- Todos contra todos. `entry_a` es el de mejor siembra dentro del grupo.
  insert into public.matches (club_id, tournament_id, round_id, group_id, entry_a, entry_b)
  select r.club_id, r.tournament_id, p_round, a.group_id, a.entry_id, b.entry_id
  from public.group_members a
  join public.group_members b
    on b.group_id = a.group_id
   and (coalesce(a.position, 2147483647), a.entry_id) < (coalesce(b.position, 2147483647), b.entry_id)
  where a.round_id = p_round;
  get diagnostics v_count = row_count;

  update public.rounds set status = 'active', published_at = now() where id = p_round;
  update public.tournaments set status = 'active'
  where id = r.tournament_id and status in ('draft', 'registration');

  return v_count;
end;
$$;

revoke all on function public.publish_round(uuid) from public, anon;
grant execute on function public.publish_round(uuid) to authenticated, service_role;
