import { z } from "zod";

import { phoneLengthError } from "@/lib/players/phone";

/** Campos de alta de un jugador o de un dueño (nombre, apellidos, teléfono). */
export const firstNameField = z.string().trim().min(1, "Ingresa tu nombre").max(60, "Máximo 60 caracteres");
export const lastNameField = z.string().trim().min(1, "Ingresa tus apellidos").max(80, "Máximo 80 caracteres");
export const emailField = z.string().trim().toLowerCase().email("Correo inválido");
export const passwordField = z.string().min(8, "Mínimo 8 caracteres").max(72, "Máximo 72 caracteres");
export const phoneField = z.string().trim().min(1, "Ingresa tu teléfono").max(30, "Teléfono no válido");

/**
 * Valida el largo del teléfono contra la lada del club (México 10 dígitos,
 * España 9…). Devuelve el error de campo o `undefined`.
 */
export function checkPhone(phone: string, dial: string | null | undefined): string[] | undefined {
  const err = phoneLengthError(phone, dial);
  return err ? [err] : undefined;
}
