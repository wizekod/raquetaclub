"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProfile } from "@/lib/auth/dal";
import { getMyClub, getMyClubAsAdmin } from "@/lib/clubs/queries";
import { emptyToUndefined, type FormState } from "@/lib/forms";
import { MEDIA_BUCKET, isOwnMediaPath } from "@/lib/storage/media";
import { Constants, type Json } from "@/lib/supabase/database.types";

import { defaultConfig, parseConfig, type TournamentConfig } from "./config";
import { suggestGroups } from "./ladder";
import { listEntries } from "./queries";
import { resultsDeadline } from "./rounds";

const date = z.preprocess(emptyToUndefined, z.iso.date("Fecha no válida").optional());
const id = z.uuid();

function revalidateTournament(tournamentId?: string) {
  revalidatePath("/club/torneos");
  if (tournamentId) revalidatePath(`/club/torneos/${tournamentId}`, "layout");
  revalidatePath("/jugador/torneos", "layout");
}

const datesOrder = (d: { starts_on?: string; ends_on?: string }) =>
  !d.starts_on || !d.ends_on || d.starts_on <= d.ends_on;
const datesError = { message: "Termina antes de empezar", path: ["ends_on"] };

// ─────────────────────────────── torneos ────────────────────────────────

const createSchema = z
  .object({
    name: z.string().trim().min(1, "Ponle un nombre").max(80, "Máximo 80 caracteres"),
    type: z.enum(Constants.public.Enums.tournament_type),
    sport: z.enum(Constants.public.Enums.sport),
    starts_on: date,
    ends_on: date,
  })
  .refine(datesOrder, datesError);

export async function createTournament(_prev: FormState, formData: FormData): Promise<FormState> {
  const club = await getMyClubAsAdmin();
  if (!club) return { error: "No autorizado." };

  const parsed = createSchema.safeParse({
    name: formData.get("name"),
    type: formData.get("type"),
    sport: formData.get("sport") ?? club.sports[0],
    starts_on: formData.get("starts_on"),
    ends_on: formData.get("ends_on"),
  });
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  const d = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tournaments")
    .insert({
      club_id: club.id,
      name: d.name,
      type: d.type,
      sport: d.sport,
      starts_on: d.starts_on ?? null,
      ends_on: d.ends_on ?? null,
      config: defaultConfig(d.type) as unknown as Json,
    })
    .select("id")
    .single();
  if (error || !data) {
    console.error("[tournaments] create:", error?.message);
    return { error: "No se pudo crear el torneo." };
  }
  revalidateTournament();
  redirect(`/club/torneos/${data.id}`);
}

const updateSchema = z
  .object({
    name: z.string().trim().min(1, "Ponle un nombre").max(80, "Máximo 80 caracteres"),
    sport: z.enum(Constants.public.Enums.sport),
    status: z.enum(Constants.public.Enums.tournament_status),
    registration_open: z.preprocess((v) => v === "on", z.boolean()),
    starts_on: date,
    ends_on: date,
    rules_text: z.preprocess(emptyToUndefined, z.string().trim().max(20_000, "Máximo 20,000 caracteres").optional()),
    rules_pdf_path: z.preprocess(emptyToUndefined, z.string().max(300).optional()),
  })
  .refine(datesOrder, datesError)
  .refine((d) => !d.registration_open || d.status === "registration" || d.status === "active", {
    message: "Sólo se puede abrir la inscripción con el torneo en Inscripciones o En curso",
    path: ["registration_open"],
  });

/** Datos generales, estado, inscripción y reglamento (texto y/o PDF). */
export async function updateTournament(_prev: FormState, formData: FormData): Promise<FormState> {
  const club = await getMyClubAsAdmin();
  if (!club) return { error: "No autorizado." };
  const tournamentId = String(formData.get("id") ?? "");

  const parsed = updateSchema.safeParse(Object.fromEntries(
    ["name", "sport", "status", "registration_open", "starts_on", "ends_on", "rules_text", "rules_pdf_path"].map((k) => [k, formData.get(k)]),
  ));
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  const d = parsed.data;
  if (d.rules_pdf_path && !isOwnMediaPath(d.rules_pdf_path, club.id, "rules")) return { error: "Archivo no válido." };

  const supabase = await createClient();
  const { data: before } = await supabase
    .from("tournaments")
    .select("rules_pdf_path")
    .eq("id", tournamentId)
    .eq("club_id", club.id)
    .maybeSingle();
  if (!before) return { error: "Torneo no encontrado." };

  const { error } = await supabase
    .from("tournaments")
    .update({
      name: d.name,
      sport: d.sport,
      status: d.status,
      registration_open: d.registration_open,
      starts_on: d.starts_on ?? null,
      ends_on: d.ends_on ?? null,
      rules_text: d.rules_text ?? null,
      rules_pdf_path: d.rules_pdf_path ?? null,
    })
    .eq("id", tournamentId)
    .eq("club_id", club.id);
  if (error) {
    console.error("[tournaments] update:", error.message);
    return { error: "No se pudo guardar el torneo." };
  }

  // El PDF anterior se borra sólo después de guardar bien el nuevo.
  if (before.rules_pdf_path && before.rules_pdf_path !== (d.rules_pdf_path ?? null)) {
    const { error: rmError } = await createAdminClient().storage.from(MEDIA_BUCKET).remove([before.rules_pdf_path]);
    if (rmError) console.error("[tournaments] remove old rules:", rmError.message);
  }

  revalidateTournament(tournamentId);
  return { message: "Torneo guardado." };
}

const num = (min: number, max: number, msg = `Entre ${min} y ${max}`) =>
  z.coerce.number({ error: "Número no válido" }).min(min, msg).max(max, msg);
const int = (min: number, max: number) => num(min, max).int("Número entero");

const configFormSchema = z.object({
  group_size: int(3, 10),
  promote: int(0, 5),
  relegate: int(0, 5),
  win: num(0, 100),
  win_default: num(0, 100),
  loss_played: num(0, 100),
  loss_default: num(0, 100),
  not_played: num(0, 100),
  bonus_week1: num(0, 10),
  bonus_week2: num(0, 10),
  deadline_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Formato HH:MM"),
  auto_expel: int(0, 12),
  third_set: z.enum(["match_tiebreak_10", "full_set"]),
  match_minutes: int(30, 240),
});

/** Reglas de puntuación y de la escalera (`tournaments.config`). */
export async function updateTournamentConfig(_prev: FormState, formData: FormData): Promise<FormState> {
  const club = await getMyClubAsAdmin();
  if (!club) return { error: "No autorizado." };
  const tournamentId = String(formData.get("id") ?? "");

  const parsed = configFormSchema.safeParse(Object.fromEntries(Object.keys(configFormSchema.shape).map((k) => [k, formData.get(k)])));
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  const d = parsed.data;

  const supabase = await createClient();
  const { data: t } = await supabase.from("tournaments").select("config").eq("id", tournamentId).eq("club_id", club.id).maybeSingle();
  if (!t) return { error: "Torneo no encontrado." };

  const current = parseConfig(t.config);
  const config: TournamentConfig = {
    ...current,
    group_size: d.group_size,
    promote: d.promote,
    relegate: d.relegate,
    points: { win: d.win, win_default: d.win_default, loss_played: d.loss_played, loss_default: d.loss_default, not_played: d.not_played },
    bonus: [
      { week: 1, value: d.bonus_week1 },
      { week: 2, value: d.bonus_week2 },
    ].filter((b) => b.value > 0),
    results_deadline: { ...current.results_deadline, time: d.deadline_time },
    auto_expel_after_inactive_rounds: d.auto_expel,
    match_format: { ...current.match_format, third_set: d.third_set },
    match_minutes: d.match_minutes,
  };

  const { error } = await supabase
    .from("tournaments")
    .update({ config: config as unknown as Json })
    .eq("id", tournamentId)
    .eq("club_id", club.id);
  if (error) return { error: "No se pudieron guardar las reglas." };

  revalidateTournament(tournamentId);
  return { message: "Reglas guardadas." };
}

/** Sólo un torneo que nunca publicó rondas: después hay historial que conservar. */
export async function deleteTournament(formData: FormData): Promise<void> {
  const club = await getMyClubAsAdmin();
  if (!club) return;
  const tournamentId = String(formData.get("id") ?? "");

  const supabase = await createClient();
  const { data: published } = await supabase
    .from("rounds")
    .select("id")
    .eq("tournament_id", tournamentId)
    .neq("status", "draft")
    .limit(1);
  if (published?.length) return;

  const { data: t } = await supabase
    .from("tournaments")
    .delete()
    .eq("id", tournamentId)
    .eq("club_id", club.id)
    .select("rules_pdf_path")
    .maybeSingle();
  if (t?.rules_pdf_path) await createAdminClient().storage.from(MEDIA_BUCKET).remove([t.rules_pdf_path]);

  revalidateTournament();
  redirect("/club/torneos");
}

// ───────────────────────────── inscripciones ────────────────────────────

const entryStatusSchema = z.object({
  entryId: id,
  status: z.enum(Constants.public.Enums.entry_status),
});

/** Aceptar, rechazar, dar de baja… una inscripción (botones de la lista). */
export async function setEntryStatus(formData: FormData): Promise<void> {
  const club = await getMyClubAsAdmin();
  if (!club) return;
  const parsed = entryStatusSchema.safeParse({ entryId: formData.get("entryId"), status: formData.get("status") });
  if (!parsed.success) return;

  const supabase = await createClient();
  const { data } = await supabase
    .from("tournament_entries")
    .update({ status: parsed.data.status })
    .eq("id", parsed.data.entryId)
    .eq("club_id", club.id)
    .select("tournament_id")
    .maybeSingle();
  if (data) revalidateTournament(data.tournament_id);
}

/** Alta directa por el admin: entra ya aceptado. */
export async function addEntry(_prev: FormState, formData: FormData): Promise<FormState> {
  const club = await getMyClubAsAdmin();
  if (!club) return { error: "No autorizado." };
  const parsed = z.object({ tournamentId: id, playerId: id }).safeParse({
    tournamentId: formData.get("tournamentId"),
    playerId: formData.get("playerId"),
  });
  if (!parsed.success) return { fieldErrors: { playerId: ["Elige un jugador"] } };

  const supabase = await createClient();
  const { error } = await supabase.from("tournament_entries").insert({
    club_id: club.id,
    tournament_id: parsed.data.tournamentId,
    player_id: parsed.data.playerId,
    status: "accepted",
  });
  if (error) {
    if (error.code === "23505") return { fieldErrors: { playerId: ["Ya está inscrito"] } };
    if (error.code === "23503") return { fieldErrors: { playerId: ["Ese jugador no es de tu club"] } };
    return { error: "No se pudo inscribir." };
  }
  revalidateTournament(parsed.data.tournamentId);
  return { message: "Jugador inscrito." };
}

/** Siembra de los aceptados: campos `seed:{entryId}` (vacío = sin siembra). */
export async function saveSeeds(_prev: FormState, formData: FormData): Promise<FormState> {
  const club = await getMyClubAsAdmin();
  if (!club) return { error: "No autorizado." };
  const tournamentId = String(formData.get("tournamentId") ?? "");

  const updates: { id: string; seed: number | null }[] = [];
  for (const [k, v] of formData.entries()) {
    if (!k.startsWith("seed:")) continue;
    const entryId = k.slice(5);
    const raw = String(v).trim();
    const seed = raw === "" ? null : Number(raw);
    if (!id.safeParse(entryId).success) continue;
    if (seed !== null && (!Number.isInteger(seed) || seed < 1 || seed > 999)) {
      return { error: "La siembra es un número entero de 1 a 999." };
    }
    updates.push({ id: entryId, seed });
  }

  const supabase = await createClient();
  for (const u of updates) {
    const { error } = await supabase
      .from("tournament_entries")
      .update({ seed: u.seed })
      .eq("id", u.id)
      .eq("tournament_id", tournamentId)
      .eq("club_id", club.id);
    if (error) return { error: "No se pudo guardar la siembra." };
  }
  revalidateTournament(tournamentId);
  return { message: "Siembra guardada." };
}

/** Autoinscripción del jugador. La base exige inscripción abierta y estado `pending`. */
export async function enrollInTournament(formData: FormData): Promise<void> {
  const profile = await getProfile();
  const club = await getMyClub();
  if (!profile || !club || profile.role !== "player" || profile.status !== "active") return;
  const tournamentId = String(formData.get("tournamentId") ?? "");
  if (!id.safeParse(tournamentId).success) return;

  const supabase = await createClient();
  const { error } = await supabase
    .from("tournament_entries")
    .insert({ club_id: club.id, tournament_id: tournamentId, player_id: profile.id });
  if (error && error.code !== "23505") console.error("[tournaments] enroll:", error.code, error.message);
  revalidatePath("/jugador/torneos", "layout");
  revalidatePath(`/club/torneos/${tournamentId}`);
}

// ──────────────────────────────── rondas ─────────────────────────────────

const roundSchema = z
  .object({
    name: z.string().trim().min(1, "Ponle un nombre").max(40, "Máximo 40 caracteres"),
    starts_on: z.iso.date("Fecha no válida"),
    ends_on: z.iso.date("Fecha no válida"),
  })
  .refine(datesOrder, datesError);

/** Crea la siguiente ronda en borrador (con fechas sugeridas editables). */
export async function createRound(_prev: FormState, formData: FormData): Promise<FormState> {
  const club = await getMyClubAsAdmin();
  if (!club) return { error: "No autorizado." };
  const tournamentId = String(formData.get("tournamentId") ?? "");

  const parsed = roundSchema.safeParse({
    name: formData.get("name"),
    starts_on: formData.get("starts_on"),
    ends_on: formData.get("ends_on"),
  });
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors };

  const supabase = await createClient();
  const [{ data: t }, { data: last }] = await Promise.all([
    supabase.from("tournaments").select("config").eq("id", tournamentId).eq("club_id", club.id).maybeSingle(),
    supabase.from("rounds").select("number, status").eq("tournament_id", tournamentId).order("number", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (!t) return { error: "Torneo no encontrado." };
  if (last && last.status !== "closed") return { error: "Cierra la ronda actual antes de crear la siguiente." };

  const config = parseConfig(t.config);
  const { data: round, error } = await supabase
    .from("rounds")
    .insert({
      club_id: club.id,
      tournament_id: tournamentId,
      number: (last?.number ?? 0) + 1,
      ...parsed.data,
      results_deadline: resultsDeadline(parsed.data.ends_on, config, club.timezone),
    })
    .select("id")
    .single();
  if (error || !round) {
    if (error?.code === "23505") return { error: "Ya hay una ronda abierta." };
    console.error("[tournaments] createRound:", error?.message);
    return { error: "No se pudo crear la ronda." };
  }
  revalidateTournament(tournamentId);
  redirect(`/club/torneos/${tournamentId}/rondas/${round.id}`);
}

export async function updateRound(_prev: FormState, formData: FormData): Promise<FormState> {
  const club = await getMyClubAsAdmin();
  if (!club) return { error: "No autorizado." };
  const roundId = String(formData.get("roundId") ?? "");

  const parsed = roundSchema.safeParse({
    name: formData.get("name"),
    starts_on: formData.get("starts_on"),
    ends_on: formData.get("ends_on"),
  });
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors };

  const supabase = await createClient();
  const { data: r } = await supabase
    .from("rounds")
    .select("tournament_id, status, tournaments(config)")
    .eq("id", roundId)
    .eq("club_id", club.id)
    .maybeSingle();
  if (!r) return { error: "Ronda no encontrada." };
  if (r.status === "closed") return { error: "La ronda ya está cerrada." };

  const { error } = await supabase
    .from("rounds")
    .update({
      ...parsed.data,
      results_deadline: resultsDeadline(parsed.data.ends_on, parseConfig(r.tournaments?.config), club.timezone),
    })
    .eq("id", roundId);
  if (error) return { error: "No se pudo guardar la ronda." };
  revalidateTournament(r.tournament_id);
  return { message: "Ronda guardada." };
}

/** Sólo en borrador: una ronda publicada ya tiene partidos y jugadores avisados. */
export async function deleteRound(formData: FormData): Promise<void> {
  const club = await getMyClubAsAdmin();
  if (!club) return;
  const roundId = String(formData.get("roundId") ?? "");
  const supabase = await createClient();
  const { data } = await supabase
    .from("rounds")
    .delete()
    .eq("id", roundId)
    .eq("club_id", club.id)
    .eq("status", "draft")
    .select("tournament_id")
    .maybeSingle();
  if (!data) return;
  revalidateTournament(data.tournament_id);
  redirect(`/club/torneos/${data.tournament_id}`);
}

type GroupsPayload = { level: number; entries: string[] }[];

function groupsError(code: string | undefined, message?: string): FormState {
  if (code === "22023") return { error: "Sólo puedes poner en grupos a jugadores aceptados." };
  if (code === "55000") return { error: message ?? "La ronda ya está publicada." };
  if (code === "23505") return { error: "Un jugador no puede estar en dos grupos." };
  console.error("[tournaments] groups:", code, message);
  return { error: "No se pudieron guardar los grupos." };
}

/**
 * Grupos armados a mano: un `<select name="group:{entryId}">` por jugador
 * aceptado con el nivel (vacío = fuera de esta ronda). Funciona sin JS. El
 * orden dentro del grupo es la siembra.
 */
export async function saveGroups(_prev: FormState, formData: FormData): Promise<FormState> {
  const club = await getMyClubAsAdmin();
  if (!club) return { error: "No autorizado." };
  const roundId = String(formData.get("roundId") ?? "");

  const supabase = await createClient();
  const { data: round } = await supabase.from("rounds").select("tournament_id").eq("id", roundId).eq("club_id", club.id).maybeSingle();
  if (!round) return { error: "Ronda no encontrada." };

  const levelOf = new Map<string, number>();
  for (const [k, v] of formData.entries()) {
    if (!k.startsWith("group:") || String(v) === "") continue;
    const level = Number(v);
    if (!Number.isInteger(level) || level < 1 || level > 100) return { error: "Grupo no válido." };
    levelOf.set(k.slice(6), level);
  }

  // Orden por siembra: el mismo que usa la lista de inscripciones.
  const entries = await listEntries(round.tournament_id);
  const levels = [...new Set(levelOf.values())].sort((a, b) => a - b);
  // Los niveles se renumeran 1..n: si el admin deja vacío el grupo 2, el 3 pasa a ser el 2.
  const payload: GroupsPayload = levels.map((lvl, i) => ({
    level: i + 1,
    entries: entries.filter((e) => levelOf.get(e.id) === lvl).map((e) => e.id),
  }));

  const { error } = await supabase.rpc("save_round_groups", { p_round: roundId, p_groups: payload as unknown as Json });
  if (error) return groupsError(error.code, error.message);
  revalidateTournament(round.tournament_id);
  return { message: "Grupos guardados." };
}

/** Arma los grupos por siembra con el tamaño de la config (ronda en borrador). */
export async function suggestRoundGroups(_prev: FormState, formData: FormData): Promise<FormState> {
  const club = await getMyClubAsAdmin();
  if (!club) return { error: "No autorizado." };
  const roundId = String(formData.get("roundId") ?? "");

  const supabase = await createClient();
  const { data: round } = await supabase
    .from("rounds")
    .select("tournament_id, tournaments(config)")
    .eq("id", roundId)
    .eq("club_id", club.id)
    .maybeSingle();
  if (!round) return { error: "Ronda no encontrada." };

  const accepted = (await listEntries(round.tournament_id)).filter((e) => e.status === "accepted");
  if (accepted.length < 2) return { error: "Necesitas al menos 2 jugadores aceptados." };
  const config = parseConfig(round.tournaments?.config);
  const payload: GroupsPayload = suggestGroups(accepted, config.group_size).map((g, i) => ({
    level: i + 1,
    entries: g.map((e) => e.id),
  }));

  const { error } = await supabase.rpc("save_round_groups", { p_round: roundId, p_groups: payload as unknown as Json });
  if (error) return groupsError(error.code, error.message);
  revalidateTournament(round.tournament_id);
  return { message: `Grupos sugeridos: ${payload.length}.` };
}

/** Publica la ronda: genera los partidos y la hace visible a los jugadores. */
export async function publishRound(_prev: FormState, formData: FormData): Promise<FormState> {
  const club = await getMyClubAsAdmin();
  if (!club) return { error: "No autorizado." };
  const roundId = String(formData.get("roundId") ?? "");

  const supabase = await createClient();
  const { data: count, error } = await supabase.rpc("publish_round", { p_round: roundId });
  if (error) return groupsError(error.code, error.message);

  const { data: round } = await supabase.from("rounds").select("tournament_id").eq("id", roundId).maybeSingle();
  revalidateTournament(round?.tournament_id);
  // Los avisos (correo, WhatsApp, push) con los links de partido: paso 8.
  return { message: `Ronda publicada: ${count} partidos.` };
}
