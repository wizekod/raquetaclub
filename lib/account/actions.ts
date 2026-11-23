"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { getProfile, getUser } from "@/lib/auth/dal";
import { getMyClub } from "@/lib/clubs/queries";
import { clientEnv } from "@/lib/env";
import { checkPhone, emailField, firstNameField, lastNameField, passwordField } from "@/lib/players/schema";
import type { FormState } from "@/lib/forms";

/**
 * "Mi cuenta" para los tres roles. Cambiar correo o contraseña pide la
 * contraseña actual: con una sesión robada (un equipo sin bloquear) no basta
 * para quedarse la cuenta.
 */

const profileSchema = z.object({
  firstName: firstNameField,
  lastName: lastNameField,
  phone: z.string().trim().max(30, "Teléfono no válido"),
});

const emailSchema = z.object({
  email: emailField,
  currentPassword: z.string().min(1, "Ingresa tu contraseña actual"),
});

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, "Ingresa tu contraseña actual"),
    password: passwordField,
    confirm: z.string().min(1, "Repite la contraseña"),
  })
  .refine((d) => d.password === d.confirm, {
    message: "Las contraseñas no coinciden",
    path: ["confirm"],
  });

/**
 * Comprueba la contraseña con un cliente aparte, sin cookies, para no tocar
 * la sesión del navegador. La sesión que abre se revoca enseguida (`local`).
 */
async function passwordMatches(email: string, password: string): Promise<boolean> {
  const probe = createSupabaseClient(
    clientEnv.NEXT_PUBLIC_SUPABASE_URL,
    clientEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { error } = await probe.auth.signInWithPassword({ email, password });
  if (error) return false;
  await probe.auth.signOut({ scope: "local" });
  return true;
}

export async function updateAccountProfile(_prev: FormState, formData: FormData): Promise<FormState> {
  const profile = await getProfile();
  if (!profile) redirect("/login");

  const parsed = profileSchema.safeParse({
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    phone: formData.get("phone") ?? "",
  });
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  const { firstName, lastName, phone } = parsed.data;

  // El teléfono es obligatorio para quien juega o administra un club: los
  // rivales coordinan los partidos con él (bases de la escalera).
  if (profile.role !== "superadmin") {
    if (!phone) return { fieldErrors: { phone: ["Ingresa tu teléfono"] } };
    const club = await getMyClub();
    const phoneErr = checkPhone(phone, club?.phone_country_code);
    if (phoneErr) return { fieldErrors: { phone: phoneErr } };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ first_name: firstName, last_name: lastName, phone: phone || null })
    .eq("id", profile.id);
  if (error) return { error: "No se pudieron guardar tus datos." };

  // El nombre sale en la barra lateral de todos los paneles.
  revalidatePath("/", "layout");
  return { message: "Datos actualizados." };
}

export async function requestEmailChange(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getUser();
  if (!user?.email) redirect("/login");

  const parsed = emailSchema.safeParse({
    email: formData.get("email"),
    currentPassword: formData.get("currentPassword"),
  });
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  const { email, currentPassword } = parsed.data;

  if (email === user.email.toLowerCase()) {
    return { fieldErrors: { email: ["Ya es tu correo actual"] } };
  }
  if (!(await passwordMatches(user.email, currentPassword))) {
    return { fieldErrors: { currentPassword: ["Contraseña incorrecta"] } };
  }

  // No se aplica hasta confirmar el enlace (en los dos buzones si Supabase
  // tiene "Secure email change"). Al aplicarse, un trigger copia el correo
  // nuevo a profiles.email.
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser(
    { email },
    { emailRedirectTo: `${clientEnv.NEXT_PUBLIC_APP_URL}/auth/callback?next=/jugador` },
  );
  if (error) {
    if (error.code === "email_exists") {
      return { fieldErrors: { email: ["Ese correo ya lo usa otra cuenta"] } };
    }
    if (error.status === 429) {
      return { error: "Demasiados intentos. Espera unos minutos y vuelve a probar." };
    }
    console.error("[account] email change:", error.message);
    return { error: "No se pudo iniciar el cambio de correo." };
  }

  revalidatePath("/", "layout");
  return {
    message: `Te enviamos un enlace a ${email}. El cambio se aplica cuando lo abras; si también te llega un correo a tu dirección actual, confírmalo ahí.`,
  };
}

export async function changePassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getUser();
  if (!user?.email) redirect("/login");

  const parsed = passwordSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    password: formData.get("password"),
    confirm: formData.get("confirm"),
  });
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  const { currentPassword, password } = parsed.data;

  if (!(await passwordMatches(user.email, currentPassword))) {
    return { fieldErrors: { currentPassword: ["Contraseña incorrecta"] } };
  }
  if (password === currentPassword) {
    return { fieldErrors: { password: ["Debe ser distinta de la actual"] } };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    if (error.code === "weak_password") {
      return { fieldErrors: { password: ["Contraseña demasiado débil"] } };
    }
    console.error("[account] password change:", error.message);
    return { error: "No se pudo cambiar la contraseña." };
  }

  // Quien tuviera la contraseña vieja queda fuera de los otros dispositivos.
  await supabase.auth.signOut({ scope: "others" });
  return { message: "Contraseña actualizada. Se cerró la sesión en tus otros dispositivos." };
}
