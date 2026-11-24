-- ═══════════════════════════════════════════════════════════════════════════
-- Paso 8: cron cada 30 min (pg_cron → /api/cron/tick).
--
-- 1. El cron cierra las rondas vencidas con service_role: `close_round` y
--    `save_round_groups` (que llama dentro) aceptan también al servidor.
--    Son SECURITY INVOKER, así que `is_server_role()` ve el rol real de quien
--    llama (en una DEFINER vería al dueño y siempre sería true).
-- 2. pg_cron + pg_net llaman a /api/cron/tick con el mismo
--    `Authorization: Bearer $CRON_SECRET` (el plan Hobby de Vercel sólo
--    admite crons diarios). La URL y el secreto viven en Supabase Vault, no en
--    el repo (DEPLOY.md):
--
--      select vault.create_secret('https://www.raquetaclub.com', 'app_url');
--      select vault.create_secret('<CRON_SECRET>', 'cron_secret');
--
--    Sin esos dos secretos el job no hace nada.
-- ═══════════════════════════════════════════════════════════════════════════

set search_path = public, extensions;

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
  if r.id is null or not (public.is_server_role() or public.can_manage_club(r.club_id)) then
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

create or replace function public.close_round(
  p_round uuid, p_snapshots jsonb, p_expel uuid[], p_next jsonb, p_finish boolean
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  r      public.rounds%rowtype;
  v_next uuid;
begin
  select * into r from public.rounds where id = p_round for update;
  if r.id is null or not (public.is_server_role() or public.can_manage_club(r.club_id)) then
    raise exception 'Ronda no encontrada' using errcode = '42501';
  end if;
  if r.status <> 'active' then
    raise exception 'La ronda no está activa' using errcode = '55000';
  end if;
  if exists (select 1 from public.matches where round_id = p_round and status = 'disputed') then
    raise exception 'Hay resultados en disputa: resuélvelos antes de cerrar la ronda' using errcode = '55000';
  end if;

  update public.matches
  set status = 'confirmed', confirmed_at = now()
  where round_id = p_round and status = 'reported';

  update public.matches
  set status = 'not_played', result_type = 'not_played', winner_entry_id = null, score = null
  where round_id = p_round and status in ('pending', 'scheduled');

  insert into public.standings_snapshots (
    club_id, round_id, group_id, entry_id, position, played, won, won_default, lost, lost_default,
    not_played, sets_won, sets_lost, games_won, games_lost, bonus, points, movement)
  select r.club_id, p_round, (s ->> 'group_id')::uuid, (s ->> 'entry_id')::uuid, (s ->> 'position')::int,
         (s ->> 'played')::int, (s ->> 'won')::int, (s ->> 'won_default')::int, (s ->> 'lost')::int,
         (s ->> 'lost_default')::int, (s ->> 'not_played')::int, (s ->> 'sets_won')::int,
         (s ->> 'sets_lost')::int, (s ->> 'games_won')::int, (s ->> 'games_lost')::int,
         (s ->> 'bonus')::numeric, (s ->> 'points')::numeric,
         nullif(s ->> 'movement', '')::public.group_movement
  from jsonb_array_elements(coalesce(p_snapshots, '[]'::jsonb)) as s;

  if p_expel is not null and array_length(p_expel, 1) > 0 then
    update public.tournament_entries
    set status = 'expelled'
    where tournament_id = r.tournament_id and id = any(p_expel) and status = 'accepted';
  end if;

  update public.rounds set status = 'closed', closed_at = now() where id = p_round;

  if p_next is not null then
    insert into public.rounds (club_id, tournament_id, number, name, starts_on, ends_on, results_deadline)
    values (r.club_id, r.tournament_id, (p_next ->> 'number')::int, p_next ->> 'name',
            (p_next ->> 'starts_on')::date, (p_next ->> 'ends_on')::date,
            (p_next ->> 'results_deadline')::timestamptz)
    returning id into v_next;
    perform public.save_round_groups(v_next, coalesce(p_next -> 'groups', '[]'::jsonb));
  end if;

  if p_finish then
    update public.tournaments set status = 'finished', registration_open = false where id = r.tournament_id;
  end if;

  return v_next;
end;
$$;

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- Fuera de `public`: lo que vive ahí es invocable como RPC con la anon key.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create or replace function private.call_tick_cron()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'app_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'cron_secret';
  if v_url is null or v_secret is null then
    return;
  end if;
  -- Asíncrono: la respuesta queda en net._http_response. Tope = maxDuration de la ruta.
  perform net.http_get(
    url := rtrim(v_url, '/') || '/api/cron/tick',
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_secret),
    timeout_milliseconds := 60000
  );
end;
$$;
revoke all on function private.call_tick_cron() from public, anon, authenticated;

-- Mismo nombre = se actualiza en vez de duplicarse al reaplicar.
select cron.schedule('raquetaclub-tick', '*/30 * * * *', $$select private.call_tick_cron()$$);
