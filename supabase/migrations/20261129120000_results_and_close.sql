-- ═══════════════════════════════════════════════════════════════════════════
-- Paso 6: resultados y cierre de ronda.
--
--   report_result(match, result, score)  el GANADOR sube el marcador (o reclama
--                                        un default); queda "por confirmar"
--   confirm_result(match)                el rival lo confirma
--   dispute_result(match, reason)        o lo disputa (lo resuelve el admin)
--   close_round(...)                     admin: cierre atómico de la ronda
--
-- Las correcciones del admin (marcador, DEF, no jugado, reabrir) van por
-- UPDATE directo con su RLS (`matches_manage`), validadas en el servidor con
-- lib/tournaments/scoring.ts. `score_winner` replica esa validación en SQL
-- para que un jugador no pueda guardar un marcador imposible por la API.
-- ═══════════════════════════════════════════════════════════════════════════

set search_path = public, extensions;

-- 'a' | 'b' si el marcador es válido; null si no. Mismas reglas que
-- validateScore: 2 o 3 sets; set normal 6-0…6-4, 7-5, 7-6; 3.er set como
-- match tie-break a 10 por 2 (p_tb10) o set normal; nada después de 2 sets ganados.
create or replace function public.score_winner(p_score jsonb, p_tb10 boolean)
returns text
language plpgsql immutable
set search_path = public
as $$
declare
  v_sets jsonb := p_score -> 'sets';
  v_n    int;
  v_a    int := 0;
  v_b    int := 0;
  x int; y int; hi int; lo int;
  ok boolean;
begin
  if v_sets is null or jsonb_typeof(v_sets) <> 'array' then return null; end if;
  v_n := jsonb_array_length(v_sets);
  if v_n not in (2, 3) then return null; end if;
  for i in 0 .. v_n - 1 loop
    if v_a = 2 or v_b = 2 then return null; end if;
    if jsonb_typeof(v_sets -> i) <> 'array' or jsonb_array_length(v_sets -> i) <> 2
       or jsonb_typeof(v_sets -> i -> 0) <> 'number' or jsonb_typeof(v_sets -> i -> 1) <> 'number' then
      return null;
    end if;
    x := (v_sets -> i ->> 0)::numeric;
    y := (v_sets -> i ->> 1)::numeric;
    if x < 0 or y < 0 or x::numeric <> (v_sets -> i ->> 0)::numeric or y::numeric <> (v_sets -> i ->> 1)::numeric then
      return null;
    end if;
    hi := greatest(x, y); lo := least(x, y);
    if i = 2 and p_tb10 then
      ok := (hi = 10 and lo <= 8) or (hi > 10 and hi - lo = 2);
    else
      ok := (hi = 6 and lo <= 4) or (hi = 7 and lo in (5, 6));
    end if;
    if not ok then return null; end if;
    if x > y then v_a := v_a + 1; else v_b := v_b + 1; end if;
  end loop;
  if v_a = 2 then return 'a'; end if;
  if v_b = 2 then return 'b'; end if;
  return null;
end;
$$;
grant execute on function public.score_winner(jsonb, boolean) to authenticated, service_role;

-- ─────────────────────────────── report_result ──────────────────────────
-- p_result: 'played' (con marcador) o 'default' (el rival no se presentó).
create or replace function public.report_result(p_match uuid, p_result text, p_score jsonb)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  m       public.matches%rowtype;
  v_entry uuid;
  v_round public.rounds%rowtype;
  v_tb10  boolean;
  v_side  text;
begin
  m := public.lock_open_match(p_match);
  v_entry := public.my_entry_in_match(m);
  if v_entry is null then
    raise exception 'No juegas este partido' using errcode = '42501';
  end if;
  if m.status not in ('pending', 'scheduled') then
    raise exception 'Este partido ya tiene resultado' using errcode = '55000';
  end if;
  select * into v_round from public.rounds where id = m.round_id;
  if now() > v_round.results_deadline then
    raise exception 'Ya pasó la fecha límite de resultados: habla con el administrador' using errcode = '55000';
  end if;
  if m.status = 'scheduled' and m.scheduled_at > now() then
    raise exception 'El partido aún no se juega' using errcode = '55000';
  end if;

  if p_result = 'played' then
    select coalesce(t.config -> 'match_format' ->> 'third_set', 'match_tiebreak_10') = 'match_tiebreak_10'
      into v_tb10 from public.tournaments t where t.id = m.tournament_id;
    v_side := public.score_winner(p_score, v_tb10);
    if v_side is null then
      raise exception 'Marcador no válido' using errcode = '22023';
    end if;
    if (v_side = 'a' and m.entry_a <> v_entry) or (v_side = 'b' and m.entry_b <> v_entry) then
      raise exception 'El resultado lo sube quien ganó: si perdiste, espera a que tu rival lo suba y confírmalo' using errcode = '22023';
    end if;
  elsif p_result = 'default' then
    p_score := null;
  else
    raise exception 'Tipo de resultado no válido' using errcode = '22023';
  end if;

  update public.matches
  set status = 'reported',
      result_type = p_result::public.match_result_type,
      winner_entry_id = v_entry,
      score = p_score,
      reported_by = (select auth.uid()),
      reported_at = now(),
      dispute_reason = null
  where id = m.id;
end;
$$;

-- ─────────────────────────── confirm / dispute ──────────────────────────
create or replace function public.confirm_result(p_match uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  m public.matches%rowtype;
begin
  m := public.lock_open_match(p_match);
  if public.my_entry_in_match(m) is null then
    raise exception 'No juegas este partido' using errcode = '42501';
  end if;
  if m.status <> 'reported' then
    raise exception 'No hay un resultado por confirmar' using errcode = '55000';
  end if;
  if m.reported_by = (select auth.uid()) then
    raise exception 'El resultado lo tiene que confirmar tu rival' using errcode = '42501';
  end if;
  update public.matches
  set status = 'confirmed', confirmed_by = (select auth.uid()), confirmed_at = now()
  where id = m.id;
end;
$$;

create or replace function public.dispute_result(p_match uuid, p_reason text)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  m public.matches%rowtype;
begin
  m := public.lock_open_match(p_match);
  if public.my_entry_in_match(m) is null then
    raise exception 'No juegas este partido' using errcode = '42501';
  end if;
  if m.status <> 'reported' then
    raise exception 'No hay un resultado por confirmar' using errcode = '55000';
  end if;
  if m.reported_by = (select auth.uid()) then
    raise exception 'No puedes disputar tu propio resultado' using errcode = '42501';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'Explica qué está mal en el resultado' using errcode = '22023';
  end if;
  update public.matches
  set status = 'disputed', dispute_reason = left(trim(p_reason), 500)
  where id = m.id;
end;
$$;

revoke all on function
  public.report_result(uuid, text, jsonb),
  public.confirm_result(uuid),
  public.dispute_result(uuid, text)
from public, anon;
grant execute on function
  public.report_result(uuid, text, jsonb),
  public.confirm_result(uuid),
  public.dispute_result(uuid, text)
to authenticated, service_role;

-- ─────────────────────────────── close_round ────────────────────────────
-- Las tablas y los movimientos los calcula el motor (lib/tournaments) en el
-- servidor; esto sólo los guarda, todo o nada:
--   1. Con disputas abiertas no se cierra.
--   2. "Por confirmar" → confirmado (se entregó a tiempo); sin resultado →
--      no jugado (bases: "de lo contrario se marcará como partido no jugado").
--   3. standings_snapshots, bajas por inactividad, ronda cerrada.
--   4. Siguiente ronda en borrador con sus grupos (p_next) o torneo finalizado.
-- p_snapshots: [{group_id, entry_id, position, played, won, won_default, lost,
--   lost_default, not_played, sets_won, sets_lost, games_won, games_lost,
--   bonus, points, movement}]
-- p_next: {number, name, starts_on, ends_on, results_deadline, groups: [{level, entries}]} | null
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
  if r.id is null or not public.can_manage_club(r.club_id) then
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

revoke all on function public.close_round(uuid, jsonb, uuid[], jsonb, boolean) from public, anon;
grant execute on function public.close_round(uuid, jsonb, uuid[], jsonb, boolean) to authenticated, service_role;
