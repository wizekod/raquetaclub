/**
 * Validación local de las migraciones, sin Docker ni proyecto Supabase.
 *
 * Levanta Postgres en WASM (PGlite), crea stubs mínimos de lo que aporta
 * Supabase (roles anon/authenticated/service_role, auth.users, auth.uid(),
 * storage.buckets/objects/foldername), aplica supabase/migrations/*.sql en
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
`);

for (const f of fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
  try { await db.exec(fs.readFileSync(path.join(dir, f), "utf8")); console.log("✓ aplicada", f); }
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
