"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { clientEnv } from "@/lib/env";
import { roleHome } from "@/lib/auth/roles";
import { getPublicClub } from "@/lib/clubs/queries";
import {
  checkPhone,
  emailField,
  firstNameField,
  lastNameField,
  passwordField,
  phoneField,
} from "@/lib/players/schema";
import { rateLimit } from "@/lib/security/rate-limit";
import { clientIp } from "@/lib/security/request";
import { verifyTurnstile } from "@/lib/security/turnstile";
import type { FormState } from "@/lib/forms";

export type AuthFormState = FormState;

/** Sólo permite rutas internas relativas como destino post-login. */
function safeNext(next: FormDataEntryValue | null): string | null {
  if (typeof next !== "string") return null;
  if (!next.startsWith("/") || next.startsWith("//")) return null;
  return next;
}

/** Anti-abuso común a los formularios públicos de alta. */
async function guardPublicForm(formData: FormData, key: string): Promise<string | null> {
  const ip = await clientIp();
  if (!rateLimit(`${key}:${ip}`, 5, 10 * 60_000).ok) {
    return "Demasiados intentos. Espera unos minutos y vuelve a probar.";
  }
  const token = formData.get("cf-turnstile-response");
  const captcha = await verifyTurnstile(typeof token === "string" ? token : null, ip);
  if (!captcha.ok) return "No pudimos verificar que eres una persona. Recarga la página e inténtalo de nuevo.";
  return null;
}

// ─────────────────────────────── login ───────────────────────────────────

const loginSchema = z.object({
  email: emailField,
  password: z.string().min(1, "Ingresa tu contraseña"),
});

export async function login(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors };

  const ip = await clientIp();
  if (!rateLimit(`login:${ip}`, 10, 10 * 60_000).ok) {
    return { error: "Demasiados intentos. Espera unos minutos y vuelve a probar." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error || !data.user) {
    if (error?.code === "email_not_confirmed") {
      return { error: "Confirma tu correo antes de entrar: abre el enlace que te enviamos." };
    }
    return { error: "Correo o contraseña incorrectos." };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, club_id, status")
    .eq("id", data.user.id)
    .maybeSingle();

  if (!profile) {
    await supabase.auth.signOut();
    return { error: "Tu cuenta no está completa. Escríbenos a soporte." };
  }
  if (profile.status !== "active") {
    await supabase.auth.signOut();
    return { error: "Tu cuenta está dada de baja en el club. Habla con el administrador." };
  }

  const next = safeNext(formData.get("next"));
  if (next) redirect(next);
  if (profile.role === "club_admin" && !profile.club_id) redirect("/onboarding");
  redirect(roleHome(profile.role));
}

// ──────────────────────── registro de dueño de club ──────────────────────

const ownerSchema = z.object({
  firstName: firstNameField,
  lastName: lastNameField,
  phone: phoneField,
  email: emailField,
  password: passwordField,
});

/**
 * Alta de quien administra un club. Sin `club_id` en el metadata, la base lo
 * crea como `club_admin` sin club; el club lo crea en /onboarding.
 */
export async function signUpOwner(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const parsed = ownerSchema.safeParse({
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    phone: formData.get("phone"),
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors };

  const blocked = await guardPublicForm(formData, "signup-owner");
  if (blocked) return { error: blocked };

  const d = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: d.email,
    password: d.password,
    options: {
      data: { first_name: d.firstName, last_name: d.lastName, phone: d.phone },
      emailRedirectTo: `${clientEnv.NEXT_PUBLIC_APP_URL}/auth/callback?next=/onboarding`,
    },
  });
  if (error) return { error: signUpError(error) };

  if (!data.session) {
    return { message: "Te enviamos un correo para confirmar tu cuenta. Ábrelo para continuar." };
  }
  redirect("/onboarding");
}

// ─────────────────────── registro de jugador por club ────────────────────

const playerSchema = ownerSchema.extend({ slug: z.string().min(1) });

/**
 * Alta de jugador desde /{slug}/registro. El `club_id` va en user_metadata:
 * la base sólo le da el rol `player` y sólo si el club no está suspendido
 * (`handle_new_user`), así que manipularlo no da ningún privilegio.
 */
export async function registerPlayer(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const parsed = playerSchema.safeParse({
    slug: formData.get("slug"),
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    phone: formData.get("phone"),
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  const d = parsed.data;

  const club = await getPublicClub(d.slug);
  if (!club) return { error: "Este club no está disponible." };

  const phoneErr = checkPhone(d.phone, club.phone_country_code);
  if (phoneErr) return { fieldErrors: { phone: phoneErr } };

  const blocked = await guardPublicForm(formData, "signup-player");
  if (blocked) return { error: blocked };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: d.email,
    password: d.password,
    options: {
      data: { club_id: club.id, first_name: d.firstName, last_name: d.lastName, phone: d.phone },
      emailRedirectTo: `${clientEnv.NEXT_PUBLIC_APP_URL}/auth/callback?next=/jugador`,
    },
  });
  if (error) return { error: signUpError(error) };

  // Con "Confirm email" activado no hay sesión hasta confirmar. Si el correo
  // ya existía, Supabase responde igual (sin revelar que está registrado).
  if (!data.session) {
    return {
      message: `Te enviamos un correo para confirmar tu cuenta en ${club.name}. Ábrelo para continuar. Si ya tenías cuenta, inicia sesión.`,
    };
  }
  redirect("/jugador");
}

function signUpError(error: { code?: string; status?: number; message: string }): string {
  if (error.code === "user_already_exists" || error.code === "email_exists") {
    return "Ese correo ya tiene una cuenta. Inicia sesión.";
  }
  if (error.code === "weak_password") return "Contraseña demasiado débil.";
  if (error.code === "email_address_invalid") return "Ese correo no es válido. Revisa que esté bien escrito.";
  // Límite de envío de correos del proyecto (el SMTP de prueba de Supabase
  // sólo manda unos pocos por hora; se quita configurando Resend como SMTP).
  if (error.code === "over_email_send_rate_limit") {
    console.error("[auth] signUp: límite de correos de Supabase alcanzado");
    return "No pudimos enviarte el correo de confirmación en este momento. Inténtalo de nuevo en unos minutos.";
  }
  if (error.status === 429) return "Demasiados intentos. Espera unos minutos y vuelve a probar.";
  // El SMTP (Resend) rechazó el destinatario: dirección inexistente o dominio
  // que no recibe correo. La cuenta no queda creada.
  if (/sending confirmation email/i.test(error.message)) {
    console.error("[auth] signUp: el SMTP rechazó el correo de confirmación");
    return "No pudimos enviarte el correo de confirmación. Revisa que tu correo esté bien escrito.";
  }
  console.error("[auth] signUp:", error.message);
  return "No se pudo crear la cuenta.";
}

// ─────────────────────────── recuperar contraseña ────────────────────────

const resetSchema = z.object({ email: emailField });

/**
 * Envía el correo para restablecer la contraseña. La respuesta es la misma
 * exista o no la cuenta: si no, el formulario serviría para averiguar qué
 * correos están registrados.
 */
export async function requestPasswordReset(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const parsed = resetSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors };

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${clientEnv.NEXT_PUBLIC_APP_URL}/auth/callback?next=/auth/definir-clave`,
  });
  if (error?.status === 429) {
    return { error: "Demasiados intentos. Espera unos minutos y vuelve a probar." };
  }
  if (error) console.error("[auth] requestPasswordReset:", error.message);

  return {
    message:
      "Si hay una cuenta con ese correo, te enviamos un enlace para crear una contraseña nueva. Revisa también la carpeta de spam.",
  };
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
