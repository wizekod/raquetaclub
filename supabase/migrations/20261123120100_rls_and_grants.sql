-- ═══════════════════════════════════════════════════════════════════════════
-- RaquetaClub — helpers de rol/tenant, alta de usuarios, guardas, GRANTs y RLS
--
-- Modelo (igual que reservaprimero):
--   · service_role  → server actions de confianza, webhooks, cron. BYPASSRLS.
--   · authenticated → superadmin / club_admin / player. Aislados por policy.
--   · anon          → sólo lo que muestra la página pública /{slug}.
--
-- Rol y club se leen de public.profiles con funciones SECURITY DEFINER (sin
-- custom access-token hook): un cambio de rol o de club aplica al instante.
--
-- Regla: los jugadores NO escriben directamente en matches, proposals ni
-- court_bookings. Lo hacen vía RPCs SECURITY DEFINER que validan la máquina de
-- estados (Fase 1: propose_slot, accept_slot, report_result, confirm_result,
-- dispute_result). Aquí sólo tienen lectura.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────── helpers de sesión ──────────────────────────
create or replace function public.current_user_role()
returns public.user_role
language sql stable security definer set search_path = public
as $$ select role from public.profiles where id = (select auth.uid()) $$;

create or replace function public.current_club_id()
returns uuid
language sql stable security definer set search_path = public
as $$ select club_id from public.profiles where id = (select auth.uid()) $$;

create or replace function public.is_superadmin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(
    (select role = 'superadmin' from public.profiles where id = (select auth.uid())),
    false)
$$;

-- Admin de ESE club (no superadmin).
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
  )
$$;

-- Cualquier cuenta activa del club, o superadmin.
create or replace function public.can_read_club(p_club uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid())
      and (role = 'superadmin' or (club_id = p_club and status = 'active'))
  )
$$;

-- Admin del club o superadmin: quien gestiona.
create or replace function public.can_manage_club(p_club uuid)
returns boolean
language sql stable security definer set search_path = public
as $$ select public.is_superadmin() or public.is_club_admin(p_club) $$;

-- Entries (participaciones) del usuario en sesión.
create or replace function public.current_entry_ids()
returns setof uuid
language sql stable security definer set search_path = public
as $$ select id from public.tournament_entries where player_id = (select auth.uid()) $$;

-- ¿El usuario en sesión comparte algún partido con `p_profile`? Sirve para
-- enseñar el teléfono del rival: las bases piden coordinar horario entre ellos.
create or replace function public.shares_match_with(p_profile uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
    from public.matches m
    join public.tournament_entries ea on ea.id = m.entry_a
    join public.tournament_entries eb on eb.id = m.entry_b
    where m.status <> 'cancelled'
      and (
        (ea.player_id = (select auth.uid()) and eb.player_id = p_profile)
        or (eb.player_id = (select auth.uid()) and ea.player_id = p_profile)
      )
  )
$$;

-- ¿Es servidor? (service_role / postgres / auth). Lo usan las guardas de
-- columnas privilegiadas: un REVOKE de columna no resta a un GRANT de tabla.
create or replace function public.is_server_role()
returns boolean
language sql stable
as $$
  select current_user in ('service_role', 'postgres', 'supabase_admin', 'supabase_auth_admin')
$$;

-- ──────────────── trigger: crea profiles al alta en auth.users ───────────
-- Tres caminos:
--  1. Invitación del admin o del superadmin: `raw_app_meta_data` trae
--     `invited_role` (club_admin | player) y `club_id`. app_metadata sólo lo
--     puede escribir el servidor (service_role), así que es de confianza.
--  2. Registro de jugador en /{slug}/registro: `raw_user_meta_data.club_id`.
--     Lo controla el usuario, así que sólo puede dar el rol `player` y sólo si
--     el club existe y no está suspendido.
--  3. Registro sin club: dueño que viene de la landing → `club_admin` sin
--     club, que sólo puede pasar por /onboarding para crear el suyo.
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_app   jsonb := coalesce(new.raw_app_meta_data, '{}'::jsonb);
  v_user  jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_role  public.user_role;
  v_club  uuid;
  v_uuid  constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
begin
  if v_app ? 'invited_role' then
    v_role := case v_app ->> 'invited_role'
                when 'club_admin' then 'club_admin'::public.user_role
                else 'player'::public.user_role
              end;
    if (v_app ->> 'club_id') ~* v_uuid then
      select id into v_club from public.clubs where id = (v_app ->> 'club_id')::uuid;
    end if;
  elsif v_user ? 'club_id' then
    v_role := 'player';
    if (v_user ->> 'club_id') ~* v_uuid then
      select id into v_club from public.clubs
      where id = (v_user ->> 'club_id')::uuid and status <> 'suspended';
    end if;
  else
    v_role := 'club_admin';
  end if;

  insert into public.profiles (id, role, club_id, first_name, last_name, email, phone)
  values (
    new.id,
    v_role,
    v_club,
    nullif(trim(v_user ->> 'first_name'), ''),
    nullif(trim(v_user ->> 'last_name'), ''),
    lower(new.email),
    nullif(trim(v_user ->> 'phone'), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Mantiene profiles.email al día cuando se confirma un cambio de correo.
create or replace function public.handle_user_email_change()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  update public.profiles set email = lower(new.email) where id = new.id;
  return new;
end;
$$;

drop trigger if exists on_auth_user_email_changed on auth.users;
create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row when (old.email is distinct from new.email)
  execute function public.handle_user_email_change();

-- ─────────────────── guardas de columnas privilegiadas ───────────────────
create or replace function public.guard_club_privileged_columns()
returns trigger
language plpgsql
as $$
begin
  if public.is_server_role() then
    return new;
  end if;
  if new.status                 is distinct from old.status
  or new.plan_id                is distinct from old.plan_id
  or new.stripe_customer_id     is distinct from old.stripe_customer_id
  or new.stripe_subscription_id is distinct from old.stripe_subscription_id
  or new.subscription_status    is distinct from old.subscription_status
  or new.trial_ends_at          is distinct from old.trial_ends_at then
    raise exception 'clubs: columnas de estado/facturación sólo se modifican server-side'
      using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger clubs_guard_privileged
  before update on public.clubs
  for each row execute function public.guard_club_privileged_columns();

-- role / club_id / email: sólo servidor. status: el admin del club puede
-- dar de baja o reactivar a sus jugadores, pero nadie se cambia el suyo.
create or replace function public.guard_profile_privileged_columns()
returns trigger
language plpgsql
as $$
begin
  if public.is_server_role() then
    return new;
  end if;
  if new.role    is distinct from old.role
  or new.club_id is distinct from old.club_id
  or new.email   is distinct from old.email then
    raise exception 'profiles: role, club_id y email sólo se modifican server-side'
      using errcode = '42501';
  end if;
  if new.status is distinct from old.status
     and (old.id = (select auth.uid()) or not public.can_manage_club(old.club_id)) then
    raise exception 'profiles: el estado lo cambia el admin del club'
      using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger profiles_guard_privileged
  before update on public.profiles
  for each row execute function public.guard_profile_privileged_columns();

-- Un jugador sólo se inscribe a sí mismo, en estado `pending`, sin siembra, y
-- sólo mientras el torneo tenga la inscripción abierta.
--
-- OJO: SECURITY INVOKER a propósito. Dentro de una función SECURITY DEFINER
-- `current_user` es el dueño (postgres) e `is_server_role()` daría siempre
-- true: cualquier jugador se podría autoaceptar. Lo mismo vale para toda
-- guarda que llame a `is_server_role()`.
create or replace function public.guard_entry_self_signup()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if public.is_server_role() or public.can_manage_club(new.club_id) then
    return new;
  end if;
  if new.player_id <> (select auth.uid())
     or new.status <> 'pending'
     or new.seed is not null
     or not exists (
       select 1 from public.tournaments t
       where t.id = new.tournament_id
         and t.registration_open
         and t.status in ('registration', 'active')
     ) then
    raise exception 'Inscripción no permitida' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger tournament_entries_guard_signup
  before insert on public.tournament_entries
  for each row execute function public.guard_entry_self_signup();

-- ═══════════════════════════════ GRANTs ═════════════════════════════════
-- Explícitos por tabla: desde el 30-oct-2026 Supabase no concede acceso
-- automático a tablas nuevas de `public` (CLAUDE.md §1, convenciones).
grant usage on schema public to anon, authenticated, service_role;

grant select, insert, update, delete on
  public.subscription_plans, public.clubs, public.profiles, public.courts,
  public.court_hours, public.court_blocks, public.court_bookings,
  public.tournaments, public.tournament_entries, public.rounds, public.groups,
  public.group_members, public.matches, public.match_slot_proposals,
  public.standings_snapshots, public.notifications_log, public.push_subscriptions
to service_role;

grant execute on function
  public.current_user_role(), public.current_club_id(), public.is_superadmin(),
  public.is_club_admin(uuid), public.can_read_club(uuid), public.can_manage_club(uuid),
  public.current_entry_ids(), public.shares_match_with(uuid), public.is_server_role(),
  public.phone_key(text, text)
to authenticated, service_role;

-- authenticated: privilegios de tabla; las filas las filtran las policies.
grant select on public.subscription_plans to authenticated;
grant insert, update, delete on public.subscription_plans to authenticated;   -- superadmin (policy)
grant select, update, delete on public.clubs to authenticated;                 -- alta de club: service_role
grant insert, update, delete on
  public.courts, public.court_hours, public.court_blocks, public.court_bookings,
  public.tournaments, public.tournament_entries, public.rounds, public.groups,
  public.group_members, public.matches, public.match_slot_proposals,
  public.standings_snapshots
to authenticated;
grant select on
  public.courts, public.court_hours, public.court_blocks, public.court_bookings,
  public.tournaments, public.tournament_entries, public.rounds, public.groups,
  public.group_members, public.matches, public.match_slot_proposals,
  public.standings_snapshots, public.notifications_log
to authenticated;
grant select, delete on public.push_subscriptions to authenticated;           -- alta: service_role

-- profiles: los datos de contacto NO se leen de la tabla; van por la vista
-- `profile_contacts`, que decide fila a fila quién los ve. RLS filtra filas,
-- no columnas: por eso se restringen las columnas con GRANT.
grant select (id, role, club_id, first_name, last_name, avatar_path, status, created_at)
  on public.profiles to authenticated;
grant update (first_name, last_name, phone, avatar_path, status)
  on public.profiles to authenticated;

-- anon: sólo lo que enseña la página pública del club.
grant select (id, name, max_players, max_active_tournaments, price, features)
  on public.subscription_plans to anon;
grant select (id, slug, name, timezone, phone_country_code, logo_path, brand_color,
              phone, address, sports, status)
  on public.clubs to anon;
grant select (id, club_id, name, type, sport, format, status, starts_on, ends_on,
              registration_open, rules_text, rules_pdf_path)
  on public.tournaments to anon;

-- ═══════════════════════════ enable RLS (todas) ════════════════════════
alter table public.subscription_plans   enable row level security;
alter table public.clubs                enable row level security;
alter table public.profiles             enable row level security;
alter table public.courts               enable row level security;
alter table public.court_hours          enable row level security;
alter table public.court_blocks         enable row level security;
alter table public.court_bookings       enable row level security;
alter table public.tournaments          enable row level security;
alter table public.tournament_entries   enable row level security;
alter table public.rounds               enable row level security;
alter table public.groups               enable row level security;
alter table public.group_members        enable row level security;
alter table public.matches              enable row level security;
alter table public.match_slot_proposals enable row level security;
alter table public.standings_snapshots  enable row level security;
alter table public.notifications_log    enable row level security;
alter table public.push_subscriptions   enable row level security;

-- ═══════════════════════════ subscription_plans ═══════════════════════════
create policy plans_read_all on public.subscription_plans
  for select to anon, authenticated using (true);
create policy plans_superadmin_write on public.subscription_plans
  for all to authenticated
  using (public.is_superadmin()) with check (public.is_superadmin());

-- ═══════════════════════════════════ clubs ════════════════════════════════
create policy clubs_public_read on public.clubs
  for select to anon using (status in ('active', 'trial'));
create policy clubs_member_read on public.clubs
  for select to authenticated using (public.can_read_club(id));
create policy clubs_manage_update on public.clubs
  for update to authenticated
  using (public.can_manage_club(id)) with check (public.can_manage_club(id));
create policy clubs_superadmin_delete on public.clubs
  for delete to authenticated using (public.is_superadmin());

-- ═════════════════════════════════ profiles ═══════════════════════════════
-- Jugadores y admins del mismo club se ven entre sí (nombre y foto: rankings,
-- grupos). El contacto va aparte, en `profile_contacts`.
create policy profiles_read on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or public.can_read_club(club_id));
create policy profiles_update_self_or_admin on public.profiles
  for update to authenticated
  using (id = (select auth.uid()) or public.can_manage_club(club_id))
  with check (id = (select auth.uid()) or public.can_manage_club(club_id));

-- Contacto (correo y teléfono) por fila:
--  · uno mismo, el admin de su club y el superadmin → todo;
--  · un rival con el que comparte partido → sólo el teléfono, para acordar
--    horario (bases de la escalera).
-- La vista corre con los permisos de su dueño, así que el filtro de filas va
-- en el WHERE y las columnas sensibles se anulan con CASE.
create view public.profile_contacts
with (security_barrier = true)
as
select
  p.id,
  p.club_id,
  case when p.id = (select auth.uid()) or public.can_manage_club(p.club_id)
       then p.email end as email,
  p.phone,
  p.phone_key
from public.profiles p
where p.id = (select auth.uid())
   or public.can_manage_club(p.club_id)
   or public.shares_match_with(p.id);

revoke all on public.profile_contacts from anon, authenticated;
grant select on public.profile_contacts to authenticated, service_role;

-- ═════════════════════ tablas del club (lectura de miembros) ════════════════
-- Patrón: leen todas las cuentas activas del club; escribe el admin (o el
-- superadmin). Las escrituras de jugadores pasan por RPCs (Fase 1).
create policy courts_read on public.courts
  for select to authenticated using (public.can_read_club(club_id));
create policy courts_manage on public.courts
  for all to authenticated
  using (public.can_manage_club(club_id)) with check (public.can_manage_club(club_id));

create policy court_hours_read on public.court_hours
  for select to authenticated using (public.can_read_club(club_id));
create policy court_hours_manage on public.court_hours
  for all to authenticated
  using (public.can_manage_club(club_id)) with check (public.can_manage_club(club_id));

create policy court_blocks_read on public.court_blocks
  for select to authenticated using (public.can_read_club(club_id));
create policy court_blocks_manage on public.court_blocks
  for all to authenticated
  using (public.can_manage_club(club_id)) with check (public.can_manage_club(club_id));

-- Ocupación visible para todo el club: los jugadores necesitan ver qué
-- horarios están tomados al proponer.
create policy court_bookings_read on public.court_bookings
  for select to authenticated using (public.can_read_club(club_id));
create policy court_bookings_manage on public.court_bookings
  for all to authenticated
  using (public.can_manage_club(club_id)) with check (public.can_manage_club(club_id));

create policy tournaments_public_read on public.tournaments
  for select to anon
  using (status <> 'draft'
         and exists (select 1 from public.clubs c
                     where c.id = club_id and c.status in ('active', 'trial')));
create policy tournaments_read on public.tournaments
  for select to authenticated
  using (public.can_manage_club(club_id)
         or (status <> 'draft' and public.can_read_club(club_id)));
create policy tournaments_manage on public.tournaments
  for all to authenticated
  using (public.can_manage_club(club_id)) with check (public.can_manage_club(club_id));

create policy tournament_entries_read on public.tournament_entries
  for select to authenticated using (public.can_read_club(club_id));
-- Autoinscripción: el detalle (pending, sin seed, inscripción abierta) lo
-- impone el trigger `guard_entry_self_signup`.
create policy tournament_entries_self_insert on public.tournament_entries
  for insert to authenticated
  with check (player_id = (select auth.uid()) and club_id = public.current_club_id());
create policy tournament_entries_manage on public.tournament_entries
  for all to authenticated
  using (public.can_manage_club(club_id)) with check (public.can_manage_club(club_id));

create policy rounds_read on public.rounds
  for select to authenticated
  using (public.can_manage_club(club_id)
         or (status <> 'draft' and public.can_read_club(club_id)));
create policy rounds_manage on public.rounds
  for all to authenticated
  using (public.can_manage_club(club_id)) with check (public.can_manage_club(club_id));

-- Grupos, integrantes y partidos de una ronda en borrador sólo los ve el
-- admin: el jugador se entera al publicarla.
create or replace function public.round_is_visible(p_round uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.rounds r
    where r.id = p_round
      and (public.can_manage_club(r.club_id)
           or (r.status <> 'draft' and public.can_read_club(r.club_id)))
  )
$$;
grant execute on function public.round_is_visible(uuid) to authenticated, service_role;

create policy groups_read on public.groups
  for select to authenticated using (public.round_is_visible(round_id));
create policy groups_manage on public.groups
  for all to authenticated
  using (public.can_manage_club(club_id)) with check (public.can_manage_club(club_id));

create policy group_members_read on public.group_members
  for select to authenticated using (public.round_is_visible(round_id));
create policy group_members_manage on public.group_members
  for all to authenticated
  using (public.can_manage_club(club_id)) with check (public.can_manage_club(club_id));

create policy matches_read on public.matches
  for select to authenticated using (public.round_is_visible(round_id));
create policy matches_manage on public.matches
  for all to authenticated
  using (public.can_manage_club(club_id)) with check (public.can_manage_club(club_id));

-- Propuestas: sólo los dos jugadores del partido y el admin.
create policy match_slot_proposals_read on public.match_slot_proposals
  for select to authenticated
  using (
    public.can_manage_club(club_id)
    or exists (
      select 1 from public.matches m
      where m.id = match_id
        and (m.entry_a in (select public.current_entry_ids())
             or m.entry_b in (select public.current_entry_ids()))
    )
  );
create policy match_slot_proposals_manage on public.match_slot_proposals
  for all to authenticated
  using (public.can_manage_club(club_id)) with check (public.can_manage_club(club_id));

create policy standings_snapshots_read on public.standings_snapshots
  for select to authenticated using (public.can_read_club(club_id));
create policy standings_snapshots_manage on public.standings_snapshots
  for all to authenticated
  using (public.can_manage_club(club_id)) with check (public.can_manage_club(club_id));

-- ═══════════════════════════ notifications_log ═══════════════════════════
-- Sólo lo escribe el servidor; el superadmin lo consulta para soporte.
create policy notifications_log_superadmin_read on public.notifications_log
  for select to authenticated using (public.is_superadmin());

-- ═══════════════════════════ push_subscriptions ══════════════════════════
-- El alta pasa por service_role: un endpoint que antes fue de otra cuenta
-- (computadora compartida) tiene que poder cambiar de dueño.
create policy push_subscriptions_own_select on public.push_subscriptions
  for select to authenticated using (profile_id = (select auth.uid()));
create policy push_subscriptions_own_delete on public.push_subscriptions
  for delete to authenticated using (profile_id = (select auth.uid()));
