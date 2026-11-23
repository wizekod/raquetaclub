/**
 * Paso 4 de la Fase 1: torneos, inscripciones, grupos y publicación de la
 * ronda, contra la app corriendo + Supabase real.
 *
 *   QA_APP_URL=http://localhost:3100 ./qa/run.sh torneos
 */
import { rest, insert, asUser, deleteUser, deleteClub, login, sessionCookie, ok, section, summary, RUN } from "./lib.mjs";
import { makeUser, visit, location, submitForm } from "./app.mjs";

const slug = `qa-torneos-${RUN}`;
const created = [];
const get = async (path) => (await rest(path)).json();

try {
  const club = await insert("clubs", { slug, name: `Torneos QA ${RUN}`, timezone: "America/Mexico_City" });
  const adminEmail = `qa-tadm-${RUN}@example.com`;
  created.push(await makeUser(adminEmail, { app: { invited_role: "club_admin", club_id: club.id }, user: { first_name: "Ada" } }));
  const names = ["Ana", "Beto", "Caro", "Dani", "Eli", "Fer"];
  const players = [];
  for (const [i, n] of names.entries()) {
    const id = await makeUser(`qa-t${i}-${RUN}@example.com`, { user: { club_id: club.id, first_name: n, last_name: "QA", phone: `33100000${i}0` } });
    created.push(id);
    players.push(id);
  }
  const admin = sessionCookie(await login(adminEmail));
  const p0Session = await login(`qa-t0-${RUN}@example.com`);
  const p0 = sessionCookie(p0Session);
  const asP0 = asUser(p0Session.access_token);

  section("crear y configurar");
  let r = await submitForm("/club/torneos", admin, { name: "Escalera QA", type: "ladder", sport: "tennis", starts_on: "2027-02-01", ends_on: "2027-10-30" });
  ok(r.status === 303 && location(r).startsWith("/club/torneos/"), `crear torneo redirige a su ficha (${r.status})`);
  const [t] = await get(`tournaments?club_id=eq.${club.id}&select=*`);
  ok(t?.status === "draft" && t.config.group_size === 5 && t.config.points.win === 3, "nace en borrador con las reglas de la escalera");
  const tPath = `/club/torneos/${t.id}`;

  ok((await (await visit("/jugador/torneos", p0)).text()).includes("Escalera QA") === false, "el jugador no ve un torneo en borrador");
  r = await visit("/club/torneos", p0);
  ok(r.status === 307 && location(r) === "/jugador", "un jugador no entra al panel de torneos");

  const base = { name: "Escalera QA", status: "registration", sport: "tennis", starts_on: "2027-02-01", ends_on: "2027-10-30", rules_text: "Partidos a 2 sets.", rules_pdf_path: "" };
  const datos = { contains: "Reglamento en PDF" };
  r = await submitForm(tPath, admin, { ...base, status: "draft", registration_open: "on" }, datos);
  ok((await r.text()).includes("Sólo se puede abrir la inscripción"), "no abre inscripción en borrador");
  r = await submitForm(tPath, admin, { ...base, registration_open: "on" }, datos);
  ok((await r.text()).includes("Torneo guardado"), "abre inscripciones");
  r = await submitForm(tPath, admin, { ...base, registration_open: "on", rules_pdf_path: `otro-club/rules/x.pdf` }, datos);
  ok((await r.text()).includes("Archivo no válido"), "rechaza un PDF fuera de la carpeta del club");

  const cfg = { group_size: "3", promote: "1", relegate: "1", win: "3", win_default: "2", loss_played: "1", loss_default: "0", not_played: "0", bonus_week1: "0.25", bonus_week2: "0", deadline_time: "14:00", auto_expel: "2", third_set: "match_tiebreak_10" };
  r = await submitForm(tPath, admin, { ...cfg, promote: "9" });
  ok((await r.text()).includes("Entre 0 y 5"), "valida las reglas");
  r = await submitForm(tPath, admin, cfg);
  ok((await r.text()).includes("Reglas guardadas"), "guarda las reglas");
  const [t1] = await get(`tournaments?id=eq.${t.id}&select=config`);
  ok(t1.config.group_size === 3 && t1.config.promote === 1 && t1.config.bonus.length === 1, "config actualizada (bonus en 0 se quita)");

  section("inscripciones");
  ok((await (await visit("/jugador/torneos", p0)).text()).includes("Inscribirme"), "el jugador ve el torneo con inscripción abierta");
  r = await submitForm("/jugador/torneos", p0, { tournamentId: t.id });
  const [mine] = await get(`tournament_entries?tournament_id=eq.${t.id}&player_id=eq.${players[0]}&select=id,status`);
  ok(mine?.status === "pending", "se inscribe y queda por aceptar");
  r = await asP0(`tournament_entries?id=eq.${mine.id}`, { method: "PATCH", body: JSON.stringify({ status: "accepted" }), headers: { Prefer: "return=representation" } });
  ok((await r.json()).length === 0, "no se puede autoaceptar (RLS)");

  r = await submitForm(tPath, admin, { entryId: mine.id, status: "accepted" }, { contains: "Aceptar" });
  const [acc] = await get(`tournament_entries?id=eq.${mine.id}&select=status`);
  ok(acc.status === "accepted", "el admin la acepta");
  for (const pid of players.slice(1)) await submitForm(tPath, admin, { playerId: pid });
  const entries = await get(`tournament_entries?tournament_id=eq.${t.id}&select=id,player_id,status`);
  ok(entries.length === 6 && entries.every((e) => e.status === "accepted"), "el admin inscribe a los demás ya aceptados");
  ok(!(await (await visit(tPath, admin)).text()).includes(`value="${players[1]}"`), "ya no ofrece inscribir a quien ya está inscrito");

  // Siembra al revés del orden de alta: Fer = 1 … Ana = 6.
  const entryOf = (i) => entries.find((e) => e.player_id === players[i]).id;
  const seeds = Object.fromEntries(players.map((_, i) => [`seed:${entryOf(i)}`, String(6 - i)]));
  r = await submitForm(tPath, admin, { tournamentId: t.id, ...seeds }, { contains: "Guardar siembra" });
  ok((await r.text()).includes("Siembra guardada"), "guarda la siembra");

  section("ronda y grupos");
  r = await submitForm(tPath, admin, { name: "Febrero", starts_on: "2027-02-01", ends_on: "2027-02-28" }, { contains: "Crear ronda" });
  ok(r.status === 303 && location(r).includes("/rondas/"), "crea la ronda 1");
  const [round] = await get(`rounds?tournament_id=eq.${t.id}&select=*`);
  ok(round.status === "draft" && new Date(round.results_deadline).toISOString() === "2027-02-28T20:00:00.000Z", "fecha límite: último día 14:00 hora del club");
  const rPath = `${tPath}/rondas/${round.id}`;
  ok((await (await asP0(`rounds?id=eq.${round.id}&select=id`)).json()).length === 0, "el jugador no ve la ronda en borrador");
  ok(!(await (await visit(tPath, admin)).text()).includes("Crear ronda"), "no deja crear otra ronda con una abierta");

  r = await submitForm(rPath, admin, { roundId: round.id }, { contains: "Sugerir grupos" });
  ok((await r.text()).includes("Grupos sugeridos: 2"), "sugiere 2 grupos de 3 por siembra");
  // (group_members tiene dos FK compuestas a groups: sin embebido, en dos consultas)
  const members = async () => {
    const gs = await get(`groups?round_id=eq.${round.id}&select=id,level`);
    const ms = await get(`group_members?round_id=eq.${round.id}&select=entry_id,group_id,position&order=position`);
    return ms.map((m) => ({ ...m, level: gs.find((g) => g.id === m.group_id)?.level }));
  };
  let gm = await members();
  const levelOfPlayer = (i) => gm.find((m) => m.entry_id === entryOf(i))?.level;
  ok(levelOfPlayer(5) === 1 && levelOfPlayer(3) === 1 && levelOfPlayer(0) === 2, "los mejores sembrados en el grupo 1");

  // A mano: Ana (siembra 6) sube al grupo 1 y Dani (siembra 3) baja al 2.
  const manual = Object.fromEntries(players.map((_, i) => [`group:${entryOf(i)}`, [0, 5, 4].includes(i) ? "1" : "2"]));
  r = await submitForm(rPath, admin, { ...manual, roundId: round.id });
  ok((await r.text()).includes("Grupos guardados"), "guarda los grupos a mano");
  gm = await members();
  ok(levelOfPlayer(0) === 1 && levelOfPlayer(3) === 2, "con los cambios");

  await submitForm(rPath, admin, { ...Object.fromEntries(players.map((_, i) => [`group:${entryOf(i)}`, i === 0 ? "1" : "2"])), roundId: round.id });
  r = await submitForm(rPath, admin, { roundId: round.id }, { contains: "Publicar" });
  ok((await r.text()).includes("al menos 2 jugadores"), "no publica con un grupo de 1");
  await submitForm(rPath, admin, { ...manual, roundId: round.id });

  section("publicar");
  r = await submitForm(rPath, admin, { roundId: round.id }, { contains: "Publicar" });
  ok((await r.text()).includes("Ronda publicada: 6 partidos"), "publica: 2 grupos de 3 → 6 partidos");
  const [pub] = await get(`rounds?id=eq.${round.id}&select=status`);
  const [tpub] = await get(`tournaments?id=eq.${t.id}&select=status`);
  ok(pub.status === "active" && tpub.status === "active", "ronda publicada y torneo en curso");
  ok((await (await asP0(`matches?round_id=eq.${round.id}&select=id`)).json()).length === 6, "el jugador ya ve los partidos");
  // Como texto: React separa nodos de texto contiguos con <!-- -->.
  const page = (await (await visit(`/jugador/torneos/${t.id}`, p0)).text()).replace(/<!-- -->/g, "");
  ok(page.includes("Tu grupo: Grupo 1") && page.includes("Fer QA") && page.includes("Eli QA"), "el jugador ve su grupo y sus rivales");
  ok(page.includes("Partidos a 2 sets."), "y el reglamento");
  const admPage = await (await visit(rPath, admin)).text();
  ok(admPage.includes("Por agendar") && !admPage.includes("Guardar grupos"), "el admin ve los partidos y ya no edita grupos");
  ok(!(await (await visit(tPath, admin)).text()).includes("Borrar torneo"), "un torneo con rondas publicadas no se borra");

  section("borrar en borrador");
  r = await submitForm("/club/torneos", admin, { name: "Para borrar", type: "round_robin", sport: "tennis", starts_on: "", ends_on: "" });
  const [rr] = await get(`tournaments?club_id=eq.${club.id}&name=eq.Para borrar&select=id,config`);
  ok(rr?.config.promote === 0 && rr.config.relegate === 0, "round robin sin ascensos ni descensos");
  r = await submitForm(`/club/torneos/${rr.id}`, admin, { id: rr.id }, { contains: "Borrar torneo" });
  ok(r.status === 303 && location(r) === "/club/torneos", "borra un torneo en borrador");
  ok((await get(`tournaments?id=eq.${rr.id}&select=id`)).length === 0, "y ya no existe");
} finally {
  for (const id of created) await deleteUser(id);
  await deleteClub(slug);
}

summary();
