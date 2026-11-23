-- ═══════════════════════════════════════════════════════════════════════════
-- Paso 5: link de partido. Proponer horario, aceptarlo y apartar la cancha.
--
-- Los jugadores no escriben en matches, propuestas ni reservas (RLS); todo
-- pasa por estas RPCs SECURITY DEFINER, que validan quién llama y el estado:
--
--   propose_slot(match, court, start)   uno de los dos jugadores propone
--   respond_slot(proposal, accept)      el OTRO acepta (crea la reserva) o rechaza
--   withdraw_slot(proposal)             quien propuso la retira
--   cancel_match_booking(match, reason) jugador (antes de la hora) o admin
--
-- Regla de las bases: "no se puede hacer reservación si su contrincante no
-- les ha confirmado". La reserva sólo nace en respond_slot(accept = true).
-- La base sigue siendo la última palabra contra el doble booking (23P01) y
-- los bloqueos (RC409), aunque la app ya sólo ofrezca huecos libres.
--
-- Como son DEFINER, la RLS no aplica dentro: cada una comprueba a mano que el
-- usuario es jugador del partido (o admin del club).
-- ═══════════════════════════════════════════════════════════════════════════

set search_path = public, extensions;

-- Entry del usuario en sesión dentro del partido (null si no juega en él).
-- Sólo cuenta una inscripción aceptada: un expulsado ya no agenda.
create or replace function public.my_entry_in_match(p_match public.matches)
returns uuid
language sql stable security definer set search_path = public
as $$
  select te.id from public.tournament_entries te
  where te.id in (p_match.entry_a, p_match.entry_b)
    and te.player_id = (select auth.uid())
    and te.status = 'accepted'
$$;
revoke all on function public.my_entry_in_match(public.matches) from public, anon;

-- ¿El horario cabe en la ronda, en el horario de la cancha y en el futuro?
-- Lanza 22023 con un mensaje para el jugador.
create or replace function public.assert_slot_valid(
  p_match public.matches, p_court uuid, p_start timestamptz, p_end timestamptz
)
returns void
language plpgsql stable security definer set search_path = public
as $$
declare
  v_tz    text;
  v_round public.rounds%rowtype;
  v_local timestamp;
  v_local_end timestamp;
begin
  select timezone into v_tz from public.clubs where id = p_match.club_id;
  select * into v_round from public.rounds where id = p_match.round_id;
  v_local := p_start at time zone v_tz;
  v_local_end := p_end at time zone v_tz;

  if p_start <= now() then
    raise exception 'Ese horario ya pasó' using errcode = '22023';
  end if;
  if v_local::date < v_round.starts_on or v_local::date > v_round.ends_on or p_end > v_round.results_deadline then
    raise exception 'El partido tiene que jugarse dentro de la ronda (antes de la fecha límite de resultados)' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.courts c
    where c.id = p_court and c.club_id = p_match.club_id and c.active
  ) then
    raise exception 'Cancha no disponible' using errcode = '22023';
  end if;
  if v_local_end::date <> v_local::date or not exists (
    select 1 from public.court_hours h
    where h.court_id = p_court
      and h.day_of_week = extract(dow from v_local)::int
      and h.open_time <= v_local::time
      and h.close_time >= v_local_end::time
  ) then
    raise exception 'La cancha no abre en ese horario' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.court_blocks b
    where b.club_id = p_match.club_id
      and (b.court_id is null or b.court_id = p_court)
      and tstzrange(b.start_at, b.end_at) && tstzrange(p_start, p_end)
  ) then
    raise exception 'La cancha está bloqueada en ese horario' using errcode = 'RC409';
  end if;
  if exists (
    select 1 from public.court_bookings k
    where k.court_id = p_court and k.status = 'confirmed'
      and tstzrange(k.start_at, k.end_at) && tstzrange(p_start, p_end)
  ) then
    raise exception 'La cancha ya está apartada en ese horario' using errcode = '23P01';
  end if;
end;
$$;
revoke all on function public.assert_slot_valid(public.matches, uuid, timestamptz, timestamptz) from public, anon;

-- Partido con su ronda activa, bloqueado para el resto de la transacción.
create or replace function public.lock_open_match(p_match uuid)
returns public.matches
language plpgsql security definer set search_path = public
as $$
declare
  m public.matches%rowtype;
begin
  select * into m from public.matches where id = p_match for update;
  if m.id is null then
    raise exception 'Partido no encontrado' using errcode = '42501';
  end if;
  if not exists (select 1 from public.rounds r where r.id = m.round_id and r.status = 'active') then
    raise exception 'La ronda de este partido no está activa' using errcode = '55000';
  end if;
  return m;
end;
$$;
revoke all on function public.lock_open_match(uuid) from public, anon;

-- ─────────────────────────────── propose_slot ───────────────────────────
create or replace function public.propose_slot(p_match uuid, p_court uuid, p_start timestamptz)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  m       public.matches%rowtype;
  v_entry uuid;
  v_end   timestamptz;
  v_min   int;
  v_id    uuid;
begin
  m := public.lock_open_match(p_match);
  v_entry := public.my_entry_in_match(m);
  if v_entry is null then
    raise exception 'No juegas este partido' using errcode = '42501';
  end if;
  if m.status <> 'pending' then
    raise exception 'El partido ya tiene horario' using errcode = '55000';
  end if;
  if (select count(*) from public.match_slot_proposals
      where match_id = p_match and proposed_by = (select auth.uid()) and status = 'proposed' and start_at > now()) >= 3 then
    raise exception 'Ya tienes 3 propuestas pendientes en este partido: espera respuesta o retira alguna' using errcode = '55000';
  end if;

  select coalesce(nullif(t.config ->> 'match_minutes', '')::int, 90) into v_min
  from public.tournaments t where t.id = m.tournament_id;
  v_end := p_start + make_interval(mins => v_min);
  perform public.assert_slot_valid(m, p_court, p_start, v_end);

  insert into public.match_slot_proposals (club_id, match_id, proposed_by, court_id, start_at, end_at)
  values (m.club_id, p_match, (select auth.uid()), p_court, p_start, v_end)
  returning id into v_id;
  return v_id;
end;
$$;

-- ─────────────────────────────── respond_slot ───────────────────────────
-- Devuelve el id de la reserva al aceptar; null al rechazar.
create or replace function public.respond_slot(p_proposal uuid, p_accept boolean)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  p       public.match_slot_proposals%rowtype;
  m       public.matches%rowtype;
  v_booking uuid;
begin
  select * into p from public.match_slot_proposals where id = p_proposal;
  if p.id is null then
    raise exception 'Propuesta no encontrada' using errcode = '42501';
  end if;
  m := public.lock_open_match(p.match_id);
  if public.my_entry_in_match(m) is null then
    raise exception 'No juegas este partido' using errcode = '42501';
  end if;
  if p.proposed_by = (select auth.uid()) then
    raise exception 'La propuesta la tiene que aceptar tu rival' using errcode = '42501';
  end if;
  if p.status <> 'proposed' then
    raise exception 'Esta propuesta ya no está vigente' using errcode = '55000';
  end if;

  if not p_accept then
    update public.match_slot_proposals set status = 'declined', responded_at = now() where id = p_proposal;
    return null;
  end if;

  if m.status <> 'pending' then
    raise exception 'El partido ya tiene horario' using errcode = '55000';
  end if;
  -- Revalida: entre propuesta y respuesta pudo ocuparse o bloquearse la cancha.
  perform public.assert_slot_valid(m, p.court_id, p.start_at, p.end_at);

  insert into public.court_bookings (club_id, court_id, match_id, start_at, end_at, booked_by)
  values (m.club_id, p.court_id, m.id, p.start_at, p.end_at, (select auth.uid()))
  returning id into v_booking;

  update public.matches set status = 'scheduled', scheduled_at = p.start_at where id = m.id;
  update public.match_slot_proposals set status = 'accepted', responded_at = now() where id = p_proposal;
  update public.match_slot_proposals set status = 'expired', responded_at = now()
  where match_id = m.id and status = 'proposed';
  return v_booking;
end;
$$;

-- ─────────────────────────────── withdraw_slot ──────────────────────────
create or replace function public.withdraw_slot(p_proposal uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  update public.match_slot_proposals
  set status = 'withdrawn', responded_at = now()
  where id = p_proposal and proposed_by = (select auth.uid()) and status = 'proposed';
  if not found then
    raise exception 'Propuesta no encontrada' using errcode = '42501';
  end if;
end;
$$;

-- ─────────────────────────── cancel_match_booking ───────────────────────
-- El partido vuelve a "por agendar". Un jugador sólo antes de la hora del
-- partido; el admin siempre (el W.O. / no jugado se resuelve en resultados).
create or replace function public.cancel_match_booking(p_match uuid, p_reason text)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  m        public.matches%rowtype;
  v_admin  boolean;
begin
  m := public.lock_open_match(p_match);
  v_admin := public.can_manage_club(m.club_id);
  if not v_admin and public.my_entry_in_match(m) is null then
    raise exception 'No juegas este partido' using errcode = '42501';
  end if;
  if m.status <> 'scheduled' then
    raise exception 'El partido no tiene horario agendado' using errcode = '55000';
  end if;
  if not v_admin and m.scheduled_at <= now() then
    raise exception 'El partido ya empezó: pide al administrador que lo resuelva' using errcode = '55000';
  end if;

  update public.court_bookings
  set status = 'cancelled',
      cancelled_reason = coalesce(nullif(trim(p_reason), ''), 'Cancelado por ' || case when v_admin then 'el club' else 'un jugador' end)
  where match_id = m.id and status = 'confirmed';
  update public.matches set status = 'pending', scheduled_at = null where id = m.id;
end;
$$;

revoke all on function
  public.propose_slot(uuid, uuid, timestamptz),
  public.respond_slot(uuid, boolean),
  public.withdraw_slot(uuid),
  public.cancel_match_booking(uuid, text),
  public.lock_open_match(uuid)
from public, anon;
grant execute on function
  public.propose_slot(uuid, uuid, timestamptz),
  public.respond_slot(uuid, boolean),
  public.withdraw_slot(uuid),
  public.cancel_match_booking(uuid, text)
to authenticated, service_role;
