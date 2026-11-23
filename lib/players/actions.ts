"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProfile } from "@/lib/auth/dal";
import { getMyClubAsAdmin } from "@/lib/clubs/queries";
import { createClubMember } from "@/lib/players/invite";
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
    password: z.string().optional(),
  })
  .superRefine((d, ctx) => {
    if (d.mode === "password") {
      const r = passwordField.safeParse(d.password ?? "");
      if (!r.success) ctx.addIssue({ code: "custom", path: ["password"], message: r.error.issues[0]!.message });
    }
  });

/** Alta de jugador por el admin del club (invitación o contraseña temporal). */
export async function addPlayer(_prev: FormState, formData: FormData): Promise<FormState> {
  const club = await getMyClubAsAdmin();
  if (!club) return { error: "No tienes permiso para dar de alta jugadores." };

  const parsed = addSchema.safeParse({
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    mode: formData.get("mode"),
    password: formData.get("password") ?? undefined,
  });
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  const d = parsed.data;

  const phoneErr = checkPhone(d.phone, club.phone_country_code);
  if (phoneErr) return { fieldErrors: { phone: phoneErr } };

  const r = await createClubMember(
    { email: d.email, firstName: d.firstName, lastName: d.lastName, phone: d.phone, clubId: club.id, role: "player" },
    d.mode === "password" ? d.password : undefined,
  );
  if (!r.ok) return r.field ? { fieldErrors: { [r.field]: [r.error] } } : { error: r.error };

  revalidatePath("/club/jugadores");
  return {
    message:
      r.mode === "invite"
        ? `Invitación enviada a ${d.email}.`
        : `Cuenta creada. Comparte con ${d.firstName} su correo y la contraseña temporal; podrá cambiarla en Mi cuenta.`,
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
