/**
 * Paso 10 de la Fase 1: revisión de seguridad contra el Supabase real
 * (PostgREST + RLS + Storage), con los tokens de cada rol:
 *  - anónimo: no lee nada privado ni ejecuta RPCs;
 *  - jugador de otro club: no ve ni toca nada del club ajeno;
 *  - jugador del partido: sólo cambia el partido por las RPCs, nunca directo;
 *    no toca columnas privilegiadas ni los helpers internos;
 *  - admin: gestiona su club, no otro ni su plan.
 *
 *   ./qa/run.sh seguridad
 */
import { rest, insert, deleteUser, deleteClub, login, asUser, ok, section, summary, RUN, URL_BASE } from "./lib.mjs";
import { makeUser } from "./app.mjs";

const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const anon = (path, init = {}) =>
  fetch(`${URL_BASE}/rest/v1/${path}`, { ...init, headers: { apikey: ANON, "Content-Type": "application/json", ...(init.headers ?? {}) } });
const slugA = `qa-sega-${RUN}`;
const slugB = `qa-segb-${RUN}`;
const created = [];
const rows = async (res) => {
  const body = await res.json().catch(() => null);
  return Array.isArray(body) ? body : null;
};
const post = (fn, args) => ({ method: "POST", body: JSON.stringify(args) });
const write = (method, body) => ({ method, body: JSON.stringify(body), headers: { Prefer: "return=representation" } });
/** Escritura rechazada: error HTTP, o 0 filas afectadas (la RLS las oculta). */
const denied = async (res) => !res.ok || (await rows(res))?.length === 0;

try {
  const clubA = await insert("clubs", { slug: slugA, name: `Seg A ${RUN}`, status: "active" });
  const clubB = await insert("clubs", { slug: slugB, name: `Seg B ${RUN}`, status: "active" });
  const user = async (tag, meta) => {
    const email = `qa-seg${tag}-${RUN}@example.com`;
    const id = await makeUser(email, meta);
    created.push(id);
    return { id, as: asUser((await login(email)).access_token) };
  };
  const adminA = await user("adm", { app: { invited_role: "club_admin", club_id: clubA.id } });
  const a1 = await user("a1", { user: { club_id: clubA.id, first_name: "Ana", phone: "3311111111" } });
  const a2 = await user("a2", { user: { club_id: clubA.id, first_name: "Beto", phone: "3322222222" } });
  const a3 = await user("a3", { user: { club_id: clubA.id, first_name: "Caro", phone: "3333333333" } });
  const b1 = await user("b1", { user: { club_id: clubB.id, first_name: "Otro" } });

  // Un partido en curso entre a1 y a2.
  const court = await insert("courts", { club_id: clubA.id, name: "Central" });
  const t = await insert("tournaments", { club_id: clubA.id, name: "Seg", type: "ladder", status: "active" });
  const e1 = await insert("tournament_entries", { club_id: clubA.id, tournament_id: t.id, player_id: a1.id, status: "accepted" });
  const e2 = await insert("tournament_entries", { club_id: clubA.id, tournament_id: t.id, player_id: a2.id, status: "accepted" });
  const round = await insert("rounds", { club_id: clubA.id, tournament_id: t.id, number: 1, name: "R1", starts_on: "2026-01-01", ends_on: "2030-12-31", results_deadline: "2030-12-31T20:00:00Z", status: "active" });
  const group = await insert("groups", { club_id: clubA.id, round_id: round.id, level: 1, name: "Grupo 1" });
  const match = await insert("matches", { club_id: clubA.id, tournament_id: t.id, round_id: round.id, group_id: group.id, entry_a: e1.id, entry_b: e2.id });
  await insert("notifications_log", { club_id: clubA.id, profile_id: a1.id, channel: "email", type: "qa", dedupe_key: `qa-seg-${RUN}`, status: "skipped" });
  const score = { sets: [[6, 1], [6, 1]] };

  section("anónimo");
  for (const table of ["profiles", "profile_contacts", "matches", "tournament_entries", "court_bookings", "notifications_log", "push_subscriptions", "standings_snapshots", "match_slot_proposals", "groups"]) {
    const list = await rows(await anon(`${table}?select=*&limit=5`));
    ok(list === null || list.length === 0, `no lee ${table}`);
  }
  ok(!(await anon("rpc/report_result", post(0, { p_match: match.id, p_result: "played", p_score: score }))).ok, "no ejecuta RPCs del jugador");
  ok(!(await anon("rpc/revoke_user_sessions", post(0, { p_user_id: a1.id }))).ok, "no cierra sesiones");
  ok(await denied(await anon(`clubs?id=eq.${clubA.id}`, write("PATCH", { name: "hack" }))), "no edita clubes");

  section("jugador de otro club");
  for (const [table, q] of [["tournaments", `club_id=eq.${clubA.id}`], ["matches", `club_id=eq.${clubA.id}`], ["profiles", `club_id=eq.${clubA.id}`], ["courts", `club_id=eq.${clubA.id}`], ["profile_contacts", `id=eq.${a1.id}`]]) {
    ok((await rows(await b1.as(`${table}?${q}&select=id`)))?.length === 0, `no ve ${table} del otro club`);
  }
  ok(!(await b1.as("rpc/report_result", post(0, { p_match: match.id, p_result: "played", p_score: score }))).ok, "no reporta partidos ajenos");
  ok(!(await b1.as("rpc/propose_slot", post(0, { p_match: match.id, p_court: court.id, p_start: "2030-01-10T15:00:00Z" }))).ok, "no propone horario en partidos ajenos");
  ok(!(await b1.as("tournament_entries", write("POST", { club_id: clubA.id, tournament_id: t.id, player_id: b1.id }))).ok, "no se inscribe en torneos de otro club");
  ok(await denied(await b1.as(`matches?id=eq.${match.id}`, write("PATCH", { status: "confirmed" }))), "no edita partidos ajenos");

  section("jugador del partido");
  ok(await denied(await a1.as(`matches?id=eq.${match.id}`, write("PATCH", { status: "confirmed", winner_entry_id: e1.id }))), "no cambia su partido directo (sólo por RPC)");
  ok(!(await a1.as("court_bookings", write("POST", { club_id: clubA.id, court_id: court.id, match_id: match.id, start_at: "2030-01-10T15:00:00Z", end_at: "2030-01-10T16:30:00Z" }))).ok, "no aparta cancha sin que el rival acepte");
  ok(!(await a1.as("standings_snapshots", write("POST", { club_id: clubA.id, round_id: round.id, group_id: group.id, entry_id: e1.id, position: 1 }))).ok, "no escribe tablas");
  ok(await denied(await a1.as(`profiles?id=eq.${a1.id}`, write("PATCH", { role: "club_admin" }))), "no se sube de rol");
  ok(await denied(await a1.as(`tournament_entries?id=eq.${e1.id}`, write("PATCH", { status: "accepted", seed: 1 }))), "no cambia su inscripción");
  for (const [fn, args] of [["lock_open_match", { p_match: match.id }], ["revoke_user_sessions", { p_user_id: a2.id }], ["publish_round", { p_round: round.id }]]) {
    ok(!(await a1.as(`rpc/${fn}`, post(0, args))).ok, `no ejecuta ${fn}`);
  }
  ok((await rows(await a1.as("notifications_log?select=id")))?.length === 0, "no lee el registro de avisos");
  const contacts = await rows(await a1.as(`profile_contacts?id=in.(${a2.id},${a3.id})&select=id,phone,email`));
  const rival = contacts?.find((c) => c.id === a2.id);
  ok(rival?.phone && !rival.email, "del rival ve el teléfono, no el correo");
  ok(!contacts?.find((c) => c.id === a3.id)?.phone, "de quien no es su rival no ve el teléfono");
  ok((await a1.as("rpc/report_result", post(0, { p_match: match.id, p_result: "played", p_score: score }))).ok, "por la RPC sí reporta su victoria");

  section("admin del club");
  ok(await denied(await adminA.as(`clubs?id=eq.${clubB.id}`, write("PATCH", { name: "hack" }))), "no edita otro club");
  const pro = (await (await rest("subscription_plans?name=eq.Pro&select=id")).json())[0];
  const upgrade = await adminA.as(`clubs?id=eq.${clubA.id}`, write("PATCH", { plan_id: pro.id }));
  ok(!upgrade.ok, "no se cambia el plan a sí mismo");
  ok(await denied(await adminA.as(`profiles?id=eq.${adminA.id}`, write("PATCH", { role: "superadmin" }))), "no se hace superadmin");
  ok(await denied(await adminA.as(`subscription_plans?id=eq.${pro.id}`, write("PATCH", { price: 0 }))), "no edita planes");
  ok((await rows(await adminA.as(`profiles?club_id=eq.${clubB.id}&select=id`)))?.length === 0, "no ve jugadores de otro club");

  section("storage");
  const upload = (as, path) =>
    fetch(`${URL_BASE}/storage/v1/object/media/${path}`, { method: "POST", headers: { apikey: ANON, Authorization: as, "Content-Type": "image/png" }, body: new Uint8Array([137, 80, 78, 71]) });
  const tokenB = (await login(`qa-segb1-${RUN}@example.com`)).access_token;
  ok(!(await upload(`Bearer ${tokenB}`, `${clubA.id}/logos/${crypto.randomUUID()}.png`)).ok, "un jugador no sube archivos a la carpeta de otro club");
  ok(!(await upload(`Bearer ${ANON}`, `${clubA.id}/logos/${crypto.randomUUID()}.png`)).ok, "anónimo no sube archivos");
} finally {
  for (const id of created) await deleteUser(id);
  await deleteClub(slugA);
  await deleteClub(slugB);
}

summary();
