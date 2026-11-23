/**
 * Humo de la Fase 0 contra el Supabase real: alta de usuarios por los tres
 * caminos de `handle_new_user`, RLS con sesiones de verdad y la vista
 * `profile_contacts`. Crea un club `qa-…` y lo borra al terminar.
 *
 *   ./qa/run.sh fase0-smoke
 */
import { URL_BASE, rest, insert, asUser, deleteUser, deleteClub, ok, section, summary, RUN } from "./lib.mjs";

const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const svc = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" };

async function adminCreate(email, { app = {}, user = {} } = {}) {
  const r = await fetch(`${URL_BASE}/auth/v1/admin/users`, {
    method: "POST",
    headers: svc,
    body: JSON.stringify({ email, password: "Qa-passw0rd!", email_confirm: true, app_metadata: app, user_metadata: user }),
  });
  const u = await r.json();
  if (!r.ok) throw new Error(`createUser: ${JSON.stringify(u)}`);
  const s = await fetch(`${URL_BASE}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "Qa-passw0rd!" }),
  });
  const sess = await s.json();
  return { uid: u.id, token: sess.access_token };
}

const slugA = `qa-a-${RUN}`;
const slugB = `qa-b-${RUN}`;
const users = [];

try {
  const clubA = await insert("clubs", { slug: slugA, name: "QA A" });
  const clubB = await insert("clubs", { slug: slugB, name: "QA B" });

  section("alta de usuarios");
  const admin = await adminCreate(`qa-admin-${RUN}@example.com`, { app: { invited_role: "club_admin", club_id: clubA.id } });
  const p1 = await adminCreate(`qa-p1-${RUN}@example.com`, { user: { club_id: clubA.id, first_name: "Ana", last_name: "Uno", phone: "3312345678" } });
  const p2 = await adminCreate(`qa-p2-${RUN}@example.com`, { user: { club_id: clubA.id, first_name: "Beto", last_name: "Dos", phone: "3387654321" } });
  const pb = await adminCreate(`qa-pb-${RUN}@example.com`, { user: { club_id: clubB.id, first_name: "Bruno" } });
  const sneaky = await adminCreate(`qa-sneaky-${RUN}@example.com`, { user: { club_id: clubA.id, invited_role: "club_admin" } });
  users.push(admin, p1, p2, pb, sneaky);

  const prof = async (uid) => (await (await rest(`profiles?id=eq.${uid}&select=role,club_id,email,phone_key`)).json())[0];
  const pa = await prof(admin.uid);
  ok(pa?.role === "club_admin" && pa.club_id === clubA.id, "invitación (app_metadata) → club_admin");
  const pp = await prof(p1.uid);
  ok(pp?.role === "player" && pp.club_id === clubA.id, "autorregistro → player del club");
  ok(pp?.phone_key === "+523312345678", "phone_key E.164");
  ok((await prof(sneaky.uid))?.role === "player", "invited_role en user_metadata se ignora");

  section("RLS con sesión real");
  const asP1 = asUser(p1.token), asAdmin = asUser(admin.token), asPb = asUser(pb.token);
  ok((await asP1("profiles?select=email")).status >= 400, "jugador no lee profiles.email");
  const visibles = await (await asP1("profiles?select=id")).json();
  ok(Array.isArray(visibles) && visibles.length === 4, `jugador ve los 4 perfiles de su club (vio ${visibles.length})`);
  ok((await (await asPb("profiles?select=id")).json()).length === 1, "jugador de otro club sólo se ve a sí mismo");
  const roleHack = await asP1(`profiles?id=eq.${p1.uid}`, { method: "PATCH", body: JSON.stringify({ role: "club_admin" }) });
  ok(roleHack.status >= 400, "jugador no se cambia el rol");

  const court = await asAdmin("courts", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ club_id: clubA.id, name: "Cancha 1" }) });
  ok(court.status === 201, "admin crea cancha");
  const courtB = await asAdmin("courts", { method: "POST", body: JSON.stringify({ club_id: clubB.id, name: "Intrusa" }) });
  ok(courtB.status >= 400, "admin no crea canchas en otro club");
  ok((await asP1("courts", { method: "POST", body: JSON.stringify({ club_id: clubA.id, name: "X" }) })).status >= 400, "jugador no crea canchas");

  const t = await insert("tournaments", { club_id: clubA.id, name: "Escalera QA", type: "ladder", status: "registration", registration_open: true });
  const selfAccept = await asP1("tournament_entries", { method: "POST", body: JSON.stringify({ club_id: clubA.id, tournament_id: t.id, player_id: p1.uid, status: "accepted" }) });
  ok(selfAccept.status >= 400, "jugador no se autoacepta");
  const signup = await asP1("tournament_entries", { method: "POST", body: JSON.stringify({ club_id: clubA.id, tournament_id: t.id, player_id: p1.uid }) });
  ok(signup.status === 201, "jugador se inscribe (pending)");

  section("profile_contacts");
  const own = await (await asP1("profile_contacts?select=id,email,phone")).json();
  ok(own.length === 1 && own[0].email, "sin partidos: sólo ve su propio contacto");
  const adminContacts = await (await asAdmin("profile_contacts?select=id,email")).json();
  ok(adminContacts.length === 4, "admin ve contactos de todo su club");
} finally {
  for (const u of users) await deleteUser(u.uid);
  await deleteClub(slugA);
  await deleteClub(slugB);
}

summary();
