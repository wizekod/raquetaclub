"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { getMyClubAsAdmin } from "@/lib/clubs/queries";
import { wallTimeToInstant } from "@/lib/availability/tz";
import { emptyToUndefined, type FormState } from "@/lib/forms";
import { Constants } from "@/lib/supabase/database.types";

type Result = { ok: true } | { ok: false; error: string };

const DEFAULT_HOURS = Array.from({ length: 7 }, (_, d) => ({
  day_of_week: d,
  open_time: "07:00",
  close_time: "22:00",
}));

function revalidateCourts() {
  revalidatePath("/club/canchas", "layout");
  revalidatePath("/club/calendario");
}

// ──────────────────────────────── canchas ────────────────────────────────

const courtSchema = z.object({
  name: z.string().trim().min(1, "Ponle un nombre").max(40, "Máximo 40 caracteres"),
  sport: z.enum(Constants.public.Enums.sport),
  surface: z.preprocess(emptyToUndefined, z.string().trim().max(40).optional()),
});

function courtError(code: string | undefined): FormState {
  if (code === "23505") return { fieldErrors: { name: ["Ya hay una cancha con ese nombre"] } };
  return { error: "No se pudo guardar la cancha." };
}

/**
 * Alta de cancha. Nace con el horario de otra cancha del club (lo normal es
 * que compartan horario) o, si es la primera, de 7:00 a 22:00 todos los días.
 */
export async function createCourt(_prev: FormState, formData: FormData): Promise<FormState> {
  const club = await getMyClubAsAdmin();
  if (!club) return { error: "No autorizado." };

  const parsed = courtSchema.safeParse({
    name: formData.get("name"),
    sport: formData.get("sport") ?? club.sports[0],
    surface: formData.get("surface"),
  });
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  if (!club.sports.includes(parsed.data.sport)) return { fieldErrors: { sport: ["Deporte no activo en el club"] } };

  const supabase = await createClient();
  const { data: count } = await supabase.from("courts").select("id").eq("club_id", club.id);
  const { data: court, error } = await supabase
    .from("courts")
    .insert({ club_id: club.id, ...parsed.data, surface: parsed.data.surface ?? null, sort_order: count?.length ?? 0 })
    .select("id")
    .single();
  if (error || !court) return courtError(error?.code);

  const { data: template } = await supabase
    .from("court_hours")
    .select("day_of_week, open_time, close_time")
    .eq("club_id", club.id)
    .neq("court_id", court.id);
  const firstCourt = template?.length ? template : DEFAULT_HOURS;
  const { error: hoursError } = await supabase.rpc("set_court_hours", {
    p_court: court.id,
    p_hours: dedupeHours(firstCourt),
  });
  if (hoursError) console.error("[courts] default hours:", hoursError.message);

  revalidateCourts();
  redirect(`/club/canchas/${court.id}`);
}

/** Las franjas de varias canchas pueden repetirse: una por (día, apertura, cierre). */
function dedupeHours(rows: { day_of_week: number; open_time: string; close_time: string }[]) {
  const seen = new Set<string>();
  return rows.filter((r) => {
    const k = `${r.day_of_week}|${r.open_time}|${r.close_time}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export async function updateCourt(_prev: FormState, formData: FormData): Promise<FormState> {
  const club = await getMyClubAsAdmin();
  if (!club) return { error: "No autorizado." };

  const id = String(formData.get("id") ?? "");
  const parsed = courtSchema
    .extend({ active: z.preprocess((v) => v === "on", z.boolean()) })
    .safeParse({
      name: formData.get("name"),
      sport: formData.get("sport"),
      surface: formData.get("surface"),
      active: formData.get("active"),
    });
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  if (!club.sports.includes(parsed.data.sport)) return { fieldErrors: { sport: ["Deporte no activo en el club"] } };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("courts")
    .update({ ...parsed.data, surface: parsed.data.surface ?? null })
    .eq("id", id)
    .eq("club_id", club.id)
    .select("id");
  if (error || !data?.length) return courtError(error?.code);

  revalidateCourts();
  return { message: "Cancha guardada." };
}

/**
 * Borrar sólo si nunca tuvo reservas: el borrado arrastraría en cascada el
 * historial de partidos agendados ahí. Con historial, se desactiva.
 */
export async function deleteCourt(courtId: string): Promise<Result> {
  const club = await getMyClubAsAdmin();
  if (!club) return { ok: false, error: "No autorizado." };

  const supabase = await createClient();
  const { count } = await supabase
    .from("court_bookings")
    .select("id", { count: "exact", head: true })
    .eq("court_id", courtId);
  if (count) {
    return { ok: false, error: "Esta cancha tiene partidos agendados en su historial. Desactívala en lugar de borrarla." };
  }

  const { data, error } = await supabase.from("courts").delete().eq("id", courtId).eq("club_id", club.id).select("id");
  if (error || !data?.length) return { ok: false, error: "No se pudo borrar la cancha." };
  revalidateCourts();
  return { ok: true };
}

// ─────────────────────────────── horarios ────────────────────────────────

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

const hoursSchema = z
  .array(
    z
      .object({
        day_of_week: z.number().int().min(0).max(6),
        open_time: z.string().regex(HHMM, "Hora inválida"),
        close_time: z.string().regex(HHMM, "Hora inválida"),
      })
      .refine((h) => h.open_time < h.close_time, "La hora de cierre debe ser después de la apertura"),
  )
  .max(70)
  .superRefine((rows, ctx) => {
    for (let d = 0; d < 7; d++) {
      const day = rows.filter((r) => r.day_of_week === d).sort((a, b) => a.open_time.localeCompare(b.open_time));
      for (let i = 1; i < day.length; i++) {
        if (day[i]!.open_time < day[i - 1]!.close_time) {
          ctx.addIssue({ code: "custom", message: "Hay franjas que se enciman el mismo día" });
          return;
        }
      }
    }
  });

export type HoursInput = z.input<typeof hoursSchema>;

export async function saveCourtHours(courtId: string, hours: HoursInput): Promise<Result> {
  const club = await getMyClubAsAdmin();
  if (!club) return { ok: false, error: "No autorizado." };

  const parsed = hoursSchema.safeParse(hours);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Horario inválido." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_court_hours", { p_court: courtId, p_hours: parsed.data });
  if (error) {
    console.error("[courts] hours:", error.message);
    return { ok: false, error: error.code === "23P01" ? "Hay franjas que se enciman el mismo día." : "No se pudo guardar el horario." };
  }
  revalidateCourts();
  return { ok: true };
}

/** Copia el horario de una cancha a todas las demás del club. */
export async function applyHoursToAllCourts(courtId: string): Promise<Result> {
  const club = await getMyClubAsAdmin();
  if (!club) return { ok: false, error: "No autorizado." };

  const supabase = await createClient();
  const [{ data: hours }, { data: courts }] = await Promise.all([
    supabase.from("court_hours").select("day_of_week, open_time, close_time").eq("court_id", courtId).eq("club_id", club.id),
    supabase.from("courts").select("id").eq("club_id", club.id).neq("id", courtId),
  ]);
  for (const c of courts ?? []) {
    const { error } = await supabase.rpc("set_court_hours", { p_court: c.id, p_hours: hours ?? [] });
    if (error) return { ok: false, error: "No se pudo copiar el horario a todas las canchas." };
  }
  revalidateCourts();
  return { ok: true };
}

// ─────────────────────────────── bloqueos ────────────────────────────────

export type BlockFormState = FormState & { conflicts?: number };

const DATE = /^\d{4}-\d{2}-\d{2}$/;

const blockSchema = z
  .object({
    court: z.string().min(1),
    startDate: z.string().regex(DATE, "Fecha inválida"),
    startTime: z.string().regex(HHMM, "Hora inválida"),
    endDate: z.string().regex(DATE, "Fecha inválida"),
    endTime: z.string().regex(HHMM, "Hora inválida"),
    reason: z.preprocess(emptyToUndefined, z.string().trim().max(120).optional()),
    confirm: z.preprocess((v) => v === "on", z.boolean()),
  })
  .refine((d) => `${d.endDate}T${d.endTime}` > `${d.startDate}T${d.startTime}`, {
    message: "El bloqueo debe terminar después de empezar",
    path: ["endTime"],
  });

/**
 * Bloquea una cancha (o todas) en un rango con hora del club. Si choca con
 * partidos agendados, la primera vez sólo avisa; con la casilla marcada los
 * cancela y los devuelve a "por agendar" (los avisos a los jugadores llegan
 * con el paso 8).
 */
export async function createBlock(_prev: BlockFormState, formData: FormData): Promise<BlockFormState> {
  const club = await getMyClubAsAdmin();
  if (!club) return { error: "No autorizado." };

  const parsed = blockSchema.safeParse({
    court: formData.get("court"),
    startDate: formData.get("startDate"),
    startTime: formData.get("startTime"),
    endDate: formData.get("endDate"),
    endTime: formData.get("endTime"),
    reason: formData.get("reason"),
    confirm: formData.get("confirm"),
  });
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  const d = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_court_block", {
    p_club: club.id,
    p_court: d.court === "all" ? null : d.court,
    p_start: wallTimeToInstant(d.startDate, d.startTime, club.timezone).toISOString(),
    p_end: wallTimeToInstant(d.endDate, d.endTime, club.timezone).toISOString(),
    p_reason: d.reason ?? null,
    p_cancel: d.confirm,
  });
  if (error) {
    console.error("[courts] block:", error.message);
    return { error: "No se pudo crear el bloqueo." };
  }

  const r = data as unknown as { block_id: string | null; conflicts: number; cancelled: number };
  if (!r.block_id) {
    return {
      conflicts: r.conflicts,
      error: `Hay ${r.conflicts} ${r.conflicts === 1 ? "partido agendado" : "partidos agendados"} en ese horario. Marca la casilla para cancelarlos y bloquear la cancha.`,
    };
  }

  revalidateCourts();
  revalidatePath("/club/bloqueos");
  return {
    message: r.cancelled
      ? `Bloqueo creado. Se cancelaron ${r.cancelled} ${r.cancelled === 1 ? "partido" : "partidos"}; vuelven a quedar por agendar.`
      : "Bloqueo creado.",
  };
}

export async function deleteBlock(blockId: string): Promise<Result> {
  const club = await getMyClubAsAdmin();
  if (!club) return { ok: false, error: "No autorizado." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("court_blocks").delete().eq("id", blockId).eq("club_id", club.id).select("id");
  if (error || !data?.length) return { ok: false, error: "No se pudo quitar el bloqueo." };
  revalidateCourts();
  revalidatePath("/club/bloqueos");
  return { ok: true };
}
