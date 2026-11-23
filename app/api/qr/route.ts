import { getMyClubAsAdmin } from "@/lib/clubs/queries";
import { qrPng, qrSvg, signupUrl } from "@/lib/qr";

export const dynamic = "force-dynamic";

/**
 * Descarga del QR de registro del club del admin en sesión. No acepta slug
 * por parámetro: siempre el club del usuario autenticado.
 */
export async function GET(request: Request) {
  const club = await getMyClubAsAdmin();
  if (!club) return new Response("No autorizado", { status: 401 });

  const svg = new URL(request.url).searchParams.get("format") === "svg";
  const url = signupUrl(club.slug);
  const disposition = `attachment; filename="qr-registro-${club.slug}.${svg ? "svg" : "png"}"`;

  if (svg) {
    return new Response(await qrSvg(url, 1024), {
      headers: { "Content-Type": "image/svg+xml", "Content-Disposition": disposition },
    });
  }
  return new Response(new Uint8Array(await qrPng(url, 1024)), {
    headers: { "Content-Type": "image/png", "Content-Disposition": disposition },
  });
}
