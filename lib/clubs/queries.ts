import "server-only";

import { cache } from "react";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ClubRow } from "@/lib/supabase/database.types";
import { getProfile } from "@/lib/auth/dal";

/** Club del usuario actual (vía RLS). `null` si no pertenece a ninguno. */
export const getMyClub = cache(async (): Promise<ClubRow | null> => {
  const profile = await getProfile();
  if (!profile?.club_id) return null;

  const supabase = await createClient();
  const { data } = await supabase
    .from("clubs")
    .select("*")
    .eq("id", profile.club_id)
    .maybeSingle();
  return data;
});

/**
 * Club del usuario actual **sólo si es su administrador activo**.
 *
 * `getMyClub()` también devuelve club para un jugador, que lo necesita (zona
 * horaria, nombre). No sirve como autorización: toda acción de servidor que
 * escriba con `service_role` — que salta la RLS — tiene que usar ésta.
 */
export async function getMyClubAsAdmin(): Promise<ClubRow | null> {
  const profile = await getProfile();
  if (profile?.role !== "club_admin" || profile.status !== "active") return null;
  return getMyClub();
}

/** Datos públicos de un club por slug (página pública y registro). */
export const getPublicClub = cache(async (slug: string) => {
  const admin = createAdminClient();
  const { data } = await admin
    .from("clubs")
    .select("id, slug, name, logo_path, brand_color, address, phone, phone_country_code, sports, status, timezone")
    .eq("slug", slug)
    .maybeSingle();
  if (!data || data.status === "suspended") return null;
  return data;
});

/**
 * ¿El slug está libre? Con el cliente admin (sólo lectura): la RLS no deja a
 * un admin ver clubes ajenos. `exceptClubId` conserva el propio al editar.
 */
export async function isSlugAvailable(slug: string, exceptClubId?: string): Promise<boolean> {
  const admin = createAdminClient();
  let query = admin.from("clubs").select("id").eq("slug", slug).limit(1);
  if (exceptClubId) query = query.neq("id", exceptClubId);
  const { data, error } = await query;
  if (error) throw error;
  return (data?.length ?? 0) === 0;
}
