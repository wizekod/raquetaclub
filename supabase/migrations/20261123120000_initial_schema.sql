-- ═══════════════════════════════════════════════════════════════════════════
-- RaquetaClub — esquema inicial (CLAUDE.md §4)
--
-- Consistencia multi-tenant: casi todas las tablas llevan `club_id` y las FK
-- hacia su padre son COMPUESTAS `(padre_id, club_id)`. Así es imposible, a
-- nivel de base, colgar un partido de un torneo de otro club o inscribir a un
-- jugador en el torneo de un club que no es el suyo, sin depender de triggers.
-- Además las políticas RLS filtran por una columna local, sin joins.
-- ═══════════════════════════════════════════════════════════════════════════

-- btree_gist vive en `extensions`; se deja en el search_path para que el
-- opclass gist sobre uuid (=) resuelva al crear el EXCLUDE de court_bookings.
set search_path = public, extensions;

create extension if not exists pgcrypto;                          -- gen_random_uuid()
create extension if not exists btree_gist with schema extensions; -- EXCLUDE anti-doble-reserva

-- ─────────────────────────────── enums ───────────────────────────────────
create type public.user_role           as enum ('superadmin', 'club_admin', 'player');
create type public.club_status         as enum ('active', 'suspended', 'trial');
create type public.profile_status      as enum ('active', 'inactive');
create type public.sport               as enum ('tennis', 'padel');
create type public.tournament_type     as enum ('ladder', 'round_robin');
create type public.tournament_format   as enum ('singles');            -- 'doubles' en Fase 2
create type public.tournament_status   as enum ('draft', 'registration', 'active', 'finished');
create type public.entry_status        as enum ('pending', 'accepted', 'rejected', 'withdrawn', 'expelled');
create type public.round_status        as enum ('draft', 'active', 'closed');
create type public.match_status        as enum ('pending', 'scheduled', 'reported', 'disputed', 'confirmed', 'not_played', 'cancelled');
create type public.match_result_type   as enum ('played', 'default', 'not_played');
create type public.booking_status      as enum ('confirmed', 'cancelled');
create type public.proposal_status     as enum ('proposed', 'accepted', 'declined', 'expired', 'withdrawn');
create type public.group_movement      as enum ('up', 'down', 'stay', 'out');
create type public.notification_channel as enum ('email', 'whatsapp', 'push');
create type public.notification_status  as enum ('pending', 'sent', 'failed', 'skipped');

-- ─────────────────────── helper: updated_at trigger ──────────────────────
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ─────────────────────── helper: teléfono → E.164 ────────────────────────
-- Réplica exacta de `phoneKey` en lib/players/phone.ts. Si cambia una, hay
-- que cambiar la otra. Devuelve null si el número no es canonizable.
create or replace function public.phone_key(raw text, dial text)
returns text
language plpgsql
immutable
as $$
declare
  s text;
begin
  if raw is null then return null; end if;
  s := regexp_replace(raw, '[^0-9+]', '', 'g');
  if s = '' then return null; end if;
  if left(s, 2) = '00' then s := '+' || substr(s, 3); end if;

  if left(s, 1) = '+' then
    s := '+' || regexp_replace(substr(s, 2), '[^0-9]', '', 'g');
  else
    s := regexp_replace(regexp_replace(s, '[^0-9]', '', 'g'), '^0+', '');
    if dial is null or s = '' then return null; end if;
    s := '+' || dial || s;
  end if;

  if s ~ '^\+[1-9][0-9]{6,14}$' then return s; end if;
  return null;
end;
$$;

-- ═══════════════════════════ subscription_plans ══════════════════════════
create table public.subscription_plans (
  id                     uuid primary key default gen_random_uuid(),
  name                   text not null unique,
  stripe_price_id        text unique,
  max_players            integer,          -- jugadores activos; null = ilimitado
  max_active_tournaments integer,          -- torneos no finalizados; null = ilimitado
  price                  numeric(10,2) not null default 0,
  features               jsonb not null default '{}'::jsonb,
  created_at             timestamptz not null default now()
);

-- ══════════════════════════════════ clubs ════════════════════════════════
create table public.clubs (
  id                     uuid primary key default gen_random_uuid(),
  slug                   text not null unique,
  name                   text not null,
  timezone               text not null default 'America/Mexico_City',
  phone_country_code     text not null default '52' check (phone_country_code ~ '^[1-9][0-9]{0,3}$'),
  logo_path              text,
  brand_color            text,
  phone                  text,
  address                text,
  sports                 public.sport[] not null default array['tennis']::public.sport[],
  status                 public.club_status not null default 'trial',
  plan_id                uuid references public.subscription_plans(id) on delete set null,
  stripe_customer_id     text unique,
  stripe_subscription_id text unique,
  subscription_status    text,             -- espeja los estados de Stripe
  trial_ends_at          timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint clubs_slug_format check (slug ~ '^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$'),
  -- Alineado con RESERVED_SLUGS de lib/clubs/slug.ts.
  constraint clubs_slug_not_reserved check (
    slug not in (
      'admin','superadmin','club','jugador','p','api','auth','login','signup',
      'registro','recuperar','onboarding','dashboard','precios','pricing',
      'terminos','privacidad','about','nosotros','soporte','help','cron',
      'webhooks','torneos','rankings'
    )
  ),
  constraint clubs_has_sport check (cardinality(sports) > 0)
);
create trigger clubs_set_updated_at before update on public.clubs
  for each row execute function public.set_updated_at();

-- ════════════════════════════════ profiles ═══════════════════════════════
-- Extiende auth.users. Una cuenta pertenece a UN club (CLAUDE.md, decisión
-- "una cuenta por club"). `email` es copia de auth.users para que el admin
-- liste a sus jugadores sin service_role; la mantiene un trigger.
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  role        public.user_role not null default 'player',
  club_id     uuid references public.clubs(id) on delete cascade,
  first_name  text,
  last_name   text,
  email       text,
  phone       text,
  phone_key   text,                         -- E.164, lo calcula un trigger
  avatar_path text,
  status      public.profile_status not null default 'active',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint profiles_superadmin_no_club check (role <> 'superadmin' or club_id is null),
  -- Destino de las FK compuestas (jugador, club) de tournament_entries.
  constraint profiles_id_club_key unique (id, club_id)
);
create index profiles_club_role_idx on public.profiles(club_id, role);
create index profiles_club_phone_idx on public.profiles(club_id, phone_key);
create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

create or replace function public.profiles_set_phone_key()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.phone_key := public.phone_key(
    new.phone,
    (select c.phone_country_code from public.clubs c where c.id = new.club_id)
  );
  return new;
end;
$$;
create trigger profiles_phone_key
  before insert or update of phone, club_id on public.profiles
  for each row execute function public.profiles_set_phone_key();

-- ═════════════════════════════════ courts ════════════════════════════════
create table public.courts (
  id         uuid primary key default gen_random_uuid(),
  club_id    uuid not null references public.clubs(id) on delete cascade,
  name       text not null,
  sport      public.sport not null default 'tennis',
  surface    text,
  active     boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (club_id, name),
  unique (id, club_id)
);
create trigger courts_set_updated_at before update on public.courts
  for each row execute function public.set_updated_at();

-- Horario operativo semanal. day_of_week: 0 = domingo … 6 = sábado (JS getDay).
-- Varias franjas por día permitidas (ej. 7-14 y 16-22).
create table public.court_hours (
  id          uuid primary key default gen_random_uuid(),
  club_id     uuid not null,
  court_id    uuid not null,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  open_time   time not null,
  close_time  time not null,
  constraint court_hours_time_order check (open_time < close_time),
  foreign key (court_id, club_id) references public.courts(id, club_id) on delete cascade
);
create index court_hours_court_idx on public.court_hours(court_id, day_of_week);

-- Bloqueos del admin: evento privado del hotel, mantenimiento, clases…
-- court_id null = todas las canchas del club.
create table public.court_blocks (
  id         uuid primary key default gen_random_uuid(),
  club_id    uuid not null references public.clubs(id) on delete cascade,
  court_id   uuid,
  start_at   timestamptz not null,
  end_at     timestamptz not null,
  reason     text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint court_blocks_time_order check (start_at < end_at),
  foreign key (court_id, club_id) references public.courts(id, club_id) on delete cascade
);
create index court_blocks_club_time_idx on public.court_blocks(club_id, start_at);

-- ═══════════════════════════════ tournaments ═════════════════════════════
create table public.tournaments (
  id                uuid primary key default gen_random_uuid(),
  club_id           uuid not null references public.clubs(id) on delete cascade,
  name              text not null,
  type              public.tournament_type not null,
  sport             public.sport not null default 'tennis',
  format            public.tournament_format not null default 'singles',
  status            public.tournament_status not null default 'draft',
  starts_on         date,
  ends_on           date,
  registration_open boolean not null default false,
  rules_text        text,
  rules_pdf_path    text,
  -- Reglas de puntuación, ascensos, bonus, plazos… Ver lib/tournaments/config.ts
  -- (CLAUDE.md §5). Se valida con Zod en el servidor, no aquí.
  config            jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint tournaments_dates check (ends_on is null or starts_on is null or starts_on <= ends_on),
  unique (id, club_id)
);
create index tournaments_club_status_idx on public.tournaments(club_id, status);
create trigger tournaments_set_updated_at before update on public.tournaments
  for each row execute function public.set_updated_at();

-- Participante de un torneo. En singles es un jugador; en Fase 2 (dobles)
-- llevará `partner_id`. Todo lo competitivo (grupos, partidos, tablas)
-- apunta al entry, no al jugador.
create table public.tournament_entries (
  id            uuid primary key default gen_random_uuid(),
  club_id       uuid not null,
  tournament_id uuid not null,
  player_id     uuid not null,
  status        public.entry_status not null default 'pending',
  seed          integer,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (tournament_id, player_id),
  unique (id, club_id),
  unique (id, tournament_id),
  foreign key (tournament_id, club_id) references public.tournaments(id, club_id) on delete cascade,
  -- El jugador debe ser del mismo club que el torneo.
  foreign key (player_id, club_id) references public.profiles(id, club_id) on delete cascade
);
create index tournament_entries_player_idx on public.tournament_entries(player_id);
create trigger tournament_entries_set_updated_at before update on public.tournament_entries
  for each row execute function public.set_updated_at();

-- Ronda / jornada. En la escalera, 1 ronda = 1 mes.
create table public.rounds (
  id               uuid primary key default gen_random_uuid(),
  club_id          uuid not null,
  tournament_id    uuid not null,
  number           integer not null check (number > 0),
  name             text not null,
  starts_on        date not null,
  ends_on          date not null,
  results_deadline timestamptz not null,
  status           public.round_status not null default 'draft',
  published_at     timestamptz,
  closed_at        timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint rounds_dates check (starts_on <= ends_on),
  unique (tournament_id, number),
  unique (id, club_id),
  unique (id, tournament_id),
  foreign key (tournament_id, club_id) references public.tournaments(id, club_id) on delete cascade
);
create index rounds_status_deadline_idx on public.rounds(status, results_deadline); -- cron de cierre
create trigger rounds_set_updated_at before update on public.rounds
  for each row execute function public.set_updated_at();

-- Grupo dentro de una ronda. level 1 = el más alto de la escalera.
create table public.groups (
  id         uuid primary key default gen_random_uuid(),
  club_id    uuid not null,
  round_id   uuid not null,
  level      integer not null check (level > 0),
  name       text not null,
  created_at timestamptz not null default now(),
  unique (round_id, level),
  unique (id, club_id),
  unique (id, round_id),
  foreign key (round_id, club_id) references public.rounds(id, club_id) on delete cascade
);

-- Integrantes del grupo. `round_id` está para el UNIQUE: un entry juega en un
-- solo grupo por ronda. `tournament_id` para que el entry sea del torneo de la
-- ronda (las dos FK compuestas lo atan).
create table public.group_members (
  club_id       uuid not null,
  tournament_id uuid not null,
  round_id      uuid not null,
  group_id      uuid not null,
  entry_id      uuid not null,
  position      integer,                -- orden de siembra dentro del grupo
  primary key (group_id, entry_id),
  unique (round_id, entry_id),
  foreign key (group_id, round_id) references public.groups(id, round_id) on delete cascade,
  foreign key (round_id, tournament_id) references public.rounds(id, tournament_id) on delete cascade,
  foreign key (entry_id, tournament_id) references public.tournament_entries(id, tournament_id) on delete cascade,
  foreign key (group_id, club_id) references public.groups(id, club_id) on delete cascade
);
create index group_members_entry_idx on public.group_members(entry_id);

-- ═════════════════════════════════ matches ═══════════════════════════════
create table public.matches (
  id               uuid primary key default gen_random_uuid(),
  club_id          uuid not null,
  tournament_id    uuid not null,
  round_id         uuid not null,
  group_id         uuid,
  entry_a          uuid not null,
  entry_b          uuid not null,
  status           public.match_status not null default 'pending',
  scheduled_at     timestamptz,           -- fecha acordada (de la propuesta aceptada)
  booking_token    uuid not null default gen_random_uuid(),
  winner_entry_id  uuid,
  -- {"sets": [[6,4],[3,6],[10,7]]}: juegos de A y B por set; el 3º puede ser
  -- match tie-break. Lo valida lib/tournaments/scoring.ts.
  score            jsonb,
  result_type      public.match_result_type,
  reported_by      uuid references public.profiles(id) on delete set null,
  reported_at      timestamptz,
  confirmed_by     uuid references public.profiles(id) on delete set null,
  confirmed_at     timestamptz,
  dispute_reason   text,
  admin_override_by uuid references public.profiles(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint matches_distinct_entries check (entry_a <> entry_b),
  constraint matches_winner_is_player check (winner_entry_id is null or winner_entry_id in (entry_a, entry_b)),
  constraint matches_confirmed_has_result check (
    status not in ('confirmed') or result_type is not null
  ),
  unique (id, club_id),
  foreign key (round_id, club_id) references public.rounds(id, club_id) on delete cascade,
  foreign key (round_id, tournament_id) references public.rounds(id, tournament_id) on delete cascade,
  foreign key (group_id, round_id) references public.groups(id, round_id) on delete cascade,
  foreign key (entry_a, tournament_id) references public.tournament_entries(id, tournament_id) on delete cascade,
  foreign key (entry_b, tournament_id) references public.tournament_entries(id, tournament_id) on delete cascade
);
create unique index matches_booking_token_idx on public.matches(booking_token);
create index matches_round_idx  on public.matches(round_id);
create index matches_group_idx  on public.matches(group_id);
create index matches_entry_a_idx on public.matches(entry_a);
create index matches_entry_b_idx on public.matches(entry_b);
create index matches_status_scheduled_idx on public.matches(status, scheduled_at); -- recordatorios
create trigger matches_set_updated_at before update on public.matches
  for each row execute function public.set_updated_at();

-- Propuestas de horario entre los dos jugadores. Sólo al ACEPTARSE se crea la
-- court_booking (regla de las bases: no se reserva sin confirmación del rival).
create table public.match_slot_proposals (
  id          uuid primary key default gen_random_uuid(),
  club_id     uuid not null,
  match_id    uuid not null,
  proposed_by uuid not null references public.profiles(id) on delete cascade,
  court_id    uuid not null,
  start_at    timestamptz not null,
  end_at      timestamptz not null,
  status      public.proposal_status not null default 'proposed',
  responded_at timestamptz,
  created_at  timestamptz not null default now(),
  constraint match_slot_proposals_time_order check (start_at < end_at),
  foreign key (match_id, club_id) references public.matches(id, club_id) on delete cascade,
  foreign key (court_id, club_id) references public.courts(id, club_id) on delete cascade
);
create index match_slot_proposals_match_idx on public.match_slot_proposals(match_id, status);

-- ══════════════════════════════ court_bookings ═══════════════════════════
-- MVP: sólo reservas ligadas a un partido de torneo (match_id obligatorio).
-- En Fase 2 (reservas libres) match_id pasará a ser opcional.
create table public.court_bookings (
  id         uuid primary key default gen_random_uuid(),
  club_id    uuid not null,
  court_id   uuid not null,
  match_id   uuid not null,
  start_at   timestamptz not null,
  end_at     timestamptz not null,
  status     public.booking_status not null default 'confirmed',
  booked_by  uuid references public.profiles(id) on delete set null,
  cancelled_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint court_bookings_time_order check (start_at < end_at),
  foreign key (court_id, club_id) references public.courts(id, club_id) on delete cascade,
  foreign key (match_id, club_id) references public.matches(id, club_id) on delete cascade,
  -- Anti-doble-reserva a nivel DB: sin solapes en una misma cancha.
  constraint court_bookings_no_overlap exclude using gist (
    court_id with =,
    tstzrange(start_at, end_at) with &&
  ) where (status = 'confirmed')
);
-- Un partido tiene como mucho una reserva vigente.
create unique index court_bookings_one_per_match_idx
  on public.court_bookings(match_id) where status = 'confirmed';
create index court_bookings_club_time_idx on public.court_bookings(club_id, start_at);
create trigger court_bookings_set_updated_at before update on public.court_bookings
  for each row execute function public.set_updated_at();

-- Una reserva no puede caer en un bloqueo del admin. Error RC409 para que la
-- app lo distinga del 23P01 del EXCLUDE (solape con otra reserva).
create or replace function public.guard_booking_vs_blocks()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status <> 'confirmed' then
    return new;
  end if;
  if exists (
    select 1 from public.court_blocks b
    where b.club_id = new.club_id
      and (b.court_id is null or b.court_id = new.court_id)
      and tstzrange(b.start_at, b.end_at) && tstzrange(new.start_at, new.end_at)
  ) then
    raise exception 'La cancha está bloqueada en ese horario'
      using errcode = 'RC409';
  end if;
  return new;
end;
$$;
create trigger court_bookings_guard_blocks
  before insert or update of court_id, start_at, end_at, status on public.court_bookings
  for each row execute function public.guard_booking_vs_blocks();

-- ═══════════════════════════ standings_snapshots ═════════════════════════
-- Tabla final de cada grupo, congelada al cerrar la ronda. Fuente de los
-- movimientos de la escalera, del historial y de los premios de temporada.
create table public.standings_snapshots (
  club_id       uuid not null,
  round_id      uuid not null,
  group_id      uuid not null,
  entry_id      uuid not null,
  position      integer not null check (position > 0),
  played        integer not null default 0,
  won           integer not null default 0,
  won_default   integer not null default 0,
  lost          integer not null default 0,
  lost_default  integer not null default 0,
  not_played    integer not null default 0,
  sets_won      integer not null default 0,
  sets_lost     integer not null default 0,
  games_won     integer not null default 0,
  games_lost    integer not null default 0,
  bonus         numeric(6,2) not null default 0,
  points        numeric(6,2) not null default 0,
  movement      public.group_movement,
  created_at    timestamptz not null default now(),
  primary key (round_id, entry_id),
  foreign key (group_id, round_id) references public.groups(id, round_id) on delete cascade,
  foreign key (group_id, club_id) references public.groups(id, club_id) on delete cascade,
  foreign key (entry_id, club_id) references public.tournament_entries(id, club_id) on delete cascade
);
create index standings_snapshots_entry_idx on public.standings_snapshots(entry_id);

-- ═══════════════════════════ notifications_log ═══════════════════════════
-- Trazabilidad + idempotencia. `dedupe_key` describe el aviso de forma única
-- (ej. "reminder:24h:{match_id}:{profile_id}"); sólo un envío exitoso por clave.
create table public.notifications_log (
  id          uuid primary key default gen_random_uuid(),
  club_id     uuid references public.clubs(id) on delete cascade,
  match_id    uuid references public.matches(id) on delete cascade,
  profile_id  uuid references public.profiles(id) on delete cascade,
  channel     public.notification_channel not null,
  type        text not null,
  dedupe_key  text not null,
  status      public.notification_status not null default 'pending',
  error       text,
  sent_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index notifications_log_match_idx on public.notifications_log(match_id);
create unique index notifications_log_dedupe_idx
  on public.notifications_log(dedupe_key, channel) where status = 'sent';

-- ═══════════════════════════ push_subscriptions ══════════════════════════
-- Una fila por dispositivo (Web Push). Ver lib/notifications/push.ts.
create table public.push_subscriptions (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid not null references public.profiles(id) on delete cascade,
  endpoint     text not null unique,
  p256dh       text not null,
  auth         text not null,
  user_agent   text,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index push_subscriptions_profile_idx on public.push_subscriptions(profile_id);
