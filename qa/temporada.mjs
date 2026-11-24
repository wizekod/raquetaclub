/**
 * Paso 10 de la Fase 1: simulación de una temporada de escalera de punta a
 * punta, contra la app + Supabase real.
 *
 * 15 jugadores en 3 grupos de 5, 3 rondas. Cada jugador tiene una "fuerza"
 * fija (gana siempre el más fuerte), así que las tablas y los movimientos
 * son predecibles:
 *  - el admin crea el torneo y la ronda 1, sugiere grupos por siembra y publica;
 *  - los ganadores suben el resultado por la RPC (uno por default) y la mitad
 *    los confirma el rival; el resto se autoconfirma al cerrar;
 *  - el cron (`/api/cron/tick`) cierra cada ronda al vencer la fecha límite y
 *    arma la siguiente con ascensos y descensos; el admin la publica;
 *  - un jugador nunca juega: tras 2 rondas sale por inactividad;
 *  - un nuevo inscrito a mitad de temporada entra al grupo más bajo;
 *  - al cerrar la última ronda el torneo termina y salen los premios.
 *
 *   QA_APP_URL=http://localhost:3100 ./qa/run.sh temporada
 */
import { rest, insert, deleteUser, deleteClub, login, sessionCookie, asUser, ok, section, summary, RUN } from "./lib.mjs";
import { APP, makeUser, submitForm, visit, location } from "./app.mjs";

const slug = `qa-temp-${RUN}`;
const created = [];
const TZ = "America/Mexico_City";
const get = async (path) => (await rest(path)).json();
const patch = (path, body) => rest(path, { method: "PATCH", body: JSON.stringify(body) });
const text = async (r) => (await r.text()).replace(/<!-- -->/g, "");
const localDay = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(Date.now() + d * 86_400_000));
const tick = () => fetch(`${APP}/api/cron/tick`, { headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` } }).then((r) => r.json());

try {
  const club = await insert("clubs", { slug, name: `Temporada QA ${RUN}`, timezone: TZ, status: "active" });
  const adminId = await makeUser(`qa-tadm-${RUN}@example.com`, { app: { invited_role: "club_admin", club_id: club.id }, user: { first_name: "Ada" } });
  created.push(adminId);
  const admin = sessionCookie(await login(`qa-tadm-${RUN}@example.com`));

  // Jugadores: siembra 1..15; fuerza = (siembra · 7) mod 15 (0 = el mejor), así
  // los grupos por siembra quedan mezclados. El de siembra 15 nunca juega.
  const players = [];
  const addPlayer = async (n, strength) => {
    const email = `qa-t${n}-${RUN}@example.com`;
    const id = await makeUser(email, { user: { club_id: club.id, first_name: `J${String(n).padStart(2, "0")}`, last_name: "QA" } });
    created.push(id);
    const session = await login(email);
    const p = { n, id, strength, session, token: session.access_token, name: `J${String(n).padStart(2, "0")} QA` };
    players.push(p);
    return p;
  };
  for (let seed = 1; seed <= 15; seed++) await addPlayer(seed, (seed * 7) % 15);
  const ghost = players[14];

  section("torneo y ronda 1");
  let r = await submitForm("/club/torneos", admin, { name: `Escalera ${RUN}`, type: "ladder", sport: "tennis", starts_on: localDay(-2), ends_on: "2030-12-31" });
  ok(r.status === 303, "el admin crea la escalera");
  const tId = location(r).split("/").pop();
  const tPath = `/club/torneos/${tId}`;
  const entryOf = new Map();
  for (const p of players) {
    const e = await insert("tournament_entries", { club_id: club.id, tournament_id: tId, player_id: p.id, status: "accepted", seed: p.n });
    entryOf.set(e.id, p);
    p.entry = e.id;
  }
  r = await submitForm(tPath, admin, { name: "Ronda 1", starts_on: localDay(-2), ends_on: localDay(20) }, { contains: "Crear ronda" });
  ok(r.status === 303 && location(r).includes("/rondas/"), "crea la ronda 1");
  let roundId = location(r).split("/").pop();
  await submitForm(`${tPath}/rondas/${roundId}`, admin, { roundId }, { contains: "Sugerir grupos" });

  const levels = async (rid) => {
    const groups = await get(`groups?round_id=eq.${rid}&select=id,level`);
    const lv = new Map(groups.map((g) => [g.id, g.level]));
    const members = await get(`group_members?round_id=eq.${rid}&select=group_id,entry_id`);
    return new Map(members.map((m) => [m.entry_id, lv.get(m.group_id)]));
  };
  let level = await levels(roundId);
  ok(level.size === 15 && [1, 2, 3].every((l) => [...level.values()].filter((x) => x === l).length === 5), "3 grupos de 5 por siembra");
  ok(level.get(players[0].entry) === 1 && level.get(ghost.entry) === 3, "siembra 1 al grupo 1, siembra 15 al grupo 3");

  /** Publica, juega y cierra una ronda; devuelve el id de la siguiente. */
  const playRound = async (n, rid, { defaultInTop = false } = {}) => {
    r = await submitForm(`${tPath}/rondas/${rid}`, admin, { roundId: rid }, { contains: "Publicar" });
    ok((await text(r)).includes("Ronda publicada"), `ronda ${n}: publicada`);
    const matches = await get(`matches?round_id=eq.${rid}&select=id,entry_a,entry_b,group_id`);
    const perGroup = (await get(`groups?round_id=eq.${rid}&select=id`)).length;
    ok(matches.length === perGroup * 10, `ronda ${n}: 10 partidos por grupo (${matches.length})`);

    const lvl = await levels(rid);
    let reported = 0;
    let rpcErrors = 0;
    // El default: el más fuerte del grupo 1 contra el segundo.
    const top2 = defaultInTop
      ? [...lvl].filter(([, L]) => L === 1).map(([e]) => entryOf.get(e)).sort((x, y) => x.strength - y.strength).slice(0, 2)
      : [];
    for (const [i, m] of matches.entries()) {
      const a = entryOf.get(m.entry_a);
      const b = entryOf.get(m.entry_b);
      if (a === ghost || b === ghost) continue;
      const [w, l] = a.strength < b.strength ? [a, b] : [b, a];
      const asDefault = top2.length === 2 && top2.includes(w) && top2.includes(l);
      const sets = w === a ? [[6, 3], [6, 4]] : [[3, 6], [4, 6]];
      const rep = await asUser(w.token)("rpc/report_result", {
        method: "POST",
        body: JSON.stringify({ p_match: m.id, p_result: asDefault ? "default" : "played", p_score: asDefault ? null : { sets } }),
      });
      if (!rep.ok) rpcErrors++;
      reported++;
      if (i % 2 === 0) {
        const conf = await asUser(l.token)("rpc/confirm_result", { method: "POST", body: JSON.stringify({ p_match: m.id }) });
        if (!conf.ok) rpcErrors++;
      }
    }
    ok(rpcErrors === 0 && reported > 0, `ronda ${n}: los ganadores suben ${reported} resultados y la mitad se confirman`);

    // Vence la fecha límite: el cron cierra.
    await patch(`rounds?id=eq.${rid}`, { results_deadline: new Date(Date.now() - 60_000).toISOString() });
    await tick();
    ok((await get(`rounds?id=eq.${rid}&select=status`))[0].status === "closed", `ronda ${n}: el cron la cierra en la fecha límite`);
    const left = await get(`matches?round_id=eq.${rid}&status=in.(reported,pending,scheduled)&select=id`);
    ok(left.length === 0, `ronda ${n}: lo reportado se confirma y lo no jugado queda cerrado`);

    // Tablas: dentro de cada grupo, por fuerza; el que no juega, al final.
    const snaps = await get(`standings_snapshots?round_id=eq.${rid}&select=entry_id,position,movement,points`);
    const byGroup = new Map();
    for (const s of snaps) {
      const L = lvl.get(s.entry_id);
      byGroup.set(L, [...(byGroup.get(L) ?? []), s]);
    }
    const last = Math.max(...byGroup.keys());
    let tablesOk = true;
    let movesOk = true;
    for (const [L, rows] of byGroup) {
      rows.sort((x, y) => x.position - y.position);
      const expected = [...rows]
        .map((s) => entryOf.get(s.entry_id))
        .sort((x, y) => (x === ghost) - (y === ghost) || x.strength - y.strength)
        .map((p) => p.entry);
      if (rows.map((s) => s.entry_id).join() !== expected.join()) tablesOk = false;
      const active = rows.filter((s) => s.movement !== "out");
      active.forEach((s, i) => {
        const want = i < 2 && L > 1 ? "up" : i >= active.length - 2 && L < last ? "down" : "stay";
        if (s.movement !== want) movesOk = false;
      });
    }
    ok(snaps.length === lvl.size && tablesOk, `ronda ${n}: tablas congeladas en el orden esperado`);
    ok(movesOk, `ronda ${n}: 2 suben y 2 bajan (el grupo 1 no sube, el último no baja)`);

    const [next] = await get(`rounds?tournament_id=eq.${tId}&number=eq.${n + 1}&select=id,status`);
    return { next, snaps, lvl };
  };

  section("ronda 1");
  let res = await playRound(1, roundId, { defaultInTop: true });
  ok(res.next?.status === "draft", "ronda 2 en borrador para que el admin la revise");
  const l2 = await levels(res.next.id);
  const shift = { up: -1, down: 1, stay: 0 };
  ok(res.snaps.every((s) => l2.get(s.entry_id) === res.lvl.get(s.entry_id) + shift[s.movement]), "los grupos de la ronda 2 aplican los movimientos");
  const top = res.snaps.find((s) => res.lvl.get(s.entry_id) === 1 && s.position === 1);
  ok(Number(top.points) === 3 * 3 + 2 + 0.25 * 3, `el 1.º del grupo 1 suma 3 victorias con bonus + 1 por default (${top.points})`);

  section("ronda 2 y nuevo inscrito");
  roundId = res.next.id;
  // Se inscribe a media temporada (después de armar la ronda 2): entra en la 3.
  const rookie = await addPlayer(16, 99);
  const re = await insert("tournament_entries", { club_id: club.id, tournament_id: tId, player_id: rookie.id, status: "accepted", seed: 16 });
  entryOf.set(re.id, rookie);
  rookie.entry = re.id;
  res = await playRound(2, roundId);
  ok((await get(`tournament_entries?id=eq.${ghost.entry}&select=status`))[0].status === "expelled", "2 rondas sin jugar → baja por inactividad");
  ok(res.snaps.find((s) => s.entry_id === ghost.entry)?.movement === "out", "sale de la escalera");
  const l3 = await levels(res.next.id);
  ok(!l3.has(ghost.entry) && l3.get(rookie.entry) === 3, "la ronda 3 no lo incluye y el nuevo entra al grupo más bajo");
  ok(l3.size === 15 && [1, 2, 3].every((l) => [...l3.values()].filter((x) => x === l).length === 5), "siguen 3 grupos de 5");

  section("ronda 3 y fin de temporada");
  roundId = res.next.id;
  const [r3] = await get(`rounds?id=eq.${roundId}&select=ends_on`);
  await patch(`tournaments?id=eq.${tId}`, { ends_on: r3.ends_on });
  res = await playRound(3, roundId);
  ok(!res.next, "es la última ronda: no se crea otra");
  ok((await get(`tournaments?id=eq.${tId}&select=status`))[0].status === "finished", "el torneo queda finalizado");

  // Más consistente: más veces 1.º del grupo 1.
  const roundIds = (await get(`rounds?tournament_id=eq.${tId}&select=id`)).map((x) => x.id);
  const level1 = new Set((await get(`groups?round_id=in.(${roundIds})&level=eq.1&select=id`)).map((g) => g.id));
  const all = await get(`standings_snapshots?round_id=in.(${roundIds})&position=eq.1&select=entry_id,group_id`);
  const firsts = new Map();
  for (const s of all) if (level1.has(s.group_id)) firsts.set(s.entry_id, (firsts.get(s.entry_id) ?? 0) + 1);
  const best = [...firsts].sort((a, b) => b[1] - a[1])[0];
  const page = await text(await visit(`${tPath}/ranking`, admin));
  ok(page.includes("Más consistente") && page.includes(entryOf.get(best[0]).name), `ranking final con premios (más consistente: ${entryOf.get(best[0]).name})`);
  const me = players[0];
  r = await visit(`/jugador/torneos/${tId}/ranking/${me.entry}`, sessionCookie(me.session));
  ok(r.status === 200 && (await text(r)).includes(me.name), "el jugador ve su historial de la temporada");
} finally {
  for (const id of created) await deleteUser(id);
  await deleteClub(slug);
}

summary();
