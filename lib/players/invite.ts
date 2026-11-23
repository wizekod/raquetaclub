import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { clientEnv } from "@/lib/env";

/**
 * Fuera de los archivos "use server" a propósito: todo lo que exporta uno de
 * ellos es invocable desde el navegador, y esto crea cuentas con
 * service_role sin comprobar quién lo pide. Lo llaman acciones que ya
 * validaron que el usuario es admin del club.
 *
 * El vínculo con el club va en `app_metadata` (sólo lo escribe el servidor);
 * lo aplica en la base el trigger `handle_user_invitation`. Nombre y teléfono
 * van en `user_metadata`, que copia `handle_new_user` al perfil.
 */

const INVITE_REDIRECT = `${clientEnv.NEXT_PUBLIC_APP_URL}/auth/confirm?next=/auth/definir-clave`;

export type NewMember = {
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  clubId: string;
  role: "player" | "club_admin";
};

export type CreateResult =
  | { ok: true; userId: string; mode: "invite" | "password" }
  | { ok: false; error: string; field?: "email" };

/** Estado de una cuenta existente con ese correo, para decidir qué hacer. */
async function findExisting(email: string) {
  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("id, club_id")
    .eq("email", email.toLowerCase())
    .maybeSingle();
  if (!profile) return null;
  const { data } = await admin.auth.admin.getUserById(profile.id);
  return {
    id: profile.id,
    clubId: profile.club_id,
    neverSignedIn: !data.user?.last_sign_in_at,
  };
}

/**
 * Crea la cuenta del jugador (o admin) del club.
 *  · `password` → cuenta confirmada con contraseña temporal, sin correo. Útil
 *    para dar de alta a muchos de golpe: el SMTP de prueba de Supabase sólo
 *    manda unos pocos correos por hora.
 *  · sin `password` → invitación por correo para que defina la suya.
 * Si el correo ya tiene una cuenta de este club que nunca entró, se rehace
 * (reenviar invitación); si es de otro club o ya se usó, se rechaza.
 */
export async function createClubMember(m: NewMember, password?: string): Promise<CreateResult> {
  const admin = createAdminClient();
  const email = m.email.toLowerCase();

  const existing = await findExisting(email);
  if (existing) {
    if (existing.clubId !== m.clubId) {
      return { ok: false, field: "email", error: "Ese correo ya tiene una cuenta en otro club." };
    }
    if (!existing.neverSignedIn) {
      return { ok: false, field: "email", error: "Ese correo ya tiene una cuenta activa en el club." };
    }
    await admin.auth.admin.deleteUser(existing.id);
  }

  const userMetadata = { first_name: m.firstName, last_name: m.lastName, phone: m.phone };
  const appMetadata = { invited_role: m.role, club_id: m.clubId };

  if (password) {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: userMetadata,
      app_metadata: appMetadata,
    });
    if (error || !data.user) {
      console.error("[members] createUser:", error?.message);
      return { ok: false, error: "No se pudo crear la cuenta." };
    }
    return { ok: true, userId: data.user.id, mode: "password" };
  }

  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: INVITE_REDIRECT,
    data: userMetadata,
  });
  if (error || !data.user) {
    console.error("[members] invite:", error?.message);
    if (error?.status === 429) {
      return { ok: false, error: "Se alcanzó el límite de correos por hora. Usa una contraseña temporal o inténtalo más tarde." };
    }
    return { ok: false, error: "No se pudo enviar la invitación." };
  }
  // inviteUserByEmail no acepta app_metadata: se escribe después y el trigger
  // `handle_user_invitation` liga la cuenta al club.
  const { error: metaError } = await admin.auth.admin.updateUserById(data.user.id, {
    app_metadata: appMetadata,
  });
  if (metaError) {
    await admin.auth.admin.deleteUser(data.user.id);
    console.error("[members] app_metadata:", metaError.message);
    return { ok: false, error: "No se pudo crear la cuenta." };
  }
  return { ok: true, userId: data.user.id, mode: "invite" };
}

/** ids de las cuentas que aún no han iniciado sesión nunca (invitación pendiente). */
export async function pendingUserIds(ids: string[]): Promise<Set<string>> {
  const admin = createAdminClient();
  const pending = new Set<string>();
  await Promise.all(
    ids.map(async (id) => {
      const { data } = await admin.auth.admin.getUserById(id);
      if (data.user && !data.user.last_sign_in_at) pending.add(id);
    }),
  );
  return pending;
}
