/**
 * Validación local de las migraciones, sin Docker ni proyecto Supabase.
 *
 * Levanta Postgres en WASM (PGlite), crea stubs mínimos de lo que aporta
 * Supabase (roles anon/authenticated/service_role, auth.users, auth.uid(),
 * storage.buckets/objects/foldername, pg_cron, pg_net y Vault), aplica supabase/migrations/*.sql en
 * orden y comprueba el comportamiento: alta de usuarios, RLS por rol y club,
 * guardas de columnas, FK compuestas, anti-solape de reservas y storage.
 *
 * Uso:  npm run db:check
 *
 * No sustituye a la suite E2E de qa/ contra Supabase real (GoTrue, PostgREST,
 * Storage de verdad); sirve para detectar errores de SQL y de políticas en
 * segundos, antes de hacer `supabase db push`.
 */
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import fs from "node:fs";
import path from "node:path";

const dir = process.argv[2] ?? new URL("../migrations", import.meta.url).pathname;
const db = new PGlite({ extensions: { btree_gist, pgcrypto } });

// ── stubs de Supabase ─────────────────────────────────────────────
await db.exec(`
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema extensions; create schema auth; create schema storage;
create table auth.users (id uuid primary key default gen_random_uuid(), email text,
  raw_app_meta_data jsonb default '{}', raw_user_meta_data jsonb default '{}');
create table auth.sessions (id uuid primary key default gen_random_uuid(), user_id uuid references auth.users(id) on delete cascade);
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth, storage, extensions to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
create table storage.buckets (id text primary key, name text, public boolean,
  file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (bucket_id text, name text);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as
  $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'),1)-1] $$;
-- pg_cron / pg_net / Vault: sólo la superficie que usan las migraciones.
create schema cron; create schema net; create schema vault;
create table cron.job (jobname text primary key, schedule text, command text);
create function cron.schedule(n text, s text, c text) returns bigint language sql as
  $$ insert into cron.job values (n, s, c) on conflict (jobname) do update set schedule = s, command = c; select 1::bigint $$;
create function net.http_get(url text, headers jsonb, timeout_milliseconds int) returns bigint language sql as $$ select 1::bigint $$;
create table vault.decrypted_secrets (name text, decrypted_secret text);
`);

// PGlite no trae pg_cron ni pg_net: se quitan sus CREATE EXTENSION (los stubs de arriba los sustituyen).
const stripExtensions = (sql) => sql.replace(/create extension if not exists (pg_cron|pg_net)[^;]*;/gi, "");

for (const f of fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
  try { await db.exec(stripExtensions(fs.readFileSync(path.join(dir, f), "utf8"))); console.log("✓ aplicada", f); }
  catch (e) { console.log("✗", f, e.message); process.exit(1); }
}

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else fail++; console.log(`  ${c ? "✓" : "✗"} ${m}`); };
const reset = () => db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
const as = async (uid) => { await reset(); await db.exec(`select set_config('request.jwt.claim.sub', '${uid}', false); set role authenticated;`); };
const q = async (sql, params) => (await db.query(sql, params)).rows;
const err = async (sql, params) => { try { await db.query(sql, params); return null; } catch (e) { return e.code ?? e.message; } };

// ── datos ─────────────────────────────────────────────────────────
await reset();
const [clubA] = await q(`insert into clubs (slug, name) values ('match-point', 'Match Point') returning id`);
const [clubB] = await q(`insert into clubs (slug, name) values ('otro-club', 'Otro') returning id`);
const A = clubA.id, B = clubB.id;
const mk = async (email, app, user) => (await q(
  `insert into auth.users (email, raw_app_meta_data, raw_user_meta_data) values ($1, $2, $3) returning id`,
  [email, app ?? {}, user ?? {}]))[0].id;

console.log("\n# alta de usuarios (handle_new_user)");
const owner = await mk("owner@x.com");
const admin = await mk("admin@x.com", { invited_role: "club_admin", club_id: A });
const p1 = await mk("P1@x.com", {}, { club_id: A, first_name: "Ana", last_name: "Uno", phone: "33 1234 5678" });
const p2 = await mk("p2@x.com", {}, { club_id: A, first_name: "Beto", last_name: "Dos", phone: "+52 33 8765 4321" });
const p3 = await mk("p3@x.com", {}, { club_id: A, first_name: "Caro", last_name: "Tres" });
const pb = await mk("pb@x.com", {}, { club_id: B, first_name: "Bruno" });
const sneaky = await mk("sneaky@x.com", {}, { club_id: A, invited_role: "club_admin" });
const bogus = await mk("bogus@x.com", {}, { club_id: "no-es-uuid" });
const prof = async (id) => { await reset(); return (await q(`select role, club_id, email, phone_key, first_name from profiles where id=$1`, [id]))[0]; };
ok((await prof(owner)).role === "club_admin" && (await prof(owner)).club_id === null, "registro sin club → club_admin sin club");
ok((await prof(admin)).role === "club_admin" && (await prof(admin)).club_id === A, "invitación (app_metadata) → club_admin del club");
ok((await prof(p1)).role === "player" && (await prof(p1)).club_id === A, "autorregistro con club → player");
ok((await prof(p1)).email === "p1@x.com", "email copiado en minúsculas");
ok((await prof(p1)).phone_key === "+523312345678", "phone_key nacional → E.164 con lada del club");
ok((await prof(p2)).phone_key === "+523387654321", "phone_key internacional");
ok((await prof(sneaky)).role === "player", "invited_role en user_metadata se ignora");
ok((await prof(bogus)).role === "player" && (await prof(bogus)).club_id === null, "club_id basura → player sin club");
// GoTrue inserta el usuario y escribe app_metadata en un UPDATE posterior.
const gotrue = await mk("gotrue@x.com");
await q(`update auth.users set raw_app_meta_data = $2 where id=$1`, [gotrue, { provider: "email", invited_role: "club_admin", club_id: A }]);
ok((await prof(gotrue)).role === "club_admin" && (await prof(gotrue)).club_id === A, "invitación vía UPDATE (como GoTrue) → club_admin del club");
const gotrueP = await mk("gotrue-p@x.com");
await q(`update auth.users set raw_app_meta_data = $2 where id=$1`, [gotrueP, { invited_role: "player", club_id: A }]);
ok((await prof(gotrueP)).role === "player" && (await prof(gotrueP)).club_id === A, "invitación de jugador vía UPDATE");
await q(`update auth.users set raw_app_meta_data = $2 where id=$1`, [p1, { invited_role: "club_admin", club_id: B }]);
ok((await prof(p1)).role === "player" && (await prof(p1)).club_id === A, "una invitación no mueve a quien ya tiene club");
await q(`delete from auth.users where id in ($1, $2)`, [gotrue, gotrueP]);
await q(`update auth.users set email='ana@x.com' where id=$1`, [p1]);
ok((await prof(p1)).email === "ana@x.com", "cambio de correo se sincroniza");

console.log("\n# guardas y columnas");
await as(p1);
ok(await err(`select email from profiles`) === "42501", "jugador no lee profiles.email directo");
ok((await q(`select id from profiles`)).length === 5, "jugador ve los perfiles de su club (5 en A)");
ok(await err(`update profiles set role='club_admin' where id=$1`, [p1]) === "42501", "jugador no se cambia el rol");
ok(await err(`update profiles set status='inactive' where id=$1`, [p1]) === "42501", "jugador no se cambia el estado");
await q(`update profiles set first_name='Ana María' where id=$1`, [p1]);
ok((await prof(p1)).first_name === "Ana María", "jugador edita su nombre");
await as(p1);
await q(`update clubs set name='hack' where id=$1`, [A]);
await reset(); ok((await q(`select name from clubs where id=$1`, [A]))[0].name !== "hack", "jugador no toca el club (RLS: 0 filas)");
await as(admin);
ok(await err(`update clubs set plan_id=null, status='active' where id=$1`, [A]) === "42501", "admin no cambia status/plan del club");
await q(`update clubs set name='Match Point Academy' where id=$1`, [A]);
await q(`update profiles set status='inactive' where id=$1`, [p3]);
await reset(); ok((await q(`select status from profiles where id=$1`, [p3]))[0].status === "inactive", "admin da de baja a un jugador");
await q(`update profiles set status='active' where id=$1`, [p3]);

console.log("\n# canchas y torneos (RLS)");
await as(admin);
const [c1] = await q(`insert into courts (club_id, name) values ($1, 'Cancha 1') returning id`, [A]);
ok(await err(`insert into courts (club_id, name) values ($1, 'Intrusa')`, [B]) === "42501", "admin no crea canchas en otro club");
const [t] = await q(`insert into tournaments (club_id, name, type, status, registration_open) values ($1, 'Escalera 2027', 'ladder', 'registration', true) returning id`, [A]);
await as(p1);
ok(await err(`insert into courts (club_id, name) values ($1, 'X')`, [A]) === "42501", "jugador no crea canchas");
ok((await q(`select id from courts`)).length === 1, "jugador ve las canchas de su club");
ok(await err(`insert into tournament_entries (club_id, tournament_id, player_id, status) values ($1,$2,$3,'accepted')`, [A, t.id, p1]) === "42501", "jugador no se autoacepta");
ok(await err(`insert into tournament_entries (club_id, tournament_id, player_id) values ($1,$2,$3)`, [A, t.id, p2]) === "42501", "jugador no inscribe a otro");
const [e1] = await q(`insert into tournament_entries (club_id, tournament_id, player_id) values ($1,$2,$3) returning id`, [A, t.id, p1]);
ok(!!e1, "jugador se inscribe (pending)");
await as(pb);
ok((await q(`select id from tournaments`)).length === 0, "jugador de otro club no ve el torneo");
ok((await q(`select id from profiles`)).length === 1, "jugador de otro club no ve perfiles de A");
await reset();
ok(await err(`insert into tournament_entries (club_id, tournament_id, player_id) values ($1,$2,$3)`, [A, t.id, pb]) === "23503", "FK compuesta: jugador de B no entra a torneo de A");

console.log("\n# ronda, grupo, partido, reservas");
await as(admin);
await q(`update tournament_entries set status='accepted' where id=$1`, [e1.id]);
const [e2] = await q(`insert into tournament_entries (club_id, tournament_id, player_id, status) values ($1,$2,$3,'accepted') returning id`, [A, t.id, p2]);
const [r] = await q(`insert into rounds (club_id, tournament_id, number, name, starts_on, ends_on, results_deadline) values ($1,$2,1,'Febrero','2027-02-01','2027-02-28','2027-02-28 20:00Z') returning id`, [A, t.id]);
const [g] = await q(`insert into groups (club_id, round_id, level, name) values ($1,$2,1,'Grupo 1') returning id`, [A, r.id]);
await q(`insert into group_members (club_id, tournament_id, round_id, group_id, entry_id) values ($1,$2,$3,$4,$5),($1,$2,$3,$4,$6)`, [A, t.id, r.id, g.id, e1.id, e2.id]);
const [m] = await q(`insert into matches (club_id, tournament_id, round_id, group_id, entry_a, entry_b) values ($1,$2,$3,$4,$5,$6) returning id`, [A, t.id, r.id, g.id, e1.id, e2.id]);
await as(p1);
ok((await q(`select id from matches`)).length === 0, "ronda en borrador: el jugador no ve partidos");
ok((await q(`select id from rounds`)).length === 0, "ronda en borrador: el jugador no la ve");
await as(admin); await q(`update rounds set status='active' where id=$1`, [r.id]);
await as(p1);
ok((await q(`select id from matches`)).length === 1, "ronda publicada: el jugador ve su partido");
ok(await err(`update matches set status='confirmed', result_type='played' where id=$1`, [m.id]) === null && (await q(`select status from matches where id=$1`, [m.id]))[0].status === "pending", "jugador no escribe matches directo (0 filas)");
const contacts = await q(`select id, email, phone from profile_contacts order by email nulls last`);
ok(contacts.length === 2, "contactos: él mismo y su rival");
const rival = contacts.find((c) => c.id === p2);
ok(rival && rival.email === null && rival.phone, "del rival ve teléfono pero no correo");
ok(!contacts.find((c) => c.id === p3), "no ve el contacto de quien no es su rival");
await as(admin);
ok((await q(`select id from profile_contacts`)).length === 5, "admin ve contactos de todo su club");
await reset();
ok(await err(`insert into matches (club_id, tournament_id, round_id, entry_a, entry_b) values ($1,$2,$3,$4,$4)`, [A, t.id, r.id, e1.id]) === "23514", "partido contra sí mismo rechazado");

await as(admin);
await q(`insert into court_bookings (club_id, court_id, match_id, start_at, end_at) values ($1,$2,$3,'2027-02-05 15:00Z','2027-02-05 16:30Z')`, [A, c1.id, m.id]);
const [m2] = await q(`insert into matches (club_id, tournament_id, round_id, group_id, entry_a, entry_b) values ($1,$2,$3,$4,$6,$5) returning id`, [A, t.id, r.id, g.id, e1.id, e2.id]);
ok(await err(`insert into court_bookings (club_id, court_id, match_id, start_at, end_at) values ($1,$2,$3,'2027-02-05 16:00Z','2027-02-05 17:00Z')`, [A, c1.id, m2.id]) === "23P01", "solape en la misma cancha → 23P01");
await q(`insert into court_blocks (club_id, court_id, start_at, end_at, reason) values ($1, null, '2027-02-06 00:00Z', '2027-02-07 00:00Z', 'Evento del hotel')`, [A]);
ok(await err(`insert into court_bookings (club_id, court_id, match_id, start_at, end_at) values ($1,$2,$3,'2027-02-06 15:00Z','2027-02-06 16:00Z')`, [A, c1.id, m2.id]) === "RC409", "reserva en bloqueo → RC409");
ok(await err(`insert into court_bookings (club_id, court_id, match_id, start_at, end_at) values ($1,$2,$3,'2027-02-05 17:00Z','2027-02-05 18:00Z')`, [A, c1.id, m.id]) === "23505", "una sola reserva vigente por partido");
await as(p1);
ok(await err(`insert into court_bookings (club_id, court_id, match_id, start_at, end_at) values ($1,$2,$3,'2027-02-08 15:00Z','2027-02-08 16:00Z')`, [A, c1.id, m2.id]) === "42501", "jugador no reserva directo (irá por RPC)");

console.log("\n# storage");
await as(admin);
ok((await q(`select public.owns_media_path($1) v`, [`${A}/logos/x.png`]))[0].v === true, "admin escribe en la carpeta de su club");
ok((await q(`select public.owns_media_path($1) v`, [`${B}/logos/x.png`]))[0].v === false, "admin no escribe en otro club");
await as(p1);
ok((await q(`select public.owns_media_path($1) v`, [`${A}/avatars/${p1}/x.png`]))[0].v === true, "jugador sube su avatar");
ok((await q(`select public.owns_media_path($1) v`, [`${A}/avatars/${p2}/x.png`]))[0].v === false, "jugador no toca el avatar de otro");
ok((await q(`select public.owns_media_path($1) v`, [`basura/x.png`]))[0].v === false, "ruta basura → false sin error");

console.log("\n# anon");
await reset(); await db.exec(`set role anon`);
ok((await q(`select slug from clubs`)).length === 2, "anon ve clubes activos/trial");
ok((await q(`select name from tournaments`)).length === 1, "anon ve torneos no-borrador");
ok(await err(`select id from profiles`) === "42501", "anon no lee perfiles");
ok(await err(`select stripe_customer_id from clubs`) === "42501", "anon no lee columnas de facturación");
await reset();
ok((await q(`select count(*)::int n from subscription_plans`))[0].n === 2, "seed de planes");

console.log("\n# paso 2: lada y último admin");
await reset();
await q(`update clubs set phone_country_code='34' where id=$1`, [A]);
ok((await prof(p2)).phone_key === "+523387654321", "cambiar la lada no toca números internacionales");
ok((await prof(p1)).phone_key === "+343312345678", "cambiar la lada recalcula los nacionales");
await q(`update clubs set phone_country_code='52' where id=$1`, [A]);
ok((await prof(p1)).phone_key === "+523312345678", "y vuelve al restaurarla");
// `admin` es el único club_admin activo de A.
ok(await err(`update profiles set role='player' where id=$1`, [admin]) === "RC422", "no se puede quitar el rol al último admin (ni service_role)");
ok(await err(`update profiles set status='inactive' where id=$1`, [admin]) === "RC422", "no se puede dar de baja al último admin");
await q(`update profiles set role='club_admin' where id=$1`, [p3]);
await q(`update profiles set role='player' where id=$1`, [admin]);
ok((await prof(admin)).role === "player", "con otro admin activo, sí se puede");
await q(`update profiles set role='club_admin' where id=$1`, [admin]);
await q(`update profiles set role='player' where id=$1`, [p3]);
await as(admin);
// Rechazado por la guarda de último admin (RC422) o la de estado propio (42501).
ok(["RC422", "42501"].includes(await err(`update profiles set status='inactive' where id=$1`, [admin])), "un admin no se da de baja a sí mismo");

console.log("\n# paso 3: horario y bloqueos");
await as(admin);
await q(`select public.set_court_hours($1, $2)`, [c1.id, JSON.stringify([
  { day_of_week: 1, open_time: "07:00", close_time: "14:00" },
  { day_of_week: 1, open_time: "16:00", close_time: "22:00" },
  { day_of_week: 2, open_time: "07:00", close_time: "22:00" },
])]);
ok((await q(`select count(*)::int n from court_hours where court_id=$1`, [c1.id]))[0].n === 3, "set_court_hours guarda las franjas");
await q(`select public.set_court_hours($1, $2)`, [c1.id, JSON.stringify([{ day_of_week: 3, open_time: "08:00", close_time: "20:00" }])]);
ok((await q(`select count(*)::int n from court_hours where court_id=$1`, [c1.id]))[0].n === 1, "y reemplaza las anteriores");
ok(await err(`select public.set_court_hours($1, $2)`, [c1.id, JSON.stringify([
  { day_of_week: 1, open_time: "07:00", close_time: "14:00" },
  { day_of_week: 1, open_time: "13:00", close_time: "18:00" },
])]) === "23P01", "rechaza franjas encimadas el mismo día");
ok((await q(`select count(*)::int n from court_hours where court_id=$1`, [c1.id]))[0].n === 1, "y no deja el horario a medias (atómico)");
await as(p1);
ok(await err(`select public.set_court_hours($1, '[]')`, [c1.id]) === "42501", "un jugador no cambia horarios");
ok(await err(`select public.create_court_block($1, null, '2027-03-01Z', '2027-03-02Z', 'x')`, [A]) === "42501", "un jugador no crea bloqueos");

await as(admin);
await q(`update matches set status='scheduled', scheduled_at='2027-02-05 15:00Z' where id=$1`, [m.id]);
let res = (await q(`select public.create_court_block($1, $2, '2027-02-05 14:00Z', '2027-02-05 20:00Z', 'Evento privado') r`, [A, c1.id]))[0].r;
ok(res.conflicts === 1 && res.block_id === null, "bloqueo sobre un partido agendado: sólo avisa");
ok((await q(`select status from court_bookings where match_id=$1`, [m.id]))[0].status === "confirmed", "sin confirmar, la reserva sigue");
res = (await q(`select public.create_court_block($1, $2, '2027-02-05 14:00Z', '2027-02-05 20:00Z', 'Evento privado', true) r`, [A, c1.id]))[0].r;
ok(res.cancelled === 1 && res.block_id, "con confirmación cancela y crea el bloqueo");
const bk = (await q(`select status, cancelled_reason from court_bookings where match_id=$1`, [m.id]))[0];
ok(bk.status === "cancelled" && bk.cancelled_reason === "Evento privado", "la reserva queda cancelada con el motivo");
const mm = (await q(`select status, scheduled_at from matches where id=$1`, [m.id]))[0];
ok(mm.status === "pending" && mm.scheduled_at === null, "el partido vuelve a por agendar");
ok(await err(`select public.create_court_block($1, null, '2027-03-02Z', '2027-03-01Z', 'x')`, [A]) === "22007", "rechaza un bloqueo que termina antes de empezar");
await as(pb);
ok(await err(`select public.create_court_block($1, null, '2027-03-01Z', '2027-03-02Z', 'x')`, [A]) === "42501", "admin/jugador de otro club no bloquea");

console.log("\n# paso 4: grupos y publicación de rondas");
await as(admin);
ok(await err(`insert into rounds (club_id, tournament_id, number, name, starts_on, ends_on, results_deadline) values ($1,$2,2,'Marzo','2027-03-01','2027-03-31','2027-03-31 20:00Z')`, [A, t.id]) === "23505", "una sola ronda abierta por torneo");
const [t2] = await q(`insert into tournaments (club_id, name, type, status) values ($1, 'RR', 'round_robin', 'registration') returning id`, [A]);
const ent = async (pid, status) => (await q(`insert into tournament_entries (club_id, tournament_id, player_id, status) values ($1,$2,$3,$4) returning id`, [A, t2.id, pid, status]))[0].id;
const [x1, x2, x3, xp] = [await ent(p1, "accepted"), await ent(p2, "accepted"), await ent(p3, "accepted"), await ent(sneaky, "pending")];
const [r2] = await q(`insert into rounds (club_id, tournament_id, number, name, starts_on, ends_on, results_deadline) values ($1,$2,1,'Única','2027-02-01','2027-02-28','2027-02-28 20:00Z') returning id`, [A, t2.id]);
const groups = (gs) => JSON.stringify(gs.map((entries, i) => ({ level: i + 1, entries })));
const save = (gs) => q(`select public.save_round_groups($1, $2)`, [r2.id, groups(gs)]);
ok(await err(`select public.save_round_groups($1, $2)`, [r2.id, groups([[x1, xp]])]) === "22023", "no acepta inscripciones pendientes en un grupo");
await save([[x1, x2, x3]]);
ok((await q(`select count(*)::int n from group_members where round_id=$1`, [r2.id]))[0].n === 3, "save_round_groups guarda el grupo");
await save([[x2, x1], [x3]]);
const gm = await q(`select g.level, m.entry_id, m.position from group_members m join groups g on g.id=m.group_id where m.round_id=$1 order by g.level, m.position`, [r2.id]);
ok(gm.length === 3 && gm[0].entry_id === x2 && gm[0].position === 1 && gm[2].level === 2, "y los reemplaza, con la siembra en orden");
ok(await err(`select public.save_round_groups($1, $2)`, [r2.id, groups([[x1, x2], [x2, x3]])]) === "23505", "un jugador en dos grupos → rechazado");
ok(await err(`select public.publish_round($1)`, [r2.id]) === "55000", "no publica con un grupo de 1");
await as(p1);
ok(await err(`select public.save_round_groups($1, '[]')`, [r2.id]) === "42501", "un jugador no arma grupos");
ok(await err(`select public.publish_round($1)`, [r2.id]) === "42501", "un jugador no publica rondas");
await as(admin);
await save([[x1, x2, x3], []]);
ok((await q(`select public.publish_round($1) n`, [r2.id]))[0].n === 3, "publicar: grupo de 3 → 3 partidos");
ok((await q(`select count(*)::int n from groups where round_id=$1`, [r2.id]))[0].n === 1, "los grupos vacíos se eliminan al publicar");
const pub = (await q(`select r.status, t.status ts from rounds r join tournaments t on t.id=r.tournament_id where r.id=$1`, [r2.id]))[0];
ok(pub.status === "active" && pub.ts === "active", "la ronda queda activa y el torneo en curso");
ok((await q(`select count(*)::int n from matches where round_id=$1 and entry_a=$2`, [r2.id, x1]))[0].n === 2, "entry_a es el de mejor siembra");
ok(await err(`select public.save_round_groups($1, '[]')`, [r2.id]) === "55000", "una ronda publicada no cambia de grupos");
ok(await err(`select public.publish_round($1)`, [r2.id]) === "55000", "ni se publica dos veces");
await as(p1);
ok((await q(`select id from matches where round_id=$1`, [r2.id])).length === 3, "el jugador ve los partidos publicados");

console.log("\n# paso 5: link de partido");
// c1 abre los miércoles de 8:00 a 20:00 (hora de México). 3-feb-2027 es miércoles.
const local = (ts) => `${ts}-06:00`;
await reset();
const mAB = (await q(`select id from matches where round_id=$1 and $2 in (entry_a, entry_b) and $3 in (entry_a, entry_b)`, [r2.id, x1, x2]))[0].id;
const mAC = (await q(`select id from matches where round_id=$1 and $2 in (entry_a, entry_b) and $3 in (entry_a, entry_b)`, [r2.id, x1, x3]))[0].id;
const propose = (match, start) => q(`select public.propose_slot($1, $2, $3) id`, [match, c1.id, local(start)]).then((r) => r[0].id);
const perr = (match, start) => err(`select public.propose_slot($1, $2, $3)`, [match, c1.id, local(start)]);
await as(p3);
ok(await perr(mAB, "2027-02-03 10:00") === "42501", "quien no juega el partido no propone");
await as(p1);
ok(await err(`select public.my_entry_in_match(m) from matches m limit 1`) === "42501", "las funciones auxiliares no se llaman directo");
ok(await err(`insert into match_slot_proposals (club_id, match_id, proposed_by, court_id, start_at, end_at) values ($1,$2,$3,$4,'2027-02-03 16:00Z','2027-02-03 17:30Z')`, [A, mAB, p1, c1.id]) === "42501", "ni escribe propuestas directo");
ok(await perr(mAB, "2027-02-03 07:00") === "22023", "fuera del horario de la cancha → 22023");
ok(await perr(mAB, "2027-02-03 19:00") === "22023", "un partido de 90 min que pasa del cierre → 22023");
ok(await perr(mAB, "2027-03-03 10:00") === "22023", "fuera de la ronda → 22023");
ok(await perr(mAB, "2026-01-07 10:00") === "22023", "en el pasado → 22023");
const prop1 = await propose(mAB, "2027-02-03 10:00");
const pr = (await q(`select extract(epoch from end_at - start_at)::int s, status from match_slot_proposals where id=$1`, [prop1]))[0];
ok(pr.status === "proposed" && pr.s === 5400, "propuesta de 90 min por defecto");
ok(await err(`select public.respond_slot($1, true)`, [prop1]) === "42501", "no acepta su propia propuesta");
await as(p2);
await q(`select public.respond_slot($1, false)`, [prop1]);
ok((await q(`select status from match_slot_proposals where id=$1`, [prop1]))[0].status === "declined", "el rival rechaza");
ok(await err(`select public.respond_slot($1, true)`, [prop1]) === "55000", "una rechazada ya no se acepta");
await as(p1);
const prop2 = await propose(mAB, "2027-02-03 10:00");
const prop3 = await propose(mAB, "2027-02-03 12:00");
await as(p2);
const booking = (await q(`select public.respond_slot($1, true) id`, [prop2]))[0].id;
await reset();
const mab = (await q(`select status, scheduled_at from matches where id=$1`, [mAB]))[0];
ok(booking && mab.status === "scheduled" && new Date(mab.scheduled_at).toISOString() === "2027-02-03T16:00:00.000Z", "al aceptar: reserva y partido agendado");
ok((await q(`select status from match_slot_proposals where id=$1`, [prop3]))[0].status === "expired", "las demás propuestas caducan");
await as(p1);
ok(await perr(mAB, "2027-02-03 14:00") === "55000", "un partido agendado no recibe propuestas");
const propC = await propose(mAC, "2027-02-03 11:00").catch(() => null);
ok(propC === null && (await perr(mAC, "2027-02-03 11:00")) === "23P01", "no propone sobre una cancha ya apartada (23P01)");
const propC2 = await propose(mAC, "2027-02-03 14:00");
await as(admin);
await q(`insert into court_blocks (club_id, court_id, start_at, end_at, reason) values ($1,$2,$3,$4,'Torneo hotel')`, [A, c1.id, local("2027-02-03 13:00"), local("2027-02-03 18:00")]);
await as(p3);
ok(await err(`select public.respond_slot($1, true)`, [propC2]) === "RC409", "al aceptar revalida: la cancha se bloqueó → RC409");
await as(p1);
for (const h of ["08:00", "11:30"]) await propose(mAC, `2027-02-03 ${h}`);
ok(await perr(mAC, "2027-02-03 18:30") === "55000", "máximo 3 propuestas pendientes por jugador");
await as(p3);
const pend = (await q(`select id from match_slot_proposals where match_id=$1 and status='proposed' limit 1`, [mAC]))[0].id;
ok(await err(`select public.withdraw_slot($1)`, [pend]) === "42501", "no retira propuestas del rival");
await as(p1);
await q(`select public.withdraw_slot($1)`, [pend]);
ok((await q(`select status from match_slot_proposals where id=$1`, [pend]))[0].status === "withdrawn", "quien propuso la retira");
await as(p3);
ok(await err(`select public.cancel_match_booking($1, 'x')`, [mAB]) === "42501", "un tercero no cancela la reserva");
await as(p2);
await q(`select public.cancel_match_booking($1, 'Me lesioné')`, [mAB]);
await reset();
ok((await q(`select status from matches where id=$1`, [mAB]))[0].status === "pending"
   && (await q(`select status, cancelled_reason from court_bookings where id=$1`, [booking]))[0].cancelled_reason === "Me lesioné", "el jugador cancela: partido por agendar y reserva cancelada");
await as(admin);
ok(await err(`select public.cancel_match_booking($1, null)`, [mAB]) === "55000", "no cancela lo que no está agendado");

console.log("\n# paso 6: resultados y cierre");
await reset();
const sw = async (sets, tb = true) => (await q(`select public.score_winner($1, $2) w`, [JSON.stringify({ sets }), tb]))[0].w;
ok(await sw([[6, 4], [7, 5]]) === "a" && await sw([[4, 6], [6, 3], [8, 10]]) === "b" && await sw([[7, 6], [6, 7], [12, 10]]) === "a", "score_winner: 2-0 y 2-1 con TB a 10");
ok(await sw([[6, 5], [6, 0]]) === null && await sw([[6, 4], [6, 4], [6, 4]]) === null && await sw([[6, 4], [4, 6], [10, 9]]) === null
   && await sw([[6.5, 4], [6, 4]]) === null && await sw([[6, 4], [4, 6]]) === null, "score_winner rechaza marcadores imposibles");
ok(await sw([[6, 4], [4, 6], [7, 5]], false) === "a" && await sw([[6, 4], [4, 6], [10, 8]], false) === null, "3.er set completo si no hay TB");
const mBC = (await q(`select id from matches where round_id=$1 and $2 in (entry_a, entry_b) and $3 in (entry_a, entry_b)`, [r2.id, x2, x3]))[0].id;
const ab = (await q(`select entry_a from matches where id=$1`, [mAB]))[0];
ok(ab.entry_a === x1, "(mAB: Ana es entry_a)");
const win = JSON.stringify({ sets: [[6, 4], [6, 3]] }); // gana A (Ana)
await as(p3);
ok(await err(`select public.report_result($1, 'played', $2)`, [mAB, win]) === "42501", "quien no juega no reporta");
await as(p2);
ok(await err(`select public.report_result($1, 'played', $2)`, [mAB, win]) === "22023", "el perdedor no sube el resultado");
await as(p1);
ok(await err(`select public.report_result($1, 'played', $2)`, [mAB, JSON.stringify({ sets: [[6, 4], [6, 5]] })]) === "22023", "marcador imposible → 22023");
await q(`select public.report_result($1, 'played', $2)`, [mAB, win]);
await reset();
const rep = (await q(`select status, winner_entry_id, result_type, reported_by from matches where id=$1`, [mAB]))[0];
ok(rep.status === "reported" && rep.winner_entry_id === x1 && rep.result_type === "played" && rep.reported_by === p1, "el ganador reporta: queda por confirmar");
await as(p1);
ok(await err(`select public.confirm_result($1)`, [mAB]) === "42501", "no confirma su propio resultado");
ok(await err(`select public.report_result($1, 'played', $2)`, [mAB, win]) === "55000", "no reporta dos veces");
await as(p2);
ok(await err(`select public.dispute_result($1, '  ')`, [mAB]) === "22023", "disputar pide motivo");
await q(`select public.dispute_result($1, 'Fue 6-4 4-6 10-8')`, [mAB]);
await reset();
ok((await q(`select status from matches where id=$1`, [mAB]))[0].status === "disputed", "el rival lo disputa");
await as(p3);
await q(`select public.report_result($1, 'default', null)`, [mAC]);
await as(p1);
await q(`select public.confirm_result($1)`, [mAC]);
await reset();
const mac = (await q(`select status, result_type, winner_entry_id, score from matches where id=$1`, [mAC]))[0];
ok(mac.status === "confirmed" && mac.result_type === "default" && mac.winner_entry_id === x3 && mac.score === null, "default reclamado y confirmado por el rival");

const g2 = (await q(`select id from groups where round_id=$1`, [r2.id]))[0].id;
const snap = (entry, position) => ({ group_id: g2, entry_id: entry, position, played: 0, won: 0, won_default: 0, lost: 0, lost_default: 0, not_played: 0, sets_won: 0, sets_lost: 0, games_won: 0, games_lost: 0, bonus: 0, points: 0, movement: "stay" });
const closeArgs = [r2.id, JSON.stringify([snap(x3, 1), snap(x1, 2), snap(x2, 3)]), [x2], JSON.stringify({ number: 2, name: "Marzo", starts_on: "2027-03-01", ends_on: "2027-03-31", results_deadline: "2027-03-31T20:00:00Z", groups: [{ level: 1, entries: [x3, x1] }] }), false];
const close = () => q(`select public.close_round($1, $2, $3, $4, $5) id`, closeArgs);
await as(p1);
ok(await err(`select public.close_round($1, $2, $3, $4, $5)`, closeArgs) === "42501", "un jugador no cierra rondas");
await as(admin);
ok(await err(`select public.close_round($1, $2, $3, $4, $5)`, closeArgs) === "55000", "no cierra con disputas abiertas");
await q(`update matches set status='confirmed', result_type='played', winner_entry_id=$2, score=$3, admin_override_by=$4 where id=$1`, [mAB, x2, JSON.stringify({ sets: [[4, 6], [6, 4], [8, 10]] }), admin]);
const next = (await close())[0].id;
await reset();
const st = Object.fromEntries((await q(`select id, status, result_type from matches where round_id=$1`, [r2.id])).map((m) => [m.id, m]));
ok(st[mBC].status === "not_played" && st[mBC].result_type === "not_played", "lo que no tiene resultado queda como no jugado");
ok((await q(`select count(*)::int n from standings_snapshots where round_id=$1`, [r2.id]))[0].n === 3, "se guardan las tablas");
ok((await q(`select status from tournament_entries where id=$1`, [x2]))[0].status === "expelled", "baja por inactividad");
const rr2 = (await q(`select status, closed_at from rounds where id=$1`, [r2.id]))[0];
const nr = (await q(`select number, status from rounds where id=$1`, [next]))[0];
ok(rr2.status === "closed" && nr.number === 2 && nr.status === "draft", "ronda cerrada y la siguiente en borrador");
ok((await q(`select count(*)::int n from group_members where round_id=$1`, [next]))[0].n === 2, "con sus grupos");
await as(admin);
ok(await err(`select public.close_round($1, $2, $3, $4, $5)`, closeArgs) === "55000", "no se cierra dos veces");

console.log("\n# paso 8: cron");
await reset(); await db.exec(`set role service_role`);
ok(await err(`select public.save_round_groups($1, $2)`, [next, JSON.stringify([{ level: 1, entries: [x1, x3] }])]) === null, "service_role (cron) puede rearmar grupos");
await reset();
ok((await q(`select schedule from cron.job where jobname='raquetaclub-tick'`))[0]?.schedule === "*/30 * * * *", "job de pg_cron cada 30 min");
await db.exec(`set role authenticated`);
ok(await err(`select private.call_tick_cron()`) === "42501", "authenticated no dispara el cron");
await reset();
await q(`select private.call_tick_cron()`);
ok(true, "sin secretos en Vault el job no hace nada (no falla)");

console.log("\n# paso 9: límites del plan");
await reset();
const [mini] = await q(`insert into subscription_plans (name, max_players, max_active_tournaments) values ('Mini', 2, 1) returning id`);
const [clubC] = await q(`insert into clubs (slug, name, plan_id) values ('club-c', 'C', $1) returning id`, [mini.id]);
const C = clubC.id;
const adminC = await mk("adminc@x.com", { invited_role: "club_admin", club_id: C });
const c1p = await mk("c1@x.com", {}, { club_id: C, first_name: "Uno" });
const c2p = await mk("c2@x.com", {}, { club_id: C, first_name: "Dos" });
ok(await err(`insert into auth.users (email, raw_user_meta_data) values ('c3@x.com', $1)`, [{ club_id: C }]) === "RC402", "autorregistro: no pasa del límite de jugadores");
ok(await err(`insert into auth.users (email, raw_app_meta_data) values ('adminc2@x.com', $1)`, [{ invited_role: "club_admin", club_id: C }]) === null, "los admins no cuentan para el límite");
await as(adminC);
await q(`update profiles set status='inactive' where id=$1`, [c2p]);
await reset();
const c3p = await mk("c3b@x.com", {}, { club_id: C, first_name: "Tres" });
ok((await q(`select club_id from profiles where id=$1`, [c3p]))[0].club_id === C, "con un lugar libre, entra");
await as(adminC);
ok(await err(`update profiles set status='active' where id=$1`, [c2p]) === "RC402", "reactivar también respeta el límite");
ok(await err(`update profiles set first_name='Uno bis' where id=$1`, [c1p]) === null, "editar a un jugador que ya cuenta no choca");
await reset(); await db.exec(`set role service_role`);
ok(await err(`update profiles set role='player' where email='adminc2@x.com'`) === "RC402", "pasar un admin a jugador respeta el límite (también service_role)");
await as(adminC);
const [tc] = await q(`insert into tournaments (club_id, name, type) values ($1, 'T1', 'ladder') returning id`, [C]);
ok(await err(`insert into tournaments (club_id, name, type) values ($1, 'T2', 'ladder')`, [C]) === "RC402", "no pasa del límite de torneos sin finalizar");
await q(`update tournaments set status='finished' where id=$1`, [tc.id]);
ok(await err(`insert into tournaments (club_id, name, type) values ($1, 'T2', 'ladder')`, [C]) === null, "los finalizados no cuentan");
ok(await err(`update tournaments set status='active' where id=$1`, [tc.id]) === "RC402", "reabrir un finalizado respeta el límite");
await reset();
await q(`update subscription_plans set max_players=null where id=$1`, [mini.id]);
await as(adminC);
ok(await err(`update profiles set status='active' where id=$1`, [c2p]) === null, "con el plan sin límite, entra");

console.log("\n# paso 9: club suspendido");
await reset();
await q(`update clubs set status='suspended' where id=$1`, [C]);
await as(adminC);
ok((await q(`select id from clubs where id=$1`, [C])).length === 0, "su admin ya no ve el club");
ok((await q(`select id from tournaments where club_id=$1`, [C])).length === 0, "ni sus torneos");
ok((await q(`update tournaments set name='x' where club_id=$1 returning id`, [C])).length === 0, "ni los edita");
ok((await q(`select id from profiles where id=$1`, [adminC])).length === 1, "pero lee su propio perfil (para mostrar el aviso)");
await as(c1p);
ok((await q(`select id from tournaments where club_id=$1`, [C])).length === 0, "sus jugadores tampoco ven nada");
await as(p1);
ok((await q(`select id from clubs where id=$1`, [A])).length === 1, "los demás clubes siguen igual");
await reset();
await q(`update clubs set status='active' where id=$1`, [C]);
await as(adminC);
ok((await q(`select id from tournaments where club_id=$1`, [C])).length === 2, "al reactivarlo vuelve todo");

console.log("\n# sesiones");
await reset();
await q(`insert into auth.sessions (user_id) values ($1), ($1)`, [p1]);
await db.exec(`set role authenticated`);
ok(await err(`select public.revoke_user_sessions($1)`, [p1]) === "42501", "authenticated no puede cerrar sesiones ajenas");
await reset(); await db.exec(`set role service_role`);
await q(`select public.revoke_user_sessions($1)`, [p1]);
await reset();
ok((await q(`select count(*)::int n from auth.sessions where user_id=$1`, [p1]))[0].n === 0, "service_role cierra las sesiones del usuario");

console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
