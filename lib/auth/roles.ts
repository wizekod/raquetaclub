import type { UserRole } from "@/lib/supabase/database.types";

/** Ruta "home" de cada rol tras iniciar sesión (CLAUDE.md §3, rutas por prefijo). */
export function roleHome(role: UserRole): "/club" | "/jugador" | "/superadmin" {
  switch (role) {
    case "superadmin":
      return "/superadmin";
    case "club_admin":
      return "/club";
    case "player":
      return "/jugador";
  }
}

export const ROLE_LABEL: Record<UserRole, string> = {
  superadmin: "Superadmin",
  club_admin: "Administrador de club",
  player: "Jugador",
};
