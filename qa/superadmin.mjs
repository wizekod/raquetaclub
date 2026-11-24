/**
 * Paso 9 de la Fase 1 (sin Stripe): panel del superadmin (planes, plan y
 * estado de cada club, borrar), límites del plan y club suspendido, contra la
 * app + Supabase real.
 *
 *   QA_APP_URL=http://localhost:3100 ./qa/run.sh superadmin
 */
import { rest, insert, deleteUser, deleteClub, login, sessionCookie, asUser, ok, section, summary, RUN, URL_BASE } from "./lib.mjs";
import { makeUser, submitForm, visit, location, svc } from "./app.mjs";

const slug = `qa-sa-${RUN}`;
const planName = `QA Mini ${RUN}`;
const created = [];
const get = async (path) => (await rest(path)).json();
const text = async (r) => (await r.text()).replace(/<!-- -->/g, "");

try {
  const superId = await makeUser(`qa-super-${RUN}@example.com`);
  created.push(superId);
  await rest(`profiles?id=eq.${superId}`, { method: "PATCH", body: JSON.stringify({ role: "superadmin", club_id: null }) });
  const sa = sessionCookie(await login(`qa-super-${RUN}@example.com`));

  const club = await insert("clubs", { slug, name: `Superadmin QA ${RUN}`, status: "trial" });
  const adminEmail = `qa-sadm-${RUN}@example.com`;
  const adminId = await makeUser(adminEmail, { app: { invited_role: "club_admin", club_id: club.id }, user: { first_name: "Ada" } });
  created.push(adminId);
  const admin = sessionCookie(await login(adminEmail));
  const mkPlayer = async (i) => {
    const id = await makeUser(`qa-sp${i}-${RUN}@example.com`, { user: { club_id: club.id, first_name: `J${i}`, last_name: "QA" } });
    created.push(id);
    return id;
  };

  section("planes");
  let r = await submitForm("/superadmin/planes", sa, { name: planName, price: "499", max_players: "2", max_active_tournaments: "1" }, { contains: "Crear plan" });
  ok((await text(r)).includes("Plan creado."), "crea un plan");
  const [plan] = await get(`subscription_plans?name=eq.${encodeURIComponent(planName)}&select=id,price,max_players,max_active_tournaments,features`);
  ok(plan && plan.max_players === 2 && plan.max_active_tournaments === 1 && Number(plan.price) === 499 && plan.features.whatsapp === false, "con sus límites");
  r = await submitForm("/superadmin/planes", sa, { name: "Free", price: "0" }, { contains: "Crear plan" });
  ok((await text(r)).includes("Ya existe un plan con ese nombre"), "nombre repetido → error");
  r = await visit("/superadmin/planes", admin);
  ok(r.status === 307 && location(r) === "/club", "un admin de club no entra a planes");

  section("plan del club");
  const clubPath = `/superadmin/clubes/${club.id}`;
  r = await submitForm(clubPath, sa, { id: club.id, plan_id: plan.id, status: "active", trial_ends_on: "" }, { contains: "Plan y estado" });
  ok((await text(r)).includes("Club guardado."), "asigna el plan");
  let [c] = await get(`clubs?id=eq.${club.id}&select=plan_id,status`);
  ok(c.plan_id === plan.id && c.status === "active", "plan y estado guardados");
  ok((await text(await visit("/superadmin", sa))).includes(`Superadmin QA ${RUN}`), "el club aparece en la lista con sus métricas");

  section("límite de jugadores");
  await mkPlayer(1);
  await mkPlayer(2);
  ok((await text(await visit("/club", admin))).includes("Jugadores activos: 2 de 2"), "el admin ve su uso del plan");
  r = await submitForm("/club/jugadores", admin, {
    firstName: "Tres", lastName: "QA", email: `qa-sp3-${RUN}@example.com`, phone: "3312345678", mode: "password", password: "Qa-passw0rd!", role: "player",
  });
  ok((await text(r)).includes("permite hasta 2 jugadores activos"), "el admin no da de alta más jugadores");
  ok((await get(`profiles?email=eq.qa-sp3-${RUN}@example.com&select=id`)).length === 0, "y no se crea la cuenta");
  ok((await text(await visit(`/${slug}/registro`))).includes("no tiene lugares disponibles"), "el registro público avisa que no hay lugar");
  const direct = await fetch(`${URL_BASE}/auth/v1/admin/users`, {
    method: "POST",
    headers: svc,
    body: JSON.stringify({ email: `qa-sp4-${RUN}@example.com`, password: "Qa-passw0rd!", email_confirm: true, user_metadata: { club_id: club.id } }),
  });
  if (direct.ok) created.push((await direct.json()).id);
  ok(!direct.ok, "ni un alta directa contra Supabase pasa del límite (lo hace cumplir la base)");

  section("límite de torneos");
  r = await submitForm("/club/torneos", admin, { name: `T1 ${RUN}`, type: "ladder", sport: "tennis" });
  ok(r.status === 303, "crea el primer torneo");
  await rest(`tournaments?club_id=eq.${club.id}`, { method: "PATCH", body: JSON.stringify({ status: "registration" }) });
  r = await submitForm("/club/torneos", admin, { name: `T2 ${RUN}`, type: "ladder", sport: "tennis" });
  ok((await text(r)).includes("permite hasta 1 torneo(s) sin finalizar"), "el segundo choca con el plan");

  section("club suspendido");
  const p1 = await login(`qa-sp1-${RUN}@example.com`);
  const seen = () => asUser(p1.access_token)(`tournaments?club_id=eq.${club.id}&select=id`).then((x) => x.json());
  ok((await seen()).length === 1, "antes, el jugador ve el torneo del club");
  r = await submitForm(clubPath, sa, { id: club.id, plan_id: plan.id, status: "suspended", trial_ends_on: "" }, { contains: "Plan y estado" });
  ok((await text(r)).includes("Club suspendido"), "el superadmin suspende el club");
  r = await visit("/club", admin);
  ok(r.status === 307 && location(r) === "/auth/suspendido", "el admin ve el aviso de club suspendido");
  r = await visit("/jugador", sessionCookie(p1));
  ok(r.status === 307 && location(r) === "/auth/suspendido", "el jugador también");
  ok((await seen()).length === 0, "la RLS ya no le deja ver los torneos");
  ok((await visit(`/${slug}`)).status === 404, "la página pública deja de existir");
  r = await submitForm(clubPath, sa, { id: club.id, plan_id: plan.id, status: "active", trial_ends_on: "" }, { contains: "Plan y estado" });
  ok((await visit("/club", admin)).status === 200, "al reactivarlo, el admin vuelve a entrar");

  section("borrar club");
  r = await submitForm(clubPath, sa, { confirmSlug: slug, id: club.id }).catch(() => null);
  ok(r === null, "con el club activo no se ofrece borrar");
  await submitForm(clubPath, sa, { id: club.id, plan_id: plan.id, status: "suspended", trial_ends_on: "" }, { contains: "Plan y estado" });
  r = await submitForm(clubPath, sa, { id: club.id, confirmSlug: "otro" }, { contains: "Borrar club" });
  ok((await text(r)).includes("El enlace no coincide"), "pide escribir el enlace exacto");
  r = await submitForm(clubPath, sa, { id: club.id, confirmSlug: slug }, { contains: "Borrar club" });
  ok(r.status === 303 && location(r).startsWith("/superadmin?borrado=1"), "borra el club");
  ok((await get(`clubs?id=eq.${club.id}&select=id`)).length === 0, "ya no existe");
  const gone = await fetch(`${URL_BASE}/auth/v1/admin/users/${adminId}`, { headers: svc });
  ok(gone.status === 404, "y se borran las cuentas de sus miembros");
} finally {
  for (const id of created) await deleteUser(id);
  await deleteClub(slug);
  await rest(`subscription_plans?name=eq.${encodeURIComponent(planName)}`, { method: "DELETE" });
}

summary();
