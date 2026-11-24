/**
 * Paso 8 de la Fase 1: avisos (email/WhatsApp/push con dedupe) y cron
 * (/api/cron/tick: autoconfirmación, cierre de ronda vencida, recordatorios),
 * contra la app + Supabase real.
 *
 * Los correos de QA son @example.com: el envío se omite ("dominio de prueba")
 * pero queda en notifications_log, que es lo que se comprueba. Sin WhatsApp
 * (el club no tiene plan con WhatsApp) ni dispositivos push.
 *
 *   QA_APP_URL=http://localhost:3100 ./qa/run.sh avisos
 */
import { rest, insert, deleteUser, deleteClub, login, sessionCookie, ok, section, summary, RUN } from "./lib.mjs";
import { APP, makeUser, submitForm } from "./app.mjs";

const slug = `qa-avisos-${RUN}`;
const created = [];
const get = async (path) => (await rest(path)).json();
const TZ = "America/Mexico_City";
const localDay = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(Date.now() + d * 86_400_000));
const patch = (path, body) => rest(path, { method: "PATCH", body: JSON.stringify(body) });

/** Los avisos corren con after(): se espera a que aparezcan en el log. */
async function waitLog(filter, n = 1, ms = 15_000) {
  const end = Date.now() + ms;
  let rows = [];
  while (Date.now() < end) {
    rows = await get(`notifications_log?${filter}&select=type,channel,status,error,profile_id,dedupe_key`);
    if (rows.length >= n) return rows;
    await new Promise((r) => setTimeout(r, 400));
  }
  return rows;
}
const tick = () => fetch(`${APP}/api/cron/tick`, { headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` } });

try {
  const club = await insert("clubs", { slug, name: `Avisos QA ${RUN}`, timezone: TZ });
  const adminEmail = `qa-aadm-${RUN}@example.com`;
  const adminId = await makeUser(adminEmail, { app: { invited_role: "club_admin", club_id: club.id }, user: { first_name: "Ada" } });
  created.push(adminId);
  const mk = async (i, n) => {
    const id = await makeUser(`qa-a${i}-${RUN}@example.com`, { user: { club_id: club.id, first_name: n, last_name: "QA", phone: `33400000${i}0` } });
    created.push(id);
    return id;
  };
  const [p1, p2, p3] = [await mk(1, "Ana"), await mk(2, "Beto"), await mk(3, "Caro")];
  const [c1, c2] = [sessionCookie(await login(`qa-a1-${RUN}@example.com`)), sessionCookie(await login(`qa-a2-${RUN}@example.com`))];
  const admin = sessionCookie(await login(adminEmail));

  const court = await insert("courts", { club_id: club.id, name: "Central" });
  for (let d = 0; d < 7; d++) await insert("court_hours", { club_id: club.id, court_id: court.id, day_of_week: d, open_time: "06:00", close_time: "23:00" });
  const t = await insert("tournaments", { club_id: club.id, name: "Avisos QA", type: "ladder", status: "registration", ends_on: "2030-12-31", config: { group_size: 3, bonus: [] } });
  const entry = async (pid) => (await insert("tournament_entries", { club_id: club.id, tournament_id: t.id, player_id: pid, status: "accepted" })).id;
  const [e1, e2, e3] = [await entry(p1), await entry(p2), await entry(p3)];
  const ends = localDay(20);
  const round = await insert("rounds", { club_id: club.id, tournament_id: t.id, number: 1, name: "Ronda QA", starts_on: localDay(-2), ends_on: ends, results_deadline: `${ends}T20:00:00Z` });
  const rPath = `/club/torneos/${t.id}/rondas/${round.id}`;

  section("ronda publicada");
  await submitForm(rPath, admin, { roundId: round.id }, { contains: "Sugerir grupos" });
  let r = await submitForm(rPath, admin, { roundId: round.id }, { contains: "Publicar" });
  ok((await r.text()).includes("Ronda publicada: 3 partidos"), "publica la ronda");
  let logs = await waitLog(`type=eq.ronda_publicada&club_id=eq.${club.id}&channel=eq.email`, 3);
  ok(logs.length === 3 && new Set(logs.map((l) => l.profile_id)).size === 3, "un aviso por jugador");
  ok(logs.every((l) => l.status === "skipped" && l.error === "dominio de prueba"), "a @example.com no se manda (queda como omitido)");
  const push = await waitLog(`type=eq.ronda_publicada&club_id=eq.${club.id}&channel=eq.push`, 3);
  ok(push.length === 3 && push.every((l) => l.status === "skipped"), "push omitido sin dispositivos suscritos");
  ok((await get(`notifications_log?club_id=eq.${club.id}&channel=eq.whatsapp&select=id`)).length === 0, "sin WhatsApp: el plan del club no lo incluye");

  section("horarios y resultados");
  const [m12] = await get(`matches?round_id=eq.${round.id}&entry_a=in.(${e1},${e2})&entry_b=in.(${e1},${e2})&select=id,booking_token,entry_a`);
  const page = `/p/${m12.booking_token}?fecha=${localDay(3)}`;
  const html = (await (await fetch(`${APP}${page}`, { headers: { cookie: c1 } })).text());
  const slot = html.match(/name="slot" value="([^"]+)"/)?.[1];
  r = await submitForm(page, c1, { slot, token: m12.booking_token });
  logs = await waitLog(`type=eq.propuesta_horario&match_id=eq.${m12.id}`, 2);
  ok(logs.length >= 1 && logs.every((l) => l.profile_id === p2), "propuesta → aviso al rival");
  const [prop] = await get(`match_slot_proposals?match_id=eq.${m12.id}&select=id`);
  await submitForm(page, c2, { proposalId: prop.id, accept: "1", token: m12.booking_token }, { contains: "Aceptar" });
  logs = await waitLog(`type=eq.horario_confirmado&match_id=eq.${m12.id}&channel=eq.email`, 2);
  ok(new Set(logs.map((l) => l.profile_id)).size === 2, "horario confirmado → aviso a los dos");

  // El resultado se sube después de jugar: se mueve la reserva al pasado.
  await patch(`court_bookings?match_id=eq.${m12.id}`, { status: "cancelled" });
  await patch(`matches?id=eq.${m12.id}`, { status: "pending", scheduled_at: null });
  const winner = m12.entry_a === e1 ? c1 : c2;
  r = await submitForm(`/p/${m12.booking_token}`, winner, { s1_me: "6", s1_rival: "3", s2_me: "6", s2_rival: "2", result: "played", token: m12.booking_token });
  logs = await waitLog(`type=eq.resultado_pendiente&match_id=eq.${m12.id}&channel=eq.email`);
  const loserId = m12.entry_a === e1 ? p2 : p1;
  ok(logs.length === 1 && logs[0].profile_id === loserId, "resultado subido → aviso al rival para confirmar");
  await submitForm(`/p/${m12.booking_token}`, m12.entry_a === e1 ? c2 : c1, { reason: "Fue al revés", token: m12.booking_token }, { contains: "Disputar" });
  logs = await waitLog(`type=eq.resultado_disputado&match_id=eq.${m12.id}&channel=eq.email`);
  ok(logs.length === 1 && logs[0].profile_id === adminId, "disputa → aviso al administrador");

  section("cron");
  ok((await fetch(`${APP}/api/cron/tick`)).status === 401, "el cron exige CRON_SECRET");

  // Recordatorio: partido agendado dentro de 1 h.
  const [m13] = await get(`matches?round_id=eq.${round.id}&entry_a=in.(${e1},${e3})&entry_b=in.(${e1},${e3})&select=id`);
  const soon = new Date(Date.now() + 60 * 60_000);
  soon.setUTCSeconds(0, 0);
  await insert("court_bookings", { club_id: club.id, court_id: court.id, match_id: m13.id, start_at: soon.toISOString(), end_at: new Date(soon.getTime() + 90 * 60_000).toISOString() });
  await patch(`matches?id=eq.${m13.id}`, { status: "scheduled", scheduled_at: soon.toISOString() });

  // Autoconfirmación: un resultado reportado hace 49 h.
  const [m23] = await get(`matches?round_id=eq.${round.id}&entry_a=in.(${e2},${e3})&entry_b=in.(${e2},${e3})&select=id,entry_a`);
  await patch(`matches?id=eq.${m23.id}`, {
    status: "reported", result_type: "played", winner_entry_id: m23.entry_a, score: { sets: [[6, 1], [6, 1]] },
    reported_at: new Date(Date.now() - 49 * 3_600_000).toISOString(),
  });

  r = await tick();
  const body = await r.json();
  ok(r.status === 200 && body.ok, "tick responde");
  ok((await get(`matches?id=eq.${m23.id}&select=status`))[0].status === "confirmed", "resultado sin respuesta en 48 h → confirmado");
  logs = await waitLog(`type=eq.recordatorio_partido&match_id=eq.${m13.id}&channel=eq.email`, 2);
  ok(logs.length === 2 && logs.every((l) => l.dedupe_key.startsWith("reminder:2h:")), "recordatorio de 2 h a los dos jugadores");
  await tick();
  ok((await get(`notifications_log?type=eq.recordatorio_partido&match_id=eq.${m13.id}&channel=eq.email&select=id`)).length === 2, "un segundo tick no lo repite (dedupe)");
  ok((await get(`rounds?id=eq.${round.id}&select=status`))[0].status === "active", "una ronda vigente no se cierra");

  // Fecha límite vencida con una disputa abierta: no se cierra y se avisa.
  await patch(`rounds?id=eq.${round.id}`, { results_deadline: new Date(Date.now() - 60_000).toISOString() });
  await tick();
  ok((await get(`rounds?id=eq.${round.id}&select=status`))[0].status === "active", "con una disputa abierta no se cierra");
  logs = await waitLog(`type=eq.ronda_sin_cerrar&club_id=eq.${club.id}&channel=eq.email`);
  ok(logs.length === 1 && logs[0].profile_id === adminId, "y se avisa al admin");
  // Se resuelve la disputa: el siguiente tick cierra.
  await patch(`matches?id=eq.${m12.id}`, { status: "confirmed" });
  await tick();
  ok((await get(`rounds?id=eq.${round.id}&select=status`))[0].status === "closed", "resuelta la disputa, el cron cierra la ronda vencida");
  ok((await get(`standings_snapshots?round_id=eq.${round.id}&select=entry_id`)).length === 3, "con sus tablas");
  ok((await get(`rounds?tournament_id=eq.${t.id}&number=eq.2&select=status`))[0]?.status === "draft", "y la siguiente ronda en borrador");
  logs = await waitLog(`type=eq.ronda_cerrada&club_id=eq.${club.id}&channel=eq.email`);
  ok(logs.length === 1, "avisa al admin para que revise y publique");
} finally {
  for (const id of created) await deleteUser(id);
  await deleteClub(slug);
}

summary();
