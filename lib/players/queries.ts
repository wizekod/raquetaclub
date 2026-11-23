import "server-only";

import { createClient } from "@/lib/supabase/server";
import { pendingUserIds } from "@/lib/players/invite";
import type { Enums } from "@/lib/supabase/database.types";

export type ClubMember = {
  id: string;
  role: Enums<"user_role">;
  firstName: string;
  lastName: string;
  status: Enums<"profile_status">;
  email: string | null;
  phone: string | null;
  pending: boolean;
  createdAt: string;
};

/**
 * Jugadores y admins del club del admin en sesión. El contacto sale de
 * `profile_contacts` (la tabla no lo expone). La RLS limita al club propio.
 */
export async function listClubMembers(clubId: string): Promise<ClubMember[]> {
  const supabase = await createClient();
  const [{ data: profiles }, { data: contacts }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, role, first_name, last_name, status, created_at")
      .eq("club_id", clubId)
      .order("last_name", { ascending: true }),
    supabase.from("profile_contacts").select("id, email, phone").eq("club_id", clubId),
  ]);

  const byId = new Map((contacts ?? []).map((c) => [c.id, c]));
  const pending = await pendingUserIds((profiles ?? []).map((p) => p.id));

  return (profiles ?? []).map((p) => ({
    id: p.id,
    role: p.role,
    firstName: p.first_name ?? "",
    lastName: p.last_name ?? "",
    status: p.status,
    email: byId.get(p.id)?.email ?? null,
    phone: byId.get(p.id)?.phone ?? null,
    pending: pending.has(p.id),
    createdAt: p.created_at,
  }));
}
