import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import type { ProfileRow, UserRole } from "@/lib/supabase/database.types";
import { roleHome } from "@/lib/auth/roles";

/**
 * Data Access Layer de autenticación/autorización (patrón recomendado por
 * Next.js: `proxy.ts` hace el chequeo optimista; aquí va el chequeo seguro).
 * `cache()` de-dupe las llamadas dentro del mismo request.
 */

export const getUser = cache(async (): Promise<User | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

/**
 * Columnas de `profiles` legibles por `authenticated`. El correo y el
 * teléfono NO se leen de la tabla (no tienen GRANT): van por la vista
 * `profile_contacts`, que decide fila a fila quién los ve. Un `select("*")`
 * aquí fallaría con "permission denied".
 */
export const PROFILE_COLUMNS =
  "id, role, club_id, first_name, last_name, avatar_path, status, created_at" as const;

export type SessionProfile = Pick<
  ProfileRow,
  "id" | "role" | "club_id" | "first_name" | "last_name" | "avatar_path" | "status" | "created_at"
>;

export const getProfile = cache(async (): Promise<SessionProfile | null> => {
  const user = await getUser();
  if (!user) return null;

  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .eq("id", user.id)
    .maybeSingle();

  return data;
});

/** Exige sesión. Sin ella → /login (con `next` para volver). */
export async function requireUser(nextPath?: string): Promise<User> {
  const user = await getUser();
  if (!user) {
    redirect(nextPath ? `/login?next=${encodeURIComponent(nextPath)}` : "/login");
  }
  return user;
}

/** Exige sesión + perfil. */
export async function requireProfile(nextPath?: string): Promise<SessionProfile> {
  await requireUser(nextPath);
  const profile = await getProfile();
  if (!profile) redirect("/login");
  return profile;
}

/**
 * Exige uno de los roles dados. Si el usuario tiene otro rol, lo manda a su
 * propio home en vez de a una página de error.
 */
export async function requireRole(
  ...roles: [UserRole, ...UserRole[]]
): Promise<SessionProfile> {
  const profile = await requireProfile();
  if (!roles.includes(profile.role)) {
    redirect(roleHome(profile.role));
  }
  // Un jugador o admin dado de baja por el club no entra a los paneles.
  if (profile.status !== "active") {
    // No a /login: con sesión, el proxy lo devolvería al panel (bucle).
    redirect("/auth/inactivo");
  }
  return profile;
}
