import { clientEnv } from "@/lib/env";

/** Bucket público: logos de club, avatares de jugador y reglamentos en PDF. */
export const MEDIA_BUCKET = "media";

/** Límites por tipo. El bucket acepta hasta 10 MB (supabase/migrations/…_media_storage.sql). */
export const IMAGE_MAX_BYTES = 3 * 1024 * 1024;
export const PDF_MAX_BYTES = 10 * 1024 * 1024;

export const IMAGE_MIME = ["image/jpeg", "image/png", "image/webp"] as const;

/**
 * Carpetas del club:
 *   {club_id}/logos/{uuid}.{ext}
 *   {club_id}/rules/{uuid}.pdf
 *   {club_id}/avatars/{profile_id}/{uuid}.{ext}
 * La política de storage (`owns_media_path`) es el control real; esto sólo
 * construye y comprueba rutas en el servidor.
 */
export type MediaKind = "logos" | "rules" | "avatars";

/**
 * Ruta pública del objeto. Se guarda la ruta y no la URL porque ésta lleva
 * dentro la referencia del proyecto Supabase: restaurar en otro proyecto o
 * servir desde un dominio propio invalidaría todas las URLs guardadas.
 */
export function mediaUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  return `${clientEnv.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${MEDIA_BUCKET}/${path}`;
}

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

function folder(clubId: string, kind: MediaKind, ownerId?: string): string {
  if (kind === "avatars") {
    if (!ownerId) throw new Error("avatars requiere ownerId");
    return `${clubId}/avatars/${ownerId}`;
  }
  return `${clubId}/${kind}`;
}

const EXT: Record<MediaKind, string> = {
  logos: "jpe?g|png|webp",
  avatars: "jpe?g|png|webp",
  rules: "pdf",
};

/**
 * La ruta llega desde un input oculto del formulario, o sea que es entrada del
 * usuario: sin esta comprobación, se podría apuntar la ficha (y por tanto el
 * borrado del fichero anterior) a un objeto de otro club o de otro jugador.
 */
export function isOwnMediaPath(
  path: string,
  clubId: string,
  kind: MediaKind,
  ownerId?: string,
): boolean {
  return new RegExp(
    `^${folder(clubId, kind, ownerId)}/${UUID}\\.(${EXT[kind]})$`,
    "i",
  ).test(path);
}

export function mediaPath(
  clubId: string,
  kind: MediaKind,
  ext: string,
  ownerId?: string,
): string {
  return `${folder(clubId, kind, ownerId)}/${crypto.randomUUID()}.${ext}`;
}
