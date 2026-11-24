-- ═══════════════════════════════════════════════════════════════════════════
-- Fase 1, paso 9 (sin Stripe): límites del plan y clubes suspendidos.
--
-- 1. Club suspendido: sus integrantes dejan de leer y gestionar su club (RLS)
--    y de jugar (RPCs del jugador). El superadmin y el servidor siguen.
-- 2. Límites del plan, en la base para que nada los salte (ni el autorregistro
--    directo contra GoTrue): jugadores activos y torneos no finalizados.
--    null = ilimitado; club sin plan = ilimitado. Error RC402 con un mensaje
--    para el admin. Bajar de plan no expulsa a nadie: sólo impide crecer.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────── suspensión ──────────────────────────────
create or replace function public.club_is_open(p_club uuid)
returns boolean
language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.clubs where id = p_club and status <> 'suspended') $$;
revoke all on function public.club_is_open(uuid) from public, anon;
grant execute on function public.club_is_open(uuid) to authenticated, service_role;

create or replace function public.is_club_admin(p_club uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid())
      and role = 'club_admin'
      and club_id = p_club
      and status = 'active'
  ) and public.club_is_open(p_club)
$$;

create or replace function public.can_read_club(p_club uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid())
      and (role = 'superadmin' or (club_id = p_club and status = 'active' and public.club_is_open(p_club)))
  )
$$;

-- Las RPCs del jugador (proponer, aceptar, resultados) pasan por aquí.
create or replace function public.my_entry_in_match(p_match public.matches)
returns uuid
language sql stable security definer set search_path = public
as $$
  select te.id from public.tournament_entries te
  where te.id in (p_match.entry_a, p_match.entry_b)
    and te.player_id = (select auth.uid())
    and te.status = 'accepted'
    and public.club_is_open(p_match.club_id)
$$;
revoke all on function public.my_entry_in_match(public.matches) from public, anon, authenticated;

-- ─────────────────────────────── límites ─────────────────────────────────
create or replace function public.enforce_player_limit()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_max   integer;
  v_plan  text;
  v_count integer;
begin
  if new.role <> 'player' or new.status <> 'active' or new.club_id is null then
    return new;
  end if;
  -- Ya contaba antes del cambio.
  if tg_op = 'UPDATE' and old.role = 'player' and old.status = 'active'
     and old.club_id is not distinct from new.club_id then
    return new;
  end if;

  -- El candado del club serializa dos altas simultáneas.
  select p.max_players, p.name into v_max, v_plan
  from public.clubs c join public.subscription_plans p on p.id = c.plan_id
  where c.id = new.club_id
  for update of c;
  if v_max is null then
    return new;
  end if;

  select count(*) into v_count from public.profiles
  where club_id = new.club_id and role = 'player' and status = 'active' and id <> new.id;
  if v_count >= v_max then
    raise exception 'El plan % del club permite hasta % jugadores activos.', v_plan, v_max
      using errcode = 'RC402';
  end if;
  return new;
end;
$$;
revoke all on function public.enforce_player_limit() from public, anon, authenticated;

drop trigger if exists profiles_player_limit on public.profiles;
create trigger profiles_player_limit
  before insert or update of role, status, club_id on public.profiles
  for each row execute function public.enforce_player_limit();

create or replace function public.enforce_tournament_limit()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_max   integer;
  v_plan  text;
  v_count integer;
begin
  if new.status = 'finished' or (tg_op = 'UPDATE' and old.status <> 'finished') then
    return new;
  end if;

  select p.max_active_tournaments, p.name into v_max, v_plan
  from public.clubs c join public.subscription_plans p on p.id = c.plan_id
  where c.id = new.club_id
  for update of c;
  if v_max is null then
    return new;
  end if;

  select count(*) into v_count from public.tournaments
  where club_id = new.club_id and status <> 'finished' and id <> new.id;
  if v_count >= v_max then
    raise exception 'El plan % del club permite hasta % torneo(s) sin finalizar.', v_plan, v_max
      using errcode = 'RC402';
  end if;
  return new;
end;
$$;
revoke all on function public.enforce_tournament_limit() from public, anon, authenticated;

drop trigger if exists tournaments_limit on public.tournaments;
create trigger tournaments_limit
  before insert or update of status on public.tournaments
  for each row execute function public.enforce_tournament_limit();
