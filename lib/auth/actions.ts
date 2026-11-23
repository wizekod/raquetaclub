"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { getProfile, getUser } from "@/lib/auth/dal";
import { roleHome } from "@/lib/auth/roles";
import { passwordField } from "@/lib/players/schema";
import type { FormState } from "@/lib/forms";

const schema = z
  .object({
    password: passwordField,
    confirm: z.string().min(1, "Repite la contraseña"),
  })
  .refine((d) => d.password === d.confirm, {
    message: "Las contraseñas no coinciden",
    path: ["confirm"],
  });

/**
 * Define la contraseña tras abrir una invitación o un enlace de recuperación.
 * El vínculo con el club ya lo hizo la base al invitar (app_metadata →
 * `handle_user_invitation`); aquí sólo se guarda la contraseña.
 */
export async function setInitialPassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getUser();
  if (!user) redirect("/login");

  const parsed = schema.safeParse({
    password: formData.get("password"),
    confirm: formData.get("confirm"),
  });
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    if (error.code === "same_password") {
      return { fieldErrors: { password: ["Debe ser distinta de la anterior"] } };
    }
    return { error: "No se pudo guardar la contraseña." };
  }

  const profile = await getProfile();
  redirect(profile ? roleHome(profile.role) : "/");
}
