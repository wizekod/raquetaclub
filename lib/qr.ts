import "server-only";

import QRCode from "qrcode";

import { clientEnv } from "@/lib/env";

/** Enlace de registro de jugadores del club, que es lo que codifica el QR. */
export function signupUrl(slug: string): string {
  return `${clientEnv.NEXT_PUBLIC_APP_URL}/${slug}/registro`;
}

/**
 * Negro sobre blanco a propósito: teñirlo con el color del club reduce el
 * contraste y algunos lectores fallan, sobre todo impreso.
 */
const COLORS = { dark: "#0a0a0a", light: "#ffffff" };

export function qrSvg(text: string, width = 256): Promise<string> {
  return QRCode.toString(text, { type: "svg", width, margin: 1, errorCorrectionLevel: "M", color: COLORS });
}

export function qrPng(text: string, width = 1024): Promise<Buffer> {
  return QRCode.toBuffer(text, { type: "png", width, margin: 2, errorCorrectionLevel: "M", color: COLORS });
}
