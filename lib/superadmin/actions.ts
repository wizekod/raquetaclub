"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { createAdminClient } from "@/lib/supabase/admin";
import { getProfile } from "@/lib/auth/dal";
import { MEDIA_BUCKET } from "@/lib/storage/media";
import { Constants, type Json } from "@/lib/supabase/database.types";
import { emptyToUndefined, type FormState } from "@/lib/forms";

/**
 * Acciones del superadmin. Escriben con service_role (las columnas de plan y
 * estado del club están protegidas para todos los demás), así que cada una
 * comprueba primero el rol. Stripe está en pausa: el plan se asigna a mano.
 */

async function assertSuperadmin(): Promise<boolean> {
  const profile = await getProfile();
  return profile?.role === "superadmin" && profile.status === "active";
}

function revalidateClub(id: string) {
  revalidatePath("/superadmin");
  revalidatePath(`/superadmin/clubes/${id}`);
}

// ──────────────────────────────── clubes ─────────────────────────────────

const clubSchema = z.object({
  id: z.uuid(),
  status: z.enum(Constants.public.Enums.club_status),
  plan_id: z.preprocess(emptyToUndefined, z.uuid().optional()),
  trial_ends_on: z.preprocess(emptyToUndefined, z.iso.date("Fecha no válida").optional()),
});

/** Plan, estado y fin de la prueba de un club. */
export async function updateClubPlan(_prev: FormState, formData: FormData): Promise<FormState> {
  if (!(await assertSuperadmin())) return { error: "No autorizado." };
  const parsed = clubSchema.safeParse(Object.fromEntries(["id", "status", "plan_id", "trial_ends_on"].map((k) => [k, formData.get(k) ?? undefined])));
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  const d = parsed.data;

  const { data, error } = await createAdminClient()
    .from("clubs")
    .update({
      status: d.status,
      plan_id: d.plan_id ?? null,
      trial_ends_at: d.trial_ends_on ? `${d.trial_ends_on}T23:59:59Z` : null,
    })
    .eq("id", d.id)
    .select("id");
  if (error || !data?.length) {
    if (error) console.error("[superadmin] club:", error.message);
    return { error: "No se pudo guardar." };
  }
  revalidateClub(d.id);
  return { message: d.status === "suspended" ? "Club suspendido: sus miembros ya no pueden entrar." : "Club guardado." };
}

/** Borra todo lo que el club tiene en Storage (logos, reglamentos, avatares). */
async function removeClubFiles(clubId: string): Promise<boolean> {
  const storage = createAdminClient().storage.from(MEDIA_BUCKET);
  const files: string[] = [];
  const walk = async (prefix: string): Promise<boolean> => {
    const { data, error } = await storage.list(prefix, { limit: 1000 });
    if (error) return false;
    for (const f of data) {
      // Las carpetas vienen sin id.
      if (f.id) files.push(`${prefix}/${f.name}`);
      else if (!(await walk(`${prefix}/${f.name}`))) return false;
    }
    return true;
  };
  if (!(await walk(clubId))) return false;
  for (let i = 0; i < files.length; i += 100) {
    const { error } = await storage.remove(files.slice(i, i + 100));
    if (error) return false;
  }
  return true;
}

/**
 * Borra un club y todo lo suyo. Irreversible: sólo si ya está suspendido y
 * se escribe su enlace para confirmar. Primero Storage (se puede reintentar),
 * luego la fila (las FK en cascada se llevan canchas, torneos, partidos,
 * avisos y perfiles) y al final las cuentas de sus miembros, que sin club
 * quedarían huérfanas.
 */
export async function deleteClub(_prev: FormState, formData: FormData): Promise<FormState> {
  if (!(await assertSuperadmin())) return { error: "No autorizado." };
  const id = String(formData.get("id") ?? "");
  const confirmSlug = String(formData.get("confirmSlug") ?? "").trim();

  const admin = createAdminClient();
  const { data: club } = await admin.from("clubs").select("slug, status").eq("id", id).maybeSingle();
  if (!club) return { error: "Club no encontrado." };
  if (club.status !== "suspended") return { error: "Suspende el club antes de borrarlo." };
  if (confirmSlug !== club.slug) return { fieldErrors: { confirmSlug: ["El enlace no coincide."] } };

  if (!(await removeClubFiles(id))) return { error: "No se pudieron borrar los archivos del club. Inténtalo de nuevo." };

  // Se leen antes: al borrar el club desaparecen sus perfiles.
  const { data: members } = await admin.from("profiles").select("id").eq("club_id", id).neq("role", "superadmin");
  const { error } = await admin.from("clubs").delete().eq("id", id);
  if (error) {
    console.error("[superadmin] delete club:", error.message);
    return { error: "No se pudo borrar el club." };
  }
  let failed = 0;
  for (const m of members ?? []) {
    const { error: userError } = await admin.auth.admin.deleteUser(m.id);
    if (userError) failed++;
  }
  if (failed) console.error(`[superadmin] delete club: ${failed} cuenta(s) sin borrar`);

  revalidatePath("/superadmin");
  redirect("/superadmin?borrado=1");
}

// ──────────────────────────────── planes ─────────────────────────────────

const limit = z.preprocess(
  emptyToUndefined,
  z.coerce.number({ error: "Número no válido" }).int("Número entero").min(0, "Mínimo 0").max(1_000_000).optional(),
);

const planSchema = z.object({
  id: z.preprocess(emptyToUndefined, z.uuid().optional()),
  name: z.string().trim().min(2, "Mínimo 2 caracteres").max(40, "Máximo 40 caracteres"),
  price: z.coerce.number({ error: "Número no válido" }).min(0, "Mínimo 0").max(9_999_999),
  max_players: limit,
  max_active_tournaments: limit,
  whatsapp: z.preprocess((v) => v === "on", z.boolean()),
});

/** Crea o edita un plan. Un límite vacío = ilimitado. */
export async function savePlan(_prev: FormState, formData: FormData): Promise<FormState> {
  if (!(await assertSuperadmin())) return { error: "No autorizado." };
  const parsed = planSchema.safeParse(
    Object.fromEntries(["id", "name", "price", "max_players", "max_active_tournaments", "whatsapp"].map((k) => [k, formData.get(k) ?? undefined])),
  );
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  const d = parsed.data;

  const admin = createAdminClient();
  // Se conservan las demás banderas del plan.
  let features: Record<string, unknown> = {};
  if (d.id) {
    const { data: current } = await admin.from("subscription_plans").select("features").eq("id", d.id).maybeSingle();
    if (!current) return { error: "Plan no encontrado." };
    features = (current.features ?? {}) as Record<string, unknown>;
  }
  const row = {
    name: d.name,
    price: d.price,
    max_players: d.max_players ?? null,
    max_active_tournaments: d.max_active_tournaments ?? null,
    features: { ...features, whatsapp: d.whatsapp } as Json,
  };
  const { error } = d.id
    ? await admin.from("subscription_plans").update(row).eq("id", d.id)
    : await admin.from("subscription_plans").insert(row);
  if (error) {
    if (error.code === "23505") return { fieldErrors: { name: ["Ya existe un plan con ese nombre."] } };
    console.error("[superadmin] plan:", error.message);
    return { error: "No se pudo guardar el plan." };
  }
  revalidatePath("/superadmin", "layout");
  return { message: d.id ? "Plan guardado." : "Plan creado." };
}
