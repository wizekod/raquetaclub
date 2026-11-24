"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProfile } from "@/lib/auth/dal";
import { getMyClubAsAdmin } from "@/lib/clubs/queries";
import { createClubMember } from "@/lib/players/invite";
import { getPlanUsage, planLimitError, playersFull } from "@/lib/clubs/plan";
import {
  checkPhone,
  emailField,
  firstNameField,
  lastNameField,
  passwordField,
  phoneField,
} from "@/lib/players/schema";
import type { FormState } from "@/lib/forms";

const addSchema = z
  .object({
    firstName: firstNameField,
    lastName: lastNameField,
    email: emailField,
    phone: phoneField,
    mode: z.enum(["invite", "password"]),
    role: z.enum(["player", "club_admin"]).default("player"),
    password: z.string().optional(),
  })
  .superRefine((d, ctx) => {
    if (d.mode === "password") {
      const r = passwordField.safeParse(d.password ?? "");
      if (!r.success) ctx.addIssue({ code: "custom", path: ["password"], message: r.error.issues[0]!.message });
    }
  });

/**
 * Alta de un integrante por el admin del club: jugador o administrador, por
 * invitación o con contraseña temporal. Que el rol venga del formulario está
 * bien: quien llega aquí ya es admin y puede crear admins.
 */
export async function addPlayer(_prev: FormState, formData: FormData): Promise<FormState> {
  const club = await getMyClubAsAdmin();
  if (!club) return { error: "No tienes permiso para dar de alta jugadores." };

  const parsed = addSchema.safeParse({
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    mode: formData.get("mode"),
    role: formData.get("role") ?? undefined,
    password: formData.get("password") ?? undefined,
  });
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  const d = parsed.data;

  const phoneErr = checkPhone(d.phone, club.phone_country_code);
  if (phoneErr) return { fieldErrors: { phone: phoneErr } };

  if (d.role === "player") {
    const u = await getPlanUsage(club.id);
    if (playersFull(u)) {
      return { error: `El plan ${u.planName} del club permite hasta ${u.maxPlayers} jugadores activos. Da de baja a alguien o pide un cambio de plan.` };
    }
  }

  const r = await createClubMember(
    { email: d.email, firstName: d.firstName, lastName: d.lastName, phone: d.phone, clubId: club.id, role: d.role },
    d.mode === "password" ? d.password : undefined,
  );
  if (!r.ok) return r.field ? { fieldErrors: { [r.field]: [r.error] } } : { error: r.error };

  revalidatePath("/club/jugadores");
  const quien = d.role === "club_admin" ? "Administrador" : "Jugador";
  return {
    message:
      r.mode === "invite"
        ? `${quien} invitado: enviamos el enlace a ${d.email}.`
        : `${quien} creado. Comparte con ${d.firstName} su correo y la contraseña temporal; podrá cambiarla en Mi cuenta.`,
  };
}

type Result = { ok: true } | { ok: false; error: string };

/** Dar de baja o reactivar a un integrante del club. */
export async function setMemberStatus(profileId: string, status: "active" | "inactive"): Promise<Result> {
  const club = await getMyClubAsAdmin();
  const me = await getProfile();
  if (!club || !me) return { ok: false, error: "Sin permiso." };
  if (profileId === me.id) return { ok: false, error: "No puedes darte de baja a ti mismo." };

  // Con la sesión del admin: la RLS y la guarda de la base aplican.
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .update({ status })
    .eq("id", profileId)
    .eq("club_id", club.id)
    .select("id");
  if (error?.code === "RC422") return { ok: false, error: "El club necesita al menos un administrador activo." };
  const limit = planLimitError(error);
  if (limit) return { ok: false, error: limit };
  if (error || !data?.length) return { ok: false, error: "No se pudo actualizar." };

  // Al dar de baja se cierran sus sesiones abiertas.
  if (status === "inactive") {
    const { error: revokeError } = await createAdminClient().rpc("revoke_user_sessions", {
      p_user_id: profileId,
    });
    if (revokeError) console.error("[members] revoke sessions:", revokeError.message);
  }
  revalidatePath("/club/jugadores");
  return { ok: true };
}

/** Reenvía la invitación a quien aún no ha entrado nunca. */
export async function resendInvite(profileId: string): Promise<Result> {
  const club = await getMyClubAsAdmin();
  if (!club) return { ok: false, error: "Sin permiso." };

  const admin = createAdminClient();
  const { data: p } = await admin
    .from("profiles")
    .select("id, role, club_id, email, first_name, last_name, phone")
    .eq("id", profileId)
    .maybeSingle();
  if (!p || p.club_id !== club.id || !p.email || p.role === "superadmin") {
    return { ok: false, error: "No encontrado." };
  }

  const r = await createClubMember({
    email: p.email,
    firstName: p.first_name ?? "",
    lastName: p.last_name ?? "",
    phone: p.phone ?? "",
    clubId: club.id,
    role: p.role,
  });
  if (!r.ok) return { ok: false, error: r.error };
  revalidatePath("/club/jugadores");
  return { ok: true };
}

/**
 * Hacer administrador a un jugador del club, o devolver a un admin a jugador.
 * `profiles.role` sólo lo escribe el servidor (guarda en la base), así que va
 * con service_role tras comprobar que quien pide es admin del mismo club. La
 * base impide dejar el club sin admins (RC422).
 */
export async function setMemberRole(profileId: string, role: "player" | "club_admin"): Promise<Result> {
  const club = await getMyClubAsAdmin();
  const me = await getProfile();
  if (!club || !me) return { ok: false, error: "Sin permiso." };
  if (profileId === me.id) return { ok: false, error: "No puedes cambiar tu propio rol." };

  const { data, error } = await createAdminClient()
    .from("profiles")
    .update({ role })
    .eq("id", profileId)
    .eq("club_id", club.id)
    .in("role", ["player", "club_admin"])
    .select("id");
  if (error?.code === "RC422") return { ok: false, error: "El club necesita al menos un administrador activo." };
  const limit = planLimitError(error);
  if (limit) return { ok: false, error: limit };
  if (error || !data?.length) return { ok: false, error: "No se pudo cambiar el rol." };

  revalidatePath("/club/jugadores");
  return { ok: true };
}
