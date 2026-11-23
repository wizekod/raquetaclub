/**
 * Paso 1 de la Fase 1 contra la app corriendo + Supabase real:
 *  · ruteo por rol de /club, /jugador, /superadmin y /onboarding;
 *  · baja de jugador → /auth/inactivo;
 *  · formularios reales (sin JS, como un navegador básico): login, alta de
 *    jugador por el admin con contraseña temporal y registro en /{slug}/registro.
 *
 *   QA_APP_URL=http://localhost:3100 ./qa/run.sh auth-paneles
 */
import { rest, insert, deleteUser, deleteClub, login, sessionCookie, ok, section, summary, RUN } from "./lib.mjs";
import { makeUser, visit, location, submitForm } from "./app.mjs";

const slug = `qa-paneles-${RUN}`;
const created = [];
const cookieFor = async (email) => sessionCookie(await login(email));

try {
  const club = await insert("clubs", { slug, name: `Club QA ${RUN}` });

  const adminEmail = `qa-adm-${RUN}@example.com`;
  const playerEmail = `qa-pl-${RUN}@example.com`;
  const ownerEmail = `qa-own-${RUN}@example.com`;
  created.push(await makeUser(adminEmail, { app: { invited_role: "club_admin", club_id: club.id }, user: { first_name: "Ada", last_name: "Admin" } }));
  const playerId = await makeUser(playerEmail, { user: { club_id: club.id, first_name: "Pepe", last_name: "Player", phone: "3311112222" } });
  created.push(playerId);
  created.push(await makeUser(ownerEmail, { user: { first_name: "Olga" } }));

  const admin = await cookieFor(adminEmail);
  const player = await cookieFor(playerEmail);
  const owner = await cookieFor(ownerEmail);

  section("ruteo por rol");
  ok((await visit("/club", admin)).status === 200, "admin entra a /club");
  let r = await visit("/jugador", admin);
  ok(r.status === 307 && location(r) === "/club", "admin en /jugador → /club");
  r = await visit("/club", player);
  ok(r.status === 307 && location(r) === "/jugador", "jugador en /club → /jugador");
  ok((await visit("/jugador", player)).status === 200, "jugador entra a /jugador");
  r = await visit("/superadmin", player);
  ok(r.status === 307 && location(r) === "/jugador", "jugador en /superadmin → /jugador");
  r = await visit("/club", owner);
  ok(r.status === 307 && location(r) === "/onboarding", "dueño sin club en /club → /onboarding");
  ok((await visit("/onboarding", owner)).status === 200, "dueño sin club ve el onboarding");
  r = await visit("/onboarding", admin);
  ok(r.status === 307 && location(r) === "/club", "admin con club en /onboarding → /club");
  r = await visit("/login", player);
  ok(r.status === 307, "con sesión, /login redirige");

  section("páginas públicas");
  const pub = await visit(`/${slug}`);
  ok(pub.status === 200 && (await pub.text()).includes(`Club QA ${RUN}`), "página pública del club");
  ok((await visit(`/${slug}/registro`)).status === 200, "registro de jugador del club");
  ok((await visit(`/no-existe-${RUN}`)).status === 404, "slug inexistente → 404");

  section("panel de jugadores (admin)");
  const page = await (await visit("/club/jugadores", admin)).text();
  ok(page.includes("Pepe Player"), "admin ve al jugador en la lista");
  ok(page.includes(playerEmail), "admin ve el correo del jugador");

  const newEmail = `qa-alta-${RUN}@example.com`;
  r = await submitForm("/club/jugadores", admin, {
    firstName: "Nora", lastName: "Nueva", email: newEmail, phone: "33 2222 3333", mode: "password", password: "Temporal-123",
  });
  ok(r.status === 200, `alta con contraseña temporal responde 200 (fue ${r.status})`);
  const [nuevo] = await (await rest(`profiles?email=eq.${newEmail}&select=id,role,club_id,phone_key`)).json();
  if (nuevo) created.push(nuevo.id);
  ok(nuevo?.role === "player" && nuevo.club_id === club.id, "el alta del admin crea un player del club");
  ok(nuevo?.phone_key === "+523322223333", "con teléfono normalizado");
  ok(!!(await login(newEmail, "Temporal-123")).access_token, "el jugador entra con la contraseña temporal");

  r = await submitForm("/club/jugadores", admin, {
    firstName: "Otra", lastName: "Vez", email: newEmail, phone: "3322223333", mode: "password", password: "Temporal-123",
  });
  ok((await r.text()).includes("ya tiene una cuenta activa"), "no duplica un correo que ya entró");

  r = await submitForm("/club/jugadores", admin, {
    firstName: "Tel", lastName: "Corto", email: `qa-tel-${RUN}@example.com`, phone: "123", mode: "password", password: "Temporal-123",
  });
  ok((await r.text()).includes("10 dígitos"), "valida el largo del teléfono (México: 10)");

  section("registro público de jugador");
  // El alta real manda un correo de confirmación, y Supabase rechaza dominios
  // de prueba (example.com): aquí se validan los caminos hasta signUp. La
  // creación del perfil por user_metadata.club_id la cubre fase0-smoke.
  r = await submitForm(`/${slug}/registro`, null, {
    firstName: "Rita", lastName: "Registro", phone: "123", email: `qa-reg-${RUN}@example.com`, password: "Registro-123",
  });
  ok((await r.text()).includes("10 dígitos"), "registro valida el teléfono con la lada del club");
  r = await submitForm(`/${slug}/registro`, null, {
    firstName: "Rita", lastName: "Registro", phone: "3344445555", email: `qa-reg-${RUN}@example.com`, password: "Registro-123",
  });
  const regText = await r.text();
  // Supabase o el SMTP (Resend) rechazan example.com, o corta el límite de
  // correos/hora: cualquiera prueba que el formulario llegó a signUp.
  ok(
    regText.includes("no es válido") || regText.includes("correo de confirmación"),
    "registro llega a Supabase y muestra su rechazo",
  );
  r = await submitForm(`/${slug}/registro`, null, {
    slug: `no-existe-${RUN}`, firstName: "X", lastName: "Y", phone: "3344445555", email: `qa-x-${RUN}@example.com`, password: "Registro-123",
  });
  ok((await r.text()).includes("no está disponible"), "registro con slug manipulado → club no disponible");

  section("login con formulario");
  r = await submitForm("/login", null, { email: playerEmail, password: "Qa-passw0rd!" });
  ok(r.status === 303 && location(r) === "/jugador", `login de jugador → /jugador (fue ${r.status} ${location(r)})`);
  r = await submitForm("/login", null, { email: playerEmail, password: "mala" });
  ok((await r.text()).includes("Correo o contraseña incorrectos"), "contraseña incorrecta muestra error");

  section("baja de jugador");
  await rest(`profiles?id=eq.${playerId}`, { method: "PATCH", body: JSON.stringify({ status: "inactive" }) });
  r = await visit("/jugador", player);
  ok(r.status === 307 && location(r) === "/auth/inactivo", "jugador dado de baja → /auth/inactivo");
  r = await submitForm("/login", null, { email: playerEmail, password: "Qa-passw0rd!" });
  ok((await r.text()).includes("dada de baja"), "jugador dado de baja no puede iniciar sesión");
} finally {
  for (const id of created) await deleteUser(id);
  await deleteClub(slug);
}

summary();
