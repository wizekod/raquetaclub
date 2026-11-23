"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { createAdminClient } from "@/lib/supabase/admin";
import { getProfile } from "@/lib/auth/dal";
import { getMyClub, isSlugAvailable } from "@/lib/clubs/queries";
import { slugSchema, validateSlug } from "@/lib/clubs/slug";
import { TIMEZONE_VALUES, TRIAL_DAYS } from "@/lib/clubs/constants";
import type { FormState } from "@/lib/forms";

/** Comprobación en vivo del enlace del club (SlugField). */
export async function checkSlug(
  raw: string,
  exceptSelf = false,
): Promise<{ available: boolean; reason?: string }> {
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
