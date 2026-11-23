/**
 * Paso 6 de la Fase 1: resultados (reportar, confirmar, disputar, corregir)
 * y cierre de ronda con la escalera, y los rankings (paso 7), contra la app
 * + Supabase real.
 *
 *   QA_APP_URL=http://localhost:3100 ./qa/run.sh resultados
 */
import { rest, insert, deleteUser, deleteClub, login, sessionCookie, ok, section, summary, RUN } from "./lib.mjs";
import { makeUser, visit, location, submitForm } from "./app.mjs";

const slug = `qa-result-${RUN}`;
const created = [];
const get = async (path) => (await rest(path)).json();
const text = async (r) => (await r.text()).replace(/<!-- -->/g, "");
const TZ = "America/Mexico_City";
const localDay = (offsetDays) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(Date.now() + offsetDays * 86_400_000));

try {
  const club = await insert("clubs", { slug, name: `Resultados QA ${RUN}`, timezone: TZ });
  const adminEmail = `qa-radm-${RUN}@example.com`;
  created.push(await makeUser(adminEmail, { app: { invited_role: "club_admin", club_id: club.id }, user: { first_name: "Ada" } }));
  const names = ["Ana", "Beto", "Caro", "Dani", "Eli", "Fer"];
  const ids = [];
  for (const [i, n] of names.entries()) {
    const id = await makeUser(`qa-r${i}-${RUN}@example.com`, { user: { club_id: club.id, first_name: n, last_name: "QA", phone: `33300000${i}0` } });
    created.push(id);
    ids.push(id);
  }
  const ck = [];
  for (let i = 0; i < 6; i++) ck.push(sessionCookie(await login(`qa-r${i}-${RUN}@example.com`)));
  const admin = sessionCookie(await login(adminEmail));
  const [A, B, C, D, E, F] = [0, 1, 2, 3, 4, 5];

  // Escalera sin bonus (puntos exactos), grupos de 3. Ronda vigente: empezó hace 3 días.
  const t = await insert("tournaments", { club_id: club.id, name: "Escalera QA", type: "ladder", status: "active", ends_on: "2030-12-31", config: { group_size: 3, bonus: [] } });
  const entries = [];
  for (const [i, pid] of ids.entries()) entries.push((await insert("tournament_entries", { club_id: club.id, tournament_id: t.id, player_id: pid, status: "accepted", seed: i + 1 })).id);
  const endsOn = localDay(25);
  const round = await insert("rounds", {
    club_id: club.id, tournament_id: t.id, number: 1, name: "Ronda QA", starts_on: localDay(-3), ends_on: endsOn,
    results_deadline: `${endsOn}T20:00:00Z`, status: "active",
  });
  const groups = [];
  for (const [level, members] of [[1, [A, B, C]], [2, [D, E, F]]]) {
    const g = await insert("groups", { club_id: club.id, round_id: round.id, level, name: `Grupo ${level}` });
    groups.push(g);
    for (const [pos, i] of members.entries()) {
      await insert("group_members", { club_id: club.id, tournament_id: t.id, round_id: round.id, group_id: g.id, entry_id: entries[i], position: pos + 1 });
    }
  }
  const match = async (g, a, b) => insert("matches", { club_id: club.id, tournament_id: t.id, round_id: round.id, group_id: groups[g].id, entry_a: entries[a], entry_b: entries[b] });
  const [mAB, mAC, mBC, mDE, mDF, mEF] = [await match(0, A, B), await match(0, A, C), await match(0, B, C), await match(1, D, E), await match(1, D, F), await match(1, E, F)];
  const p = (m) => `/p/${m.booking_token}`;
  const status = async (m) => (await get(`matches?id=eq.${m.id}&select=status,result_type,winner_entry_id,score`))[0];

  section("reportar y confirmar");
  ok((await text(await visit(p(mAB), ck[A]))).includes("Subir resultado"), "el jugador ve el formulario de resultado");
  let r = await submitForm(p(mAC), ck[C], { s1_me: "4", s1_rival: "6", s2_me: "3", s2_rival: "6", result: "played", token: mAC.booking_token });
  ok((await text(r)).includes("lo sube quien ganó"), "el perdedor no puede subirlo");
  r = await submitForm(p(mAB), ck[A], { s1_me: "6", s1_rival: "5", s2_me: "6", s2_rival: "3", result: "played", token: mAB.booking_token });
  ok((await text(r)).includes("no es un marcador válido"), "valida el marcador (6-5)");
  r = await submitForm(p(mAB), ck[A], { s1_me: "6", s1_rival: "4", s2_me: "6", s2_rival: "3", result: "played", token: mAB.booking_token });
  ok((await text(r)).includes("Resultado enviado"), "el ganador sube 6-4 6-3");
  let s = await status(mAB);
  ok(s.status === "reported" && s.winner_entry_id === entries[A] && JSON.stringify(s.score.sets) === "[[6,4],[6,3]]", "queda por confirmar, orientado A/B");
  const pageB = await text(await visit(p(mAB), ck[B]));
  ok(pageB.includes("Ana QA ganó 6-4 6-3") && pageB.includes("Confirmar resultado"), "el rival lo ve y puede confirmarlo");
  ok((await text(await visit(p(mAB), ck[A]))).includes("Esperando a que Beto QA lo confirme"), "quien lo subió espera");
  r = await submitForm(p(mAB), ck[B], { token: mAB.booking_token }, { contains: "Confirmar resultado" });
  ok((await text(r)).includes("Resultado confirmado") && (await status(mAB)).status === "confirmed", "el rival confirma");

  // E (entry_a de E-F) gana 6-2 7-5 y el rival no confirma: cuenta igual al cerrar.
  r = await submitForm(p(mEF), ck[E], { s1_me: "6", s1_rival: "2", s2_me: "7", s2_rival: "5", result: "played", token: mEF.booking_token });
  // D (entry_a de D-F) gana en 3 sets con tie-break.
  r = await submitForm(p(mDF), ck[D], { s1_me: "6", s1_rival: "4", s2_me: "3", s2_rival: "6", s3_me: "10", s3_rival: "7", result: "played", token: mDF.booking_token });
  ok((await status(mDF)).status === "reported", "resultado a 3 sets con tie-break");

  section("disputa y corrección del admin");
  r = await submitForm(p(mAC), ck[C], { result: "default", token: mAC.booking_token, s1_me: "" });
  s = await status(mAC);
  ok(s.status === "reported" && s.result_type === "default" && s.winner_entry_id === entries[C], "C reclama un default");
  r = await submitForm(p(mAC), ck[A], { reason: "Sí me presenté, jugamos y gané 6-1 6-1", token: mAC.booking_token }, { contains: "Disputar" });
  ok((await text(r)).includes("Disputa enviada") && (await status(mAC)).status === "disputed", "A lo disputa");
  const roundPage = `/club/torneos/${t.id}/rondas/${round.id}`;
  r = await submitForm(roundPage, admin, { roundId: round.id }, { contains: "Cerrar ronda" });
  ok((await text(r)).includes("en disputa"), "no se puede cerrar con una disputa");
  r = await submitForm(p(mAC), admin, { outcome: "played", s1_a: "6", s1_b: "1", s2_a: "6", s2_b: "1", token: mAC.booking_token });
  s = await status(mAC);
  ok((await text(r)).includes("Resultado guardado") && s.status === "confirmed" && s.winner_entry_id === entries[A] && s.result_type === "played", "el admin la resuelve con el marcador");
  r = await submitForm(p(mDE), admin, { outcome: "def_a", token: mDE.booking_token, s1_a: "" });
  s = await status(mDE);
  ok(s.status === "confirmed" && s.result_type === "default" && s.winner_entry_id === entries[D], "el admin marca un W.O.");
  r = await submitForm(p(mDE), admin, { outcome: "reopen", token: mDE.booking_token, s1_a: "" });
  ok((await status(mDE)).status === "pending", "y puede borrarlo");
  await submitForm(p(mDE), admin, { outcome: "played", s1_a: "6", s1_b: "0", s2_a: "6", s2_b: "0", token: mDE.booking_token });

  const tablePage = await text(await visit(`/jugador/torneos/${t.id}`, ck[A]));
  ok(tablePage.includes("Tu grupo: Grupo 1") && tablePage.includes("Pts") && tablePage.includes("6-4 6-3"), "el jugador ve la tabla de su grupo y sus marcadores");

  section("cerrar ronda");
  r = await submitForm(roundPage, admin, { roundId: round.id }, { contains: "Cerrar ronda" });
  ok(r.status === 303 && location(r).includes(`/club/torneos/${t.id}/rondas/`), `cierra y lleva a la siguiente ronda (${r.status})`);
  ok((await status(mBC)).status === "not_played", "sin resultado → no jugado");
  ok((await status(mDF)).status === "confirmed", "por confirmar → confirmado");
  const snaps = await get(`standings_snapshots?round_id=eq.${round.id}&select=entry_id,position,points,movement`);
  const sOf = (i) => snaps.find((x) => x.entry_id === entries[i]);
  ok(sOf(A).position === 1 && Number(sOf(A).points) === 6 && sOf(A).movement === "stay", "A: 1.º del grupo 1 con 6 pts, se queda");
  ok(sOf(B).position === 2 && sOf(C).position === 3, "B 2.º y C 3.º (empatan a 1: desempata la diferencia de games)");
  ok(sOf(B).movement === "down" && sOf(C).movement === "down" && sOf(D).movement === "up" && sOf(E).movement === "up" && sOf(F).movement === "stay", "2 bajan del grupo 1 y 2 suben del grupo 2");
  const [r1] = await get(`rounds?id=eq.${round.id}&select=status`);
  const [r2] = await get(`rounds?tournament_id=eq.${t.id}&number=eq.2&select=id,status,starts_on`);
  ok(r1.status === "closed" && r2?.status === "draft", "ronda 1 cerrada y ronda 2 en borrador");
  const r2groups = await get(`groups?round_id=eq.${r2.id}&select=id,level`);
  const r2members = await get(`group_members?round_id=eq.${r2.id}&select=entry_id,group_id`);
  const levelOf = (i) => r2groups.find((g) => g.id === r2members.find((m) => m.entry_id === entries[i])?.group_id)?.level;
  ok([A, D, E].every((i) => levelOf(i) === 1) && [B, C, F].every((i) => levelOf(i) === 2), "grupos de la ronda 2 con ascensos y descensos");
  const closed = await text(await visit(roundPage, admin));
  ok(closed.includes('aria-label="Sube"') && closed.includes('aria-label="Baja"') && !closed.includes("Corregir"), "la ronda cerrada muestra la tabla congelada con movimientos");
  ok(!(await text(await visit(p(mAB), admin))).includes("Corregir resultado"), "ya no se corrigen resultados de una ronda cerrada");

  section("rankings (paso 7)");
  const rankAdmin = `/club/torneos/${t.id}/ranking`;
  let page = await text(await visit(rankAdmin, admin));
  ok(page.includes("Escalera") && page.includes("Más consistente") && page.includes("Posiciones 1–3 de la escalera"), "escalera con premios y posición global");
  ok(page.includes("1 veces 1.º del grupo 1"), "premio al más consistente con su conteo");
  // Publicar la ronda 2: la escalera pasa a la ronda vigente y aparece el historial.
  r = await submitForm(`/club/torneos/${t.id}/rondas/${r2.id}`, admin, { roundId: r2.id }, { contains: "Publicar" });
  ok((await text(r)).includes("Ronda publicada"), "publica la ronda 2");
  page = await text(await visit(`/jugador/torneos/${t.id}/ranking`, ck[D]));
  ok(page.includes("Historial") && page.includes("Dani QA") && page.includes("G2") && page.includes('aria-label="Sube"'), "el jugador ve el historial de grupos con movimientos");
  ok(page.includes("bg-primary/5"), "con su fila resaltada");
  const prof = await text(await visit(`/jugador/torneos/${t.id}/ranking/${entries[A]}`, ck[B]));
  ok(prof.includes("Ana QA") && prof.includes("Cara a cara") && prof.includes("Beto QA") && prof.includes("6-4 6-3"), "perfil de un jugador: partidos y H2H");
  ok(/Ganados<\/p><p[^>]*>2</.test(prof), "récord: 2 ganados");
  ok((await text(await visit(`/jugador/rankings`, ck[A]))).includes("Escalera QA"), "lista de rankings del jugador");
  const draftT = await insert("tournaments", { club_id: club.id, name: "Borrador QA", type: "ladder" });
  ok((await visit(`/jugador/torneos/${draftT.id}/ranking`, ck[A])).status === 404, "un torneo en borrador no tiene ranking visible");
} finally {
  for (const id of created) await deleteUser(id);
  await deleteClub(slug);
}

summary();
