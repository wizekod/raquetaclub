import { runAutoConfirm, runReminders, runRoundDeadlines } from "@/lib/cron/tasks";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Tareas programadas: autoconfirmación de resultados, cierre de rondas
 * vencidas y recordatorios de partido.
 *
 * Las dispara cada 30 min pg_cron desde Supabase (migración `cron_tick`), no
 * Vercel Cron: el plan Hobby sólo admite crons diarios.
 *
 * Exige `Authorization: Bearer $CRON_SECRET`. En local sin secreto se
 * permite; en producción sin secreto configurado se rechaza.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    if (request.headers.get("authorization") !== `Bearer ${secret}`) {
      return new Response("Unauthorized", { status: 401 });
    }
  } else if (process.env.NODE_ENV === "production") {
    return new Response("CRON_SECRET no configurado", { status: 401 });
  }

  // Orden: primero se confirma lo vencido, luego se cierran rondas (ya con
  // esos resultados) y al final los recordatorios.
  const autoConfirm = await runAutoConfirm();
  const rounds = await runRoundDeadlines();
  const reminders = await runReminders();
  return Response.json({ ok: true, autoConfirm, rounds, reminders, at: new Date().toISOString() });
}
