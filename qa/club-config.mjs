/**
 * Paso 2 de la Fase 1: configuración del club y administradores múltiples,
 * contra la app corriendo + Supabase real.
 *
 *   QA_APP_URL=http://localhost:3100 ./qa/run.sh club-config
 */
import { rest, insert, deleteUser, deleteClub, login, sessionCookie, ok, section, summary, RUN } from "./lib.mjs";
import { APP, makeUser, visit, location, submitForm } from "./app.mjs";

const slug = `qa-conf-${RUN}`;
const slug2 = `qa-conf2-${RUN}`;
const otherSlug = `qa-otro-${RUN}`;
const created = [];

const club = async (s) => (await (await rest(`clubs?slug=eq.${s}&select=*`)).json())[0];
const base = (c, over = {}) => ({
  name: c.name, slug: c.slug, timezone: c.timezone, phone_country_code: c.phone_country_code,
  phone: "", address: "", brand_color: "#1f8a4c", logo_path: "", sports: "tennis", ...over,
});

try {
  const c = await insert("clubs", { slug, name: `Config QA ${RUN}` });
  const other = await insert("clubs", { slug: otherSlug, name: "Otro" });
  const adminEmail = `qa-cadm-${RUN}@example.com`;
  const playerEmail = `qa-cpl-${RUN}@example.com`;
  created.push(await makeUser(adminEmail, { app: { invited_role: "club_admin", club_id: c.id }, user: { first_name: "Ada" } }));
  const playerId = await makeUser(playerEmail, { user: { club_id: c.id, first_name: "Pepe", phone: "3311112222" } });
  created.push(playerId);
  const admin = sessionCookie(await login(adminEmail));
  const player = sessionCookie(await login(playerEmail));

  section("acceso");
  ok((await visit("/club/configuracion", admin)).status === 200, "admin ve Configuración");
  const r0 = await visit("/club/configuracion", player);
  ok(r0.status === 307 && location(r0) === "/jugador", "jugador no entra a Configuración");

  section("guardar configuración");
  let r = await submitForm("/club/configuracion", admin, base(c, {
    name: `Match Point QA ${RUN}`, address: "Av. del Tenis 1", phone: "3330001111", brand_color: "#123456",
  }));
  ok((await r.text()).includes("Cambios guardados"), "guarda los datos");
  let now = await club(slug);
  ok(now.name === `Match Point QA ${RUN}` && now.address === "Av. del Tenis 1" && now.brand_color === "#123456", "nombre, dirección y color en la base");

  r = await submitForm("/club/configuracion", admin, base(now, { brand_color: "rojo" }));
  ok((await r.text()).includes("Color hex"), "valida el color");

  r = await submitForm("/club/configuracion", admin, base(now, { slug: "jugador" }));
  ok((await r.text()).includes("reservado"), "rechaza un slug reservado");
  r = await submitForm("/club/configuracion", admin, base(now, { slug: otherSlug }));
  ok((await r.text()).includes("ya está en uso"), "rechaza el slug de otro club");

  r = await submitForm("/club/configuracion", admin, base(now, { logo_path: `${other.id}/logos/00000000-0000-0000-0000-000000000000.png` }));
  ok((await r.text()).includes("Imagen no válida"), "rechaza un logo de otro club");

  r = await submitForm("/club/configuracion", admin, base(now, { sports: "" }));
  ok((await r.text()).includes("al menos un deporte"), "exige al menos un deporte");

  section("lada del club");
  const [before] = await (await rest(`profiles?id=eq.${playerId}&select=phone_key`)).json();
  ok(before.phone_key === "+523311112222", "teléfono del jugador con lada 52");
  r = await submitForm("/club/configuracion", admin, base(now, { phone_country_code: "34" }));
  const [after] = await (await rest(`profiles?id=eq.${playerId}&select=phone_key`)).json();
  ok(after.phone_key === "+343311112222", "cambiar la lada recalcula el teléfono de los miembros");
  now = await club(slug);
  r = await submitForm("/club/configuracion", admin, base(now, { phone_country_code: "52" }));

  section("cambio de enlace");
  now = await club(slug);
  r = await submitForm("/club/configuracion", admin, base(now, { slug: slug2 }));
  ok((await r.text()).includes(`/${slug2}`), "avisa del enlace nuevo");
  ok((await visit(`/${slug2}`)).status === 200, "la página pública responde en el enlace nuevo");
  ok((await visit(`/${slug}`)).status === 404, "el enlace viejo deja de funcionar");

  section("un jugador no puede invocar la acción");
  // Reusa el formulario (con el id de la acción) pero con la cookie del jugador.
  const html = await (await visit("/club/configuracion", admin)).text();
  const formHtml = [...html.matchAll(/<form[^>]*>([\s\S]*?)<\/form>/g)].map((m) => m[1]).find((f) => f.includes('name="phone_country_code"'));
  const body = new FormData();
  for (const m of formHtml.matchAll(/<input([^>]*)>/g)) {
    const name = m[1].match(/name="([^"]*)"/)?.[1];
    const value = (m[1].match(/value="([^"]*)"/)?.[1] ?? "").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
    if (name) body.append(name.replace(/&quot;/g, '"'), value);
  }
  body.set("name", "Hackeado por jugador");
  await fetch(`${APP}/jugador`, { method: "POST", body, redirect: "manual", headers: { cookie: player, origin: APP } });
  ok((await club(slug2)).name !== "Hackeado por jugador", "la acción rechaza a un jugador");

  section("QR de registro");
  const qr = await visit("/api/qr?format=png", admin);
  ok(qr.status === 200 && qr.headers.get("content-type") === "image/png", "admin descarga el QR en PNG");
  ok((await visit("/api/qr?format=png", player)).status === 401, "un jugador no");

  section("segundo administrador");
  const admin2Email = `qa-cadm2-${RUN}@example.com`;
  r = await submitForm("/club/jugadores", admin, {
    firstName: "Beto", lastName: "Admin", email: admin2Email, phone: "3355556666", mode: "password", role: "club_admin", password: "Temporal-123",
  });
  ok((await r.text()).includes("Administrador creado"), "alta de un administrador");
  const [a2] = await (await rest(`profiles?email=eq.${admin2Email}&select=id,role,club_id`)).json();
  if (a2) created.push(a2.id);
  ok(a2?.role === "club_admin" && a2.club_id === c.id, "queda como club_admin del club");
  const admin2 = sessionCookie(await login(admin2Email, "Temporal-123"));
  ok((await visit("/club/configuracion", admin2)).status === 200, "el segundo admin entra a Configuración");
} finally {
  for (const id of created) await deleteUser(id);
  await deleteClub(slug);
  await deleteClub(slug2);
  await deleteClub(otherSlug);
}

summary();
