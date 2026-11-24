import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail, type SendResult } from "@/lib/notifications/email";
import { sendPushToUser, type PushPayload } from "@/lib/notifications/push";
import { sendWhatsApp, toWhatsAppAddress, type WhatsAppTemplate } from "@/lib/notifications/whatsapp";
import type { Enums } from "@/lib/supabase/database.types";

/**
 * Envío idempotente de un aviso a un perfil por email, WhatsApp y push.
 *
 * Cada aviso tiene una `dedupeKey` única (ej. "proposal:{id}"). Por canal, si
 * ya hay un intento "sent" o "skipped" con esa clave no se repite: así un
 * reintento del cron o un doble clic no manda dos veces. Los "failed" sí se
 * reintentan. Todo queda en `notifications_log` (incluido el motivo de un
 * "skipped": modo protegido sin credenciales, dominio de prueba…).
 *
 * WhatsApp cuesta por mensaje: sólo si el plan del club lo incluye
 * (`features.whatsapp`) y hay plantilla para ese aviso.
 */

type Channel = Enums<"notification_channel">;

export type Recipient = {
  id: string;
  firstName: string;
  name: string;
  email: string | null;
  phoneKey: string | null;
};

export type Message = {
  type: string;
  dedupeKey: string;
  clubId: string;
  matchId?: string | null;
  email: { subject: string; text: string };
  whatsapp?: { template: WhatsAppTemplate; params: string[] };
  push?: PushPayload;
};

/** Perfiles con su contacto (service_role: la vista de contacto no aplica aquí). */
export async function loadRecipients(profileIds: string[]): Promise<Map<string, Recipient>> {
  const ids = [...new Set(profileIds.filter(Boolean))];
  if (!ids.length) return new Map();
  const { data } = await createAdminClient()
    .from("profiles")
    .select("id, first_name, last_name, email, phone_key, status")
    .in("id", ids);
  return new Map(
    (data ?? [])
      .filter((p) => p.status === "active")
      .map((p) => [
        p.id,
        {
          id: p.id,
          firstName: p.first_name ?? "",
          name: [p.first_name, p.last_name].filter(Boolean).join(" ") || "Jugador",
          email: p.email,
          phoneKey: p.phone_key,
        },
      ]),
  );
}

/** Administradores activos del club. */
export async function clubAdminIds(clubId: string): Promise<string[]> {
  const { data } = await createAdminClient()
    .from("profiles")
    .select("id")
    .eq("club_id", clubId)
    .eq("role", "club_admin")
    .eq("status", "active");
  return (data ?? []).map((p) => p.id);
}

/** ¿El plan del club incluye WhatsApp? */
async function whatsappEnabled(clubId: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data: club } = await admin.from("clubs").select("plan_id").eq("id", clubId).maybeSingle();
  let enabled = false;
  if (club?.plan_id) {
    const { data: plan } = await admin.from("subscription_plans").select("features").eq("id", club.plan_id).maybeSingle();
    enabled = (plan?.features as Record<string, unknown> | null)?.whatsapp === true;
  }
  return enabled;
}

async function alreadyHandled(dedupeKey: string, channel: Channel): Promise<boolean> {
  const { data } = await createAdminClient()
    .from("notifications_log")
    .select("id")
    .eq("dedupe_key", dedupeKey)
    .eq("channel", channel)
    .in("status", ["sent", "skipped"])
    .limit(1);
  return !!data?.length;
}

async function log(msg: Message, profileId: string, channel: Channel, result: SendResult) {
  const { error } = await createAdminClient()
    .from("notifications_log")
    .insert({
      club_id: msg.clubId,
      match_id: msg.matchId ?? null,
      profile_id: profileId,
      channel,
      type: msg.type,
      dedupe_key: msg.dedupeKey,
      status: result.status,
      error: result.status === "failed" ? result.error.slice(0, 500) : result.status === "skipped" ? result.reason : null,
      sent_at: result.status === "sent" ? new Date().toISOString() : null,
    });
  // 23505: otro proceso ya lo mandó (índice único de los "sent").
  if (error && error.code !== "23505") console.error("[notify] log:", error.message);
}

async function once(msg: Message, profileId: string, channel: Channel, send: () => Promise<SendResult>) {
  if (await alreadyHandled(msg.dedupeKey, channel)) return;
  const result = await send();
  if (result.status === "failed") console.error(`[notify] ${msg.type} ${channel}:`, result.error);
  await log(msg, profileId, channel, result);
}

export async function notify(to: Recipient, msg: Message): Promise<void> {
  await Promise.all([
    to.email ? once(msg, to.id, "email", () => sendEmail({ to: to.email!, ...msg.email })) : null,
    msg.push ? once(msg, to.id, "push", () => sendPushToUser(to.id, msg.push!)) : null,
    (async () => {
      const wa = toWhatsAppAddress(to.phoneKey);
      if (!msg.whatsapp || !wa || !(await whatsappEnabled(msg.clubId))) return;
      await once(msg, to.id, "whatsapp", () => sendWhatsApp({ to: wa, ...msg.whatsapp! }));
    })(),
  ]);
}

/** Envía a varios perfiles; un fallo con uno no detiene a los demás. */
export async function notifyMany(recipients: Recipient[], build: (r: Recipient) => Message): Promise<void> {
  await Promise.all(
    recipients.map((r) =>
      notify(r, build(r)).catch((e) => console.error("[notify]", e instanceof Error ? e.message : e)),
    ),
  );
}
