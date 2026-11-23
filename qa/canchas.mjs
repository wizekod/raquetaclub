/**
 * Paso 3 de la Fase 1: canchas, horario, bloqueos y calendario, contra la app
 * corriendo + Supabase real.
 *
 *   QA_APP_URL=http://localhost:3100 ./qa/run.sh canchas
 */
import { rest, insert, asUser, deleteUser, deleteClub, login, sessionCookie, ok, section, summary, RUN, URL_BASE } from "./lib.mjs";
import { makeUser, visit, location, submitForm } from "./app.mjs";

const slug = `qa-canchas-${RUN}`;
const created = [];
const get = async (path) => (await rest(path)).json();

try {
  const club = await insert("clubs", { slug, name: `Canchas QA ${RUN}`, timezone: "America/Mexico_City" });
  const adminEmail = `qa-kadm-${RUN}@example.com`;
  const adminId = await makeUser(adminEmail, { app: { invited_role: "club_admin", club_id: club.id }, user: { first_name: "Ada" } });
  created.push(adminId);
  const p1 = await makeUser(`qa-k1-${RUN}@example.com`, { user: { club_id: club.id, first_name: "Ana", last_name: "Uno", phone: "3311112222" } });
  const p2 = await makeUser(`qa-k2-${RUN}@example.com`, { user: { club_id: club.id, first_name: "Beto", last_name: "Dos", phone: "3322223333" } });
  created.push(p1, p2);
  const adminSession = await login(adminEmail);
  const admin = sessionCookie(adminSession);
  const player = sessionCookie(await login(`qa-k1-${RUN}@example.com`));

  section("canchas");
  let r = await submitForm("/club/canchas", admin, { name: "Central", sport: "tennis", surface: "Arcilla" });
  ok(r.status === 303 && location(r).startsWith("/club/canchas/"), `crear cancha redirige a su ficha (${r.status} ${location(r)})`);
  const [central] = await get(`courts?club_id=eq.${club.id}&name=eq.Central&select=*`);
  ok(central?.surface === "Arcilla", "cancha creada con superficie");
  const hours1 = await get(`court_hours?court_id=eq.${central.id}&select=*`);
  ok(hours1.length === 7 && hours1.every((h) => h.open_time === "07:00:00" && h.close_time === "22:00:00"), "primera cancha: 7:00–22:00 todos los días");

  // Horario propio (vía la RPC, con la sesión del admin: la RLS aplica).
  const asAdmin = asUser(adminSession.access_token);
  const rpc = (name, body) => asAdmin(`rpc/${name}`, { method: "POST", body: JSON.stringify(body) });
  r = await rpc("set_court_hours", { p_court: central.id, p_hours: [
    { day_of_week: 1, open_time: "08:00", close_time: "13:00" },
    { day_of_week: 1, open_time: "17:00", close_time: "21:00" },
  ] });
  ok(r.status === 204, "admin cambia el horario con set_court_hours");

  r = await submitForm("/club/canchas", admin, { name: "Dos", sport: "tennis", surface: "" });
  const [dos] = await get(`courts?club_id=eq.${club.id}&name=eq.Dos&select=id`);
  const hours2 = await get(`court_hours?court_id=eq.${dos.id}&select=day_of_week,open_time,close_time&order=open_time`);
  ok(hours2.length === 2 && hours2[0].open_time === "08:00:00", "una cancha nueva copia el horario de las existentes");

  r = await submitForm("/club/canchas", admin, { name: "Central", sport: "tennis", surface: "" });
  ok((await r.text()).includes("Ya hay una cancha con ese nombre"), "rechaza nombre repetido");

  r = await submitForm(`/club/canchas/${dos.id}`, admin, { id: dos.id, name: "Dos", sport: "tennis", surface: "Dura" });
  ok((await r.text()).includes("Cancha guardada"), "edita la cancha");
  const [dosNow] = await get(`courts?id=eq.${dos.id}&select=active,surface`);
  ok(dosNow.active === false && dosNow.surface === "Dura", "sin la casilla queda inactiva");

  section("permisos");
  r = await visit("/club/canchas", player);
  ok(r.status === 307 && location(r) === "/jugador", "un jugador no entra a Canchas");
  const asPlayer = asUser((await login(`qa-k1-${RUN}@example.com`)).access_token);
  r = await asPlayer("rpc/set_court_hours", { method: "POST", body: JSON.stringify({ p_court: central.id, p_hours: [] }) });
  ok(r.status >= 400, "un jugador no cambia horarios");

  section("bloqueos y partidos agendados");
  // Partido agendado el lunes 2027-02-01 de 18:00 a 19:30 (hora del club, UTC-6).
  const t = await insert("tournaments", { club_id: club.id, name: "Escalera QA", type: "ladder", status: "active" });
  const e1 = await insert("tournament_entries", { club_id: club.id, tournament_id: t.id, player_id: p1, status: "accepted" });
  const e2 = await insert("tournament_entries", { club_id: club.id, tournament_id: t.id, player_id: p2, status: "accepted" });
  const round = await insert("rounds", { club_id: club.id, tournament_id: t.id, number: 1, name: "Febrero", starts_on: "2027-02-01", ends_on: "2027-02-28", results_deadline: "2027-02-28T20:00:00Z", status: "active" });
  const match = await insert("matches", { club_id: club.id, tournament_id: t.id, round_id: round.id, entry_a: e1.id, entry_b: e2.id, status: "scheduled", scheduled_at: "2027-02-02T00:00:00Z" });
  await insert("court_bookings", { club_id: club.id, court_id: central.id, match_id: match.id, start_at: "2027-02-02T00:00:00Z", end_at: "2027-02-02T01:30:00Z" });

  const cal = await (await visit("/club/calendario?fecha=2027-02-01", admin)).text();
  ok(cal.includes("Ana Uno") && cal.includes("Beto Dos"), "el calendario muestra el partido con los jugadores");
  ok(cal.includes("18:00") && cal.includes("19:30"), "con la hora local del club");

  const blockFields = { court: central.id, startDate: "2027-02-01", startTime: "17:00", endDate: "2027-02-01", endTime: "21:00", reason: "Evento privado del hotel" };
  r = await submitForm("/club/bloqueos", admin, blockFields);
  ok((await r.text()).includes("Hay 1 partido agendado"), "un bloqueo sobre un partido primero avisa");
  ok((await get(`court_blocks?club_id=eq.${club.id}&select=id`)).length === 0, "y no crea nada sin confirmar");

  r = await submitForm("/club/bloqueos", admin, { ...blockFields, confirm: "on" });
  ok((await r.text()).includes("Se cancelaron 1 partido"), "con la casilla cancela y bloquea");
  const [bk] = await get(`court_bookings?match_id=eq.${match.id}&select=status,cancelled_reason`);
  ok(bk.status === "cancelled" && bk.cancelled_reason === "Evento privado del hotel", "la reserva queda cancelada con el motivo");
  const [mm] = await get(`matches?id=eq.${match.id}&select=status,scheduled_at`);
  ok(mm.status === "pending" && mm.scheduled_at === null, "el partido vuelve a por agendar");
  const [blk] = await get(`court_blocks?club_id=eq.${club.id}&select=start_at,end_at`);
  ok(new Date(blk.start_at).toISOString() === "2027-02-01T23:00:00.000Z", "el bloqueo se guarda con la zona del club (17:00 → 23:00 UTC)");

  const cal2 = await (await visit("/club/calendario?fecha=2027-02-01", admin)).text();
  ok(cal2.includes("Bloqueada") && cal2.includes("Evento privado del hotel") && !cal2.includes("Ana Uno"), "el calendario muestra el bloqueo y ya no el partido");

  r = await submitForm("/club/bloqueos", admin, { court: "all", startDate: "2027-03-01", startTime: "10:00", endDate: "2027-03-01", endTime: "09:00", reason: "" });
  ok((await r.text()).includes("terminar después de empezar"), "valida que termine después de empezar");

  r = await submitForm("/club/bloqueos", admin, { court: "all", startDate: "2027-03-01", startTime: "00:00", endDate: "2027-03-01", endTime: "23:59", reason: "Mantenimiento" });
  const all = await get(`court_blocks?club_id=eq.${club.id}&court_id=is.null&select=id`);
  ok(all.length === 1, "bloqueo de todas las canchas");
  const reservaEnBloqueo = await fetch(`${URL_BASE}/rest/v1/court_bookings`, {
    method: "POST",
    headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ club_id: club.id, court_id: central.id, match_id: match.id, start_at: "2027-03-01T18:00:00Z", end_at: "2027-03-01T19:00:00Z" }),
  });
  ok((await reservaEnBloqueo.json()).code === "RC409", "la base rechaza reservar dentro de un bloqueo (RC409)");
} finally {
  for (const id of created) await deleteUser(id);
  await deleteClub(slug);
}

summary();
