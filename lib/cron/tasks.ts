import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { todayInTz } from "@/lib/availability/tz";
import { notifyClubAdmins, onMatchReminder } from "@/lib/notifications/events";
import { parseConfig } from "@/lib/tournaments/config";
import { closeRoundWith } from "@/lib/tournaments/close-round";

/**
 * Tareas del cron (`/api/cron/tick`, cada 30 min vía pg_cron). Todas son
 * idempotentes: se pueden correr de más sin duplicar efectos (los avisos
 * tienen dedupe y los cambios de estado sólo aplican una vez).
 */

const HOUR = 3_600_000;

/**
 * Recordatorios de partido: "24h" para los que empiezan en las próximas 24 h
 * (y faltan más de 3 h) y "2h" para los de las próximas 2 h.
 */
export async function runReminders(now = new Date()): Promise<{ sent: number }> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("court_bookings")
    .select("id, start_at")
    .eq("status", "confirmed")
    .gt("start_at", now.toISOString())
    .lte("start_at", new Date(now.getTime() + 24 * HOUR).toISOString());
  let sent = 0;
  for (const b of data ?? []) {
    const ahead = Date.parse(b.start_at) - now.getTime();
    const kind = ahead <= 2 * HOUR ? "2h" : ahead > 3 * HOUR ? "24h" : null;
    if (!kind) continue;
    await onMatchReminder(b.id, kind);
    sent++;
  }
  return { sent };
}

/** Resultados sin respuesta del rival tras `auto_confirm_hours`: se confirman solos. */
export async function runAutoConfirm(now = new Date()): Promise<{ confirmed: number }> {
  const admin = createAdminClient();
  const { data: reported } = await admin.from("matches").select("id, tournament_id, round_id, reported_at").eq("status", "reported");
  if (!reported?.length) return { confirmed: 0 };

  const [{ data: tournaments }, { data: rounds }] = await Promise.all([
    admin.from("tournaments").select("id, config").in("id", [...new Set(reported.map((m) => m.tournament_id))]),
    admin.from("rounds").select("id, status").in("id", [...new Set(reported.map((m) => m.round_id))]),
  ]);
  const hoursOf = new Map((tournaments ?? []).map((t) => [t.id, parseConfig(t.config).auto_confirm_hours]));
  const active = new Set((rounds ?? []).filter((r) => r.status === "active").map((r) => r.id));

  const due = reported.filter((m) => {
    const h = hoursOf.get(m.tournament_id) ?? 0;
    return h > 0 && active.has(m.round_id) && m.reported_at && Date.parse(m.reported_at) <= now.getTime() - h * HOUR;
  });
  if (!due.length) return { confirmed: 0 };
  const { data } = await admin
    .from("matches")
    .update({ status: "confirmed", confirmed_at: now.toISOString() })
    .in("id", due.map((m) => m.id))
    .eq("status", "reported") // por si el rival respondió mientras tanto
    .select("id");
  return { confirmed: data?.length ?? 0 };
}

/**
 * Rondas con la fecha límite vencida: se cierran (mismo núcleo que el botón
 * del panel) y se avisa a los admins para que revisen y publiquen la
 * siguiente. Si no se puede (disputas), se les avisa una vez al día.
 */
export async function runRoundDeadlines(now = new Date()): Promise<{ closed: number; blocked: number }> {
  const admin = createAdminClient();
  const { data: rounds } = await admin
    .from("rounds")
    .select("id, club_id, tournament_id, name")
    .eq("status", "active")
    .lt("results_deadline", now.toISOString());
  let closed = 0;
  let blocked = 0;
  for (const r of rounds ?? []) {
    const [{ data: club }, { data: t }] = await Promise.all([
      admin.from("clubs").select("timezone").eq("id", r.club_id).single(),
      admin.from("tournaments").select("name").eq("id", r.tournament_id).single(),
    ]);
    if (!club || !t) continue;
    const result = await closeRoundWith(admin, r.id, club.timezone);
    if (result.ok) {
      closed++;
      await notifyClubAdmins(r.club_id, {
        type: "ronda_cerrada",
        dedupeKey: `closed:${r.id}`,
        subject: `${t.name}: se cerró la ronda ${r.name}`,
        text: result.finish
          ? `Se venció la fecha límite y se cerró la última ronda. El torneo terminó; las tablas finales ya están en el ranking.`
          : `Se venció la fecha límite: la ronda se cerró y la siguiente quedó en borrador con los ascensos y descensos. Revísala y publícala.`,
        url: result.nextId ? `/club/torneos/${r.tournament_id}/rondas/${result.nextId}` : `/club/torneos/${r.tournament_id}/ranking`,
      });
    } else {
      blocked++;
      await notifyClubAdmins(r.club_id, {
        type: "ronda_sin_cerrar",
        dedupeKey: `close-blocked:${r.id}:${todayInTz(club.timezone, now)}`,
        subject: `${t.name}: la ronda ${r.name} no se pudo cerrar`,
        text: `Se venció la fecha límite pero la ronda no se pudo cerrar: ${result.error}`,
        url: `/club/torneos/${r.tournament_id}/rondas/${r.id}`,
      });
    }
  }
  return { closed, blocked };
}
