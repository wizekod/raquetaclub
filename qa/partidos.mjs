/**
 * Paso 5 de la Fase 1: link de partido (/p/{token}). Proponer horario,
 * aceptar/rechazar, apartar cancha y cancelar, contra la app + Supabase real.
 *
 *   QA_APP_URL=http://localhost:3100 ./qa/run.sh partidos
 */
import { rest, insert, deleteUser, deleteClub, login, sessionCookie, ok, section, summary, RUN } from "./lib.mjs";
import { makeUser, visit, location, submitForm } from "./app.mjs";

const slug = `qa-partidos-${RUN}`;
const created = [];
const get = async (path) => (await rest(path)).json();
const text = async (r) => (await r.text()).replace(/<!-- -->/g, "");

try {
  const club = await insert("clubs", { slug, name: `Partidos QA ${RUN}`, timezone: "America/Mexico_City" });
  const adminEmail = `qa-padm-${RUN}@example.com`;
  created.push(await makeUser(adminEmail, { app: { invited_role: "club_admin", club_id: club.id }, user: { first_name: "Ada" } }));
  const mk = async (i, first, last) => {
    const id = await makeUser(`qa-p${i}-${RUN}@example.com`, { user: { club_id: club.id, first_name: first, last_name: last, phone: `33200000${i}0` } });
    created.push(id);
    return id;
  };
  const [p1, p2, p3, p4] = [await mk(1, "Ana", "Uno"), await mk(2, "Beto", "Dos"), await mk(3, "Caro", "Tres"), await mk(4, "Dani", "Cuatro")];
  const cookie = async (i) => sessionCookie(await login(`qa-p${i}-${RUN}@example.com`));
  const [c1, c2, c3, c4] = [await cookie(1), await cookie(2), await cookie(3), await cookie(4)];
  const admin = sessionCookie(await login(adminEmail));

  // Cancha de 7:00 a 22:00 todos los días; ronda de febrero 2027 publicada.
  const court = await insert("courts", { club_id: club.id, name: "Central" });
  for (let d = 0; d < 7; d++) await insert("court_hours", { club_id: club.id, court_id: court.id, day_of_week: d, open_time: "07:00", close_time: "22:00" });
  const t = await insert("tournaments", { club_id: club.id, name: "Escalera QA", type: "ladder", status: "active", config: { match_minutes: 90 } });
  const entry = async (pid) => insert("tournament_entries", { club_id: club.id, tournament_id: t.id, player_id: pid, status: "accepted" });
  const [e1, e2, e4] = [await entry(p1), await entry(p2), await entry(p4)];
  const round = await insert("rounds", { club_id: club.id, tournament_id: t.id, number: 1, name: "Febrero", starts_on: "2027-02-01", ends_on: "2027-02-28", results_deadline: "2027-02-28T20:00:00Z", status: "active" });
  const m12 = await insert("matches", { club_id: club.id, tournament_id: t.id, round_id: round.id, entry_a: e1.id, entry_b: e2.id });
  const m14 = await insert("matches", { club_id: club.id, tournament_id: t.id, round_id: round.id, entry_a: e1.id, entry_b: e4.id });
  const page = `/p/${m12.booking_token}?fecha=2027-02-03`;
  const slot = (iso) => `${court.id}|${iso}`;

  section("acceso");
  let r = await visit(page);
  ok(r.status === 307 && location(r).startsWith("/login?next="), "sin sesión → login con retorno");
  ok((await visit(page, c3)).status === 404, "quien no juega el partido no lo ve");
  ok((await text(await visit(page, admin))).includes("Vista de administrador"), "el admin del club sí lo ve");
  const html = await text(await visit(page, c1));
  ok(html.includes("Proponer horario") && html.includes("07:00") && html.includes("20:30") && !html.includes("21:00</label>"), "el jugador ve horarios libres (el último que cabe en 90 min: 20:30)");
  ok(html.includes("wa.me/523320000020"), "botón de WhatsApp al rival");

  section("proponer y responder");
  r = await submitForm(page, c1, { slot: slot("2027-02-03T11:00:00.000Z"), token: m12.booking_token });
  ok((await text(r)).includes("La cancha no abre en ese horario"), "rechaza un horario fuera del de la cancha (5:00)");
  r = await submitForm(page, c1, { slot: slot("2027-02-03T16:00:00.000Z"), token: m12.booking_token });
  ok((await text(r)).includes("Propuesta enviada"), "propone el miércoles a las 10:00");
  r = await submitForm(page, c1, { slot: slot("2027-02-03T22:00:00.000Z"), token: m12.booking_token });
  const props = await get(`match_slot_proposals?match_id=eq.${m12.id}&status=eq.proposed&select=id,start_at&order=start_at`);
  ok(props.length === 2, "puede mandar varias propuestas");
  ok((await get(`court_bookings?match_id=eq.${m12.id}&select=id`)).length === 0, "proponer no aparta la cancha");

  const html2 = await text(await visit(page, c2));
  ok(html2.includes("Propuesta de Ana Uno") && html2.includes("Aceptar"), "el rival ve las propuestas para aceptar");
  ok((await text(await visit("/jugador", c2))).includes("Te propusieron horario"), "y un aviso en su inicio");
  ok(!(await text(await visit(page, c1))).includes(">Aceptar<"), "quien propuso no puede aceptar su propuesta");

  r = await submitForm(page, c2, { proposalId: props[1].id, accept: "0", token: m12.booking_token }, { contains: "Aceptar" });
  ok((await text(r)).includes("Propuesta rechazada"), "el rival rechaza una");
  r = await submitForm(page, c2, { proposalId: props[0].id, accept: "1", token: m12.booking_token }, { contains: "Aceptar" });
  ok((await text(r)).includes("Cancha apartada"), "y acepta la otra");
  const [bk] = await get(`court_bookings?match_id=eq.${m12.id}&status=eq.confirmed&select=id,start_at,end_at`);
  ok(bk && new Date(bk.start_at).toISOString() === "2027-02-03T16:00:00.000Z" && new Date(bk.end_at).toISOString() === "2027-02-03T17:30:00.000Z", "reserva de 10:00 a 11:30");
  const [mm] = await get(`matches?id=eq.${m12.id}&select=status,scheduled_at`);
  ok(mm.status === "scheduled", "el partido queda agendado");
  const after = await text(await visit(page, c1));
  ok(after.includes("Cancha apartada") && !after.includes("Proponer horario"), "el link muestra la reserva y ya no deja proponer");
  ok((await text(await visit("/club/calendario?fecha=2027-02-03", admin))).includes("Ana Uno"), "aparece en el calendario del club");

  section("cancha ocupada");
  const html4 = await text(await visit(`/p/${m14.booking_token}?fecha=2027-02-03`, c4));
  ok(!html4.includes(`value="${slot("2027-02-03T16:00:00.000Z")}"`) && html4.includes(`value="${slot("2027-02-03T17:30:00.000Z")}"`), "a otro partido ya no se le ofrece ese horario");
  r = await submitForm(`/p/${m14.booking_token}?fecha=2027-02-03`, c4, { slot: slot("2027-02-03T16:30:00.000Z"), token: m14.booking_token });
  ok((await text(r)).includes("ya se apartó en ese horario"), "y la base lo rechaza aunque lo fuerce (23P01)");

  section("retirar y cancelar");
  r = await submitForm(`/p/${m14.booking_token}?fecha=2027-02-04`, c4, { slot: slot("2027-02-04T16:00:00.000Z"), token: m14.booking_token });
  const [p14] = await get(`match_slot_proposals?match_id=eq.${m14.id}&status=eq.proposed&select=id`);
  await submitForm(`/p/${m14.booking_token}`, c4, { proposalId: p14.id, token: m14.booking_token }, { contains: "Retirar" });
  const [p14b] = await get(`match_slot_proposals?id=eq.${p14.id}&select=status`);
  ok(p14b.status === "withdrawn", "quien propuso la retira");

  r = await submitForm(page, c2, { reason: "Lesión", token: m12.booking_token });
  ok((await text(r)).includes("Reserva cancelada"), "un jugador cancela la reserva");
  const [bk2] = await get(`court_bookings?id=eq.${bk.id}&select=status,cancelled_reason`);
  const [mm2] = await get(`matches?id=eq.${m12.id}&select=status,scheduled_at`);
  ok(bk2.status === "cancelled" && bk2.cancelled_reason === "Lesión" && mm2.status === "pending" && !mm2.scheduled_at, "reserva cancelada y partido por agendar");
} finally {
  for (const id of created) await deleteUser(id);
  await deleteClub(slug);
}

summary();
