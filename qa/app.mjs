/**
 * Helpers para probar la app corriendo (no sólo la API): visitar páginas con
 * la sesión de un usuario y enviar formularios reales como un navegador sin JS.
 *   QA_APP_URL=http://localhost:3100 (por defecto :3000)
 */
import { URL_BASE } from "./lib.mjs";

export const APP = (process.env.QA_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
export const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
export const svc = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" };

export async function makeUser(email, { app = {}, user = {} } = {}) {
  const r = await fetch(`${URL_BASE}/auth/v1/admin/users`, {
    method: "POST",
    headers: svc,
    body: JSON.stringify({ email, password: "Qa-passw0rd!", email_confirm: true, app_metadata: app, user_metadata: user }),
  });
  const u = await r.json();
  if (!r.ok) throw new Error(`createUser: ${JSON.stringify(u)}`);
  return u.id;
}

/** GET sin seguir redirecciones. */
export const visit = (path, cookie) =>
  fetch(`${APP}${path}`, { redirect: "manual", headers: cookie ? { cookie } : {} });
export const location = (r) => (r.headers.get("location") ?? "").replace(APP, "");

const decode = (s) => s.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");

/**
 * Envía el formulario de la página como lo haría un navegador sin JS:
 * los campos ocultos de React ($ACTION_*) + los nuestros, en multipart.
 */
export async function submitForm(path, cookie, fields, { contains } = {}) {
  const html = await (await visit(path, cookie)).text();
  // El formulario que tiene el primer campo que enviamos (la barra lateral
  // también tiene uno: cerrar sesión) y, si se indica, cierto texto (varios
  // formularios de la página pueden tener los mismos campos).
  const key = Object.keys(fields)[0];
  const form = [...html.matchAll(/<form[^>]*>([\s\S]*?)<\/form>/g)]
    .map((m) => m[1])
    .find((f) => f.includes(`name="${key}"`) && (!contains || f.includes(contains)));
  if (!form) throw new Error(`sin formulario con ${key} en ${path}`);
  const body = new FormData();
  for (const m of form.matchAll(/<input([^>]*)>/g)) {
    const name = m[1].match(/name="([^"]*)"/)?.[1];
    const value = m[1].match(/value="([^"]*)"/)?.[1] ?? "";
    if (name && (name.startsWith("$ACTION") || !(decode(name) in fields))) body.append(decode(name), decode(value));
  }
  for (const [k, v] of Object.entries(fields)) body.set(k, v);
  return fetch(`${APP}${path}`, {
    method: "POST",
    body,
    redirect: "manual",
    headers: { origin: APP, ...(cookie ? { cookie } : {}) },
  });
}

