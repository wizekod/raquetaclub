-- ═══════════════════════════════════════════════════════════════════════════
-- Paso 3: canchas, horario semanal y bloqueos.
--
-- 1. `court_hours` sin franjas encimadas en el mismo día de una cancha.
-- 2. `set_court_hours`: reemplaza el horario semanal de una cancha de forma
--    atómica (borrar + insertar en una transacción).
-- 3. `create_court_block`: crea un bloqueo. Si choca con partidos agendados,
--    sin confirmación sólo los cuenta; con `p_cancel` los cancela y devuelve
--    el partido a "por agendar" (bases: "cuando el hotel requiera las canchas
--    se tendrán que cancelar los partidos").
--
-- Las dos funciones son SECURITY INVOKER: corren con la RLS del admin que las
-- llama, así que un jugador o un admin de otro club no pueden usarlas.
-- ═══════════════════════════════════════════════════════════════════════════

set search_path = public, extensions;

alter table public.court_hours
  add constraint court_hours_no_overlap exclude using gist (
    court_id with =,
    day_of_week with =,
    tsrange(date '2000-01-01' + open_time, date '2000-01-01' + close_time) with &&
  );

-- p_hours: [{"day_of_week": 1, "open_time": "07:00", "close_time": "14:00"}, …]
create or replace function public.set_court_hours(p_court uuid, p_hours jsonb)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_club uuid;
begin
  select club_id into v_club from public.courts where id = p_court;
  if v_club is null or not public.can_manage_club(v_club) then
    raise exception 'Cancha no encontrada' using errcode = '42501';
  end if;

  delete from public.court_hours where court_id = p_court;

  insert into public.court_hours (club_id, court_id, day_of_week, open_time, close_time)
  select v_club, p_court,
         (h ->> 'day_of_week')::smallint,
         (h ->> 'open_time')::time,
         (h ->> 'close_time')::time
  from jsonb_array_elements(coalesce(p_hours, '[]'::jsonb)) as h;
end;
$$;

revoke all on function public.set_court_hours(uuid, jsonb) from public, anon;
grant execute on function public.set_court_hours(uuid, jsonb) to authenticated, service_role;

create or replace function public.create_court_block(
  p_club   uuid,
  p_court  uuid,          -- null = todas las canchas
  p_start  timestamptz,
  p_end    timestamptz,
  p_reason text,
  p_cancel boolean default false
)
returns jsonb             -- {"block_id": uuid|null, "conflicts": n, "cancelled": n}
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_conflicts int;
  v_match_ids uuid[];
  v_block uuid;
begin
  if not public.can_manage_club(p_club) then
    raise exception 'Sin permiso' using errcode = '42501';
  end if;
  if p_end <= p_start then
    raise exception 'El bloqueo debe terminar después de empezar' using errcode = '22007';
  end if;

  select count(*), array_agg(b.match_id)
    into v_conflicts, v_match_ids
  from public.court_bookings b
  where b.club_id = p_club
    and b.status = 'confirmed'
    and (p_court is null or b.court_id = p_court)
    and tstzrange(b.start_at, b.end_at) && tstzrange(p_start, p_end);

  if v_conflicts > 0 and not p_cancel then
    return jsonb_build_object('block_id', null, 'conflicts', v_conflicts, 'cancelled', 0);
  end if;

  if v_conflicts > 0 then
    update public.court_bookings b
    set status = 'cancelled',
        cancelled_reason = coalesce(nullif(trim(p_reason), ''), 'Cancha bloqueada por el club')
    where b.club_id = p_club
      and b.status = 'confirmed'
      and (p_court is null or b.court_id = p_court)
      and tstzrange(b.start_at, b.end_at) && tstzrange(p_start, p_end);

    -- Sólo los que estaban agendados: uno ya jugado o reportado conserva su
    -- estado y su resultado.
    update public.matches m
    set status = 'pending', scheduled_at = null
    where m.id = any(v_match_ids)
      and m.status = 'scheduled';
  end if;

  insert into public.court_blocks (club_id, court_id, start_at, end_at, reason, created_by)
  values (p_club, p_court, p_start, p_end, nullif(trim(p_reason), ''), (select auth.uid()))
  returning id into v_block;

  return jsonb_build_object('block_id', v_block, 'conflicts', v_conflicts, 'cancelled', v_conflicts);
end;
$$;

revoke all on function public.create_court_block(uuid, uuid, timestamptz, timestamptz, text, boolean) from public, anon;
grant execute on function public.create_court_block(uuid, uuid, timestamptz, timestamptz, text, boolean)
  to authenticated, service_role;
