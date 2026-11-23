"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProfile } from "@/lib/auth/dal";
import { getMyClub, getMyClubAsAdmin, isSlugAvailable } from "@/lib/clubs/queries";
import { slugSchema, validateSlug } from "@/lib/clubs/slug";
import { TIMEZONE_VALUES, TRIAL_DAYS } from "@/lib/clubs/constants";
import { MEDIA_BUCKET, isOwnMediaPath } from "@/lib/storage/media";
import { emptyToUndefined, type FormState } from "@/lib/forms";
import { Constants } from "@/lib/supabase/database.types";

/** Comprobación en vivo del enlace del club (SlugField). */
export async function checkSlug(
  raw: string,
  exceptSelf = false,
): Promise<{ available: boolean; reason?: string }> {
  // Sólo quien crea o administra un club: no es un buscador público de slugs.
  const profile = await getProfile();
  if (profile?.role !== "club_admin") return { available: false, reason: "No autorizado." };

  const slug = raw.trim().toLowerCase();
  const syntax = validateSlug(slug);
  if (!syntax.ok) return { available: false, reason: syntax.reason };

  const except = exceptSelf ? (await getMyClub())?.id : undefined;
  return (await isSlugAvailable(slug, except))
    ? { available: true }
    : { available: false, reason: "Ese enlace ya está en uso." };
}

const createSchema = z.object({
  name: z.string().trim().min(2, "Mínimo 2 caracteres").max(80, "Máximo 80 caracteres"),
  slug: slugSchema,
  timezone: z.string().refine((tz) => TIMEZONE_VALUES.has(tz), "Zona horaria inválida"),
});

/**
 * Onboarding: crea el club y lo liga al dueño. Con service_role porque
 * `profiles.club_id` sólo lo escribe el servidor (guarda en la base). Sólo un
 * `club_admin` sin club puede hacerlo: un jugador no se fabrica un club.
 */
export async function createClub(_prev: FormState, formData: FormData): Promise<FormState> {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "club_admin" || profile.club_id) redirect("/club");

  const parsed = createSchema.safeParse({
    name: formData.get("name"),
    slug: formData.get("slug"),
    timezone: formData.get("timezone"),
  });
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  const { name, slug, timezone } = parsed.data;

  if (!(await isSlugAvailable(slug))) {
    return { fieldErrors: { slug: ["Ese enlace ya está en uso."] } };
  }

  const admin = createAdminClient();
  const { data: plan } = await admin
    .from("subscription_plans")
    .select("id")
    .eq("name", "Free")
    .maybeSingle();

  const { data: club, error } = await admin
    .from("clubs")
    .insert({
      name,
      slug,
      timezone,
      status: "trial",
      plan_id: plan?.id ?? null,
      trial_ends_at: new Date(Date.now() + TRIAL_DAYS * 86_400_000).toISOString(),
    })
    .select("id")
    .single();
  if (error || !club) {
    // Carrera con otro alta del mismo slug.
    if (error?.code === "23505") return { fieldErrors: { slug: ["Ese enlace ya está en uso."] } };
    console.error("[clubs] create:", error?.message);
    return { error: "No se pudo crear el club." };
  }

  const { error: linkError } = await admin
    .from("profiles")
    .update({ club_id: club.id })
    .eq("id", profile.id)
    .is("club_id", null);
  if (linkError) {
    await admin.from("clubs").delete().eq("id", club.id);
    console.error("[clubs] link owner:", linkError.message);
    return { error: "No se pudo crear el club." };
  }

  redirect("/club");
}

// ───────────────────────────── configuración ─────────────────────────────

const optionalText = (max: number) =>
  z.preprocess(emptyToUndefined, z.string().trim().max(max, `Máximo ${max} caracteres`).optional());

const settingsSchema = z.object({
  name: z.string().trim().min(2, "Mínimo 2 caracteres").max(80, "Máximo 80 caracteres"),
  slug: slugSchema,
  timezone: z.string().refine((tz) => TIMEZONE_VALUES.has(tz), "Zona horaria inválida"),
  phone_country_code: z.string().trim().regex(/^[1-9][0-9]{0,3}$/, "Sólo dígitos, ej. 52"),
  phone: optionalText(30),
  address: optionalText(200),
  brand_color: z.preprocess(
    emptyToUndefined,
    z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, "Color hex, ej. #1f8a4c").optional(),
  ),
  logo_path: optionalText(300),
  sports: z
    .array(z.enum(Constants.public.Enums.sport))
    .min(1, "Elige al menos un deporte"),
});

/** Configuración del club (RLS: sólo su admin; columnas de facturación, guardadas en la base). */
export async function updateClubSettings(_prev: FormState, formData: FormData): Promise<FormState> {
  const club = await getMyClubAsAdmin();
  if (!club) return { error: "No autorizado." };

  const parsed = settingsSchema.safeParse({
    name: formData.get("name"),
    slug: formData.get("slug"),
    timezone: formData.get("timezone"),
    phone_country_code: formData.get("phone_country_code"),
    phone: formData.get("phone"),
    address: formData.get("address"),
    brand_color: formData.get("brand_color"),
    logo_path: formData.get("logo_path"),
    sports: formData.getAll("sports").filter((v) => v !== ""),
  });
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  const d = parsed.data;

  if (d.slug !== club.slug && !(await isSlugAvailable(d.slug, club.id))) {
    return { fieldErrors: { slug: ["Ese enlace ya está en uso."] } };
  }

  // La ruta viene de un input oculto (entrada del usuario): sin comprobarla
  // se podría apuntar, y luego borrar, un fichero de otro club.
  const logo = d.logo_path ?? null;
  if (logo && !isOwnMediaPath(logo, club.id, "logos")) return { error: "Imagen no válida." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("clubs")
    .update({
      name: d.name,
      slug: d.slug,
      timezone: d.timezone,
      phone_country_code: d.phone_country_code,
      phone: d.phone ?? null,
      address: d.address ?? null,
      brand_color: d.brand_color ?? null,
      logo_path: logo,
      sports: d.sports,
    })
    .eq("id", club.id);
  if (error) {
    if (error.code === "23505") return { fieldErrors: { slug: ["Ese enlace ya está en uso."] } };
    if (error.code === "23514") return { fieldErrors: { slug: ["Ese enlace está reservado por el sistema."] } };
    console.error("[clubs] update:", error.message);
    return { error: "No se pudieron guardar los cambios." };
  }

  // Después del UPDATE y sólo si fue bien: al revés, el club apuntaría a un
  // fichero ya borrado.
  if (club.logo_path && club.logo_path !== logo) {
    const viejo = club.logo_path;
    after(async () => {
      await createAdminClient().storage.from(MEDIA_BUCKET).remove([viejo]);
    });
  }

  revalidatePath("/club", "layout");
  revalidatePath(`/${club.slug}`);
  if (d.slug !== club.slug) revalidatePath(`/${d.slug}`);
  return {
    message:
      d.slug !== club.slug
        ? `Cambios guardados. Tu nuevo enlace es /${d.slug}: el anterior deja de funcionar, vuelve a compartirlo.`
        : "Cambios guardados.",
  };
}
