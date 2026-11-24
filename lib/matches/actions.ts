"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth/dal";
import type { FormState } from "@/lib/forms";
import { getMyClubAsAdmin } from "@/lib/clubs/queries";
import type { TablesUpdate } from "@/lib/supabase/database.types";
import { parseConfig } from "@/lib/tournaments/config";
import { validateScore } from "@/lib/tournaments/scoring";
import {
  onBookingCancelled,
  onResultDisputed,
  onResultReported,
  onSlotAccepted,
  onSlotDeclined,
  onSlotProposed,
} from "@/lib/notifications/events";

/** Avisos después de responder: no retrasan la acción y un fallo no la rompe. */
function later(task: () => Promise<void>) {
  after(() => task().catch((e) => console.error("[notify]", e instanceof Error ? e.message : e)));
}

/**
 * Acciones del link de partido. Todo lo decide la base: las RPCs validan
 * que quien llama juega el partido, el estado y el horario. Sus mensajes
 * (22023/55000/42501/RC409) ya vienen en español para el jugador.
 */

const uuid = z.uuid();

function rpcError(error: { code?: string; message: string }): FormState {
  if (error.code === "23P01") return { error: "Esa cancha ya se apartó en ese horario. Elige otro." };
  if (["22023", "55000", "42501", "RC409"].includes(error.code ?? "")) return { error: error.message };
  console.error("[matches] rpc:", error.code, error.message);
  return { error: "No se pudo completar. Inténtalo de nuevo." };
}

async function matchIdByToken(token: string): Promise<string | null> {
  if (!uuid.safeParse(token).success) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("matches").select("id").eq("booking_token", token).maybeSingle();
  return data?.id ?? null;
}

function revalidateMatch(token: string) {
  revalidatePath(`/p/${token}`);
  revalidatePath("/jugador", "layout");
  revalidatePath("/club/calendario");
  revalidatePath("/club/torneos", "layout");
}

/** `slot` = "{courtId}|{inicio ISO}" (un radio por horario libre). */
export async function proposeSlot(_prev: FormState, formData: FormData): Promise<FormState> {
  if (!(await getProfile())) return { error: "Inicia sesión." };
  const token = String(formData.get("token") ?? "");
  const [courtId, start] = String(formData.get("slot") ?? "").split("|");
  if (!uuid.safeParse(courtId).success || !start || Number.isNaN(Date.parse(start))) {
    return { error: "Elige un horario." };
  }
  const matchId = await matchIdByToken(token);
  if (!matchId) return { error: "Partido no encontrado." };

  const supabase = await createClient();
  const { data: proposalId, error } = await supabase.rpc("propose_slot", { p_match: matchId, p_court: courtId!, p_start: start });
  if (error) return rpcError(error);
  later(() => onSlotProposed(proposalId));
  revalidateMatch(token);
  return { message: "Propuesta enviada. Tu rival tiene que aceptarla para apartar la cancha." };
}

export async function respondToProposal(_prev: FormState, formData: FormData): Promise<FormState> {
  if (!(await getProfile())) return { error: "Inicia sesión." };
  const token = String(formData.get("token") ?? "");
  const proposalId = String(formData.get("proposalId") ?? "");
  const accept = formData.get("accept") === "1";
  if (!uuid.safeParse(proposalId).success) return { error: "Propuesta no válida." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("respond_slot", { p_proposal: proposalId, p_accept: accept });
  if (error) return rpcError(error);
  later(() => (accept ? onSlotAccepted(proposalId) : onSlotDeclined(proposalId)));
  revalidateMatch(token);
  return { message: accept ? "¡Listo! Cancha apartada." : "Propuesta rechazada." };
}

export async function withdrawProposal(formData: FormData): Promise<void> {
  const token = String(formData.get("token") ?? "");
  const proposalId = String(formData.get("proposalId") ?? "");
  if (!uuid.safeParse(proposalId).success) return;
  const supabase = await createClient();
  const { error } = await supabase.rpc("withdraw_slot", { p_proposal: proposalId });
  if (error) console.error("[matches] withdraw:", error.code, error.message);
  revalidateMatch(token);
}

export async function cancelBooking(_prev: FormState, formData: FormData): Promise<FormState> {
  const profile = await getProfile();
  if (!profile) return { error: "Inicia sesión." };
  const token = String(formData.get("token") ?? "");
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 200);
  const matchId = await matchIdByToken(token);
  if (!matchId) return { error: "Partido no encontrado." };

  const supabase = await createClient();
  const { data: booking } = await supabase.from("court_bookings").select("id").eq("match_id", matchId).eq("status", "confirmed").maybeSingle();
  const { error } = await supabase.rpc("cancel_match_booking", { p_match: matchId, p_reason: reason || null });
  if (error) return rpcError(error);
  if (booking) later(() => onBookingCancelled(matchId, booking.id, profile.id));
  revalidateMatch(token);
  return { message: "Reserva cancelada. El partido vuelve a estar por agendar." };
}

// ──────────────────────────────── resultados ─────────────────────────────

/**
 * Sets del formulario: `s{n}_{x}` / `s{n}_{y}` (n = 1..3). Un set vacío se
 * omite; uno a medias es error. Devuelve pares [x, y].
 */
function setsFromForm(formData: FormData, x: string, y: string): [number, number][] | string {
  const sets: [number, number][] = [];
  for (let n = 1; n <= 3; n++) {
    const a = String(formData.get(`s${n}_${x}`) ?? "").trim();
    const b = String(formData.get(`s${n}_${y}`) ?? "").trim();
    if (a === "" && b === "") continue;
    if (a === "" || b === "" || !/^\d{1,2}$/.test(a) || !/^\d{1,2}$/.test(b)) return `Completa el set ${n}.`;
    sets.push([Number(a), Number(b)]);
  }
  return sets;
}

async function matchForResult(token: string) {
  if (!uuid.safeParse(token).success) return null;
  const supabase = await createClient();
  const { data: m } = await supabase
    .from("matches")
    .select("id, club_id, entry_a, entry_b, status, scheduled_at, tournament_id, round_id")
    .eq("booking_token", token)
    .maybeSingle();
  if (!m) return null;
  const { data: t } = await supabase.from("tournaments").select("config").eq("id", m.tournament_id).single();
  return { ...m, config: parseConfig(t?.config) };
}

/** El ganador sube el resultado (o reclama un default). Los sets llegan como "yo"/"rival". */
export async function reportResult(_prev: FormState, formData: FormData): Promise<FormState> {
  const profile = await getProfile();
  if (!profile) return { error: "Inicia sesión." };
  const token = String(formData.get("token") ?? "");
  const m = await matchForResult(token);
  if (!m) return { error: "Partido no encontrado." };

  const supabase = await createClient();
  const { data: mine } = await supabase
    .from("tournament_entries")
    .select("id")
    .eq("player_id", profile.id)
    .in("id", [m.entry_a, m.entry_b])
    .maybeSingle();
  if (!mine) return { error: "No juegas este partido." };

  const result = formData.get("result") === "default" ? "default" : "played";
  let score: { sets: [number, number][] } | null = null;
  if (result === "played") {
    const sets = setsFromForm(formData, "me", "rival");
    if (typeof sets === "string") return { error: sets };
    // A la orientación de la base: siempre [juegos de A, juegos de B].
    const oriented = mine.id === m.entry_a ? sets : sets.map(([me, rival]) => [rival, me] as [number, number]);
    const check = validateScore({ sets: oriented }, m.config.match_format);
    if (!check.ok) return { error: check.error };
    const iWon = (check.summary.winner === "a") === (mine.id === m.entry_a);
    if (!iWon) return { error: "El resultado lo sube quien ganó. Si perdiste, tu rival lo sube y tú lo confirmas." };
    score = { sets: oriented };
  }

  const { error } = await supabase.rpc("report_result", { p_match: m.id, p_result: result, p_score: score });
  if (error) return rpcError(error);
  later(() => onResultReported(m.id));
  revalidateMatch(token);
  return { message: "Resultado enviado. Tu rival tiene que confirmarlo." };
}

export async function confirmResult(_prev: FormState, formData: FormData): Promise<FormState> {
  if (!(await getProfile())) return { error: "Inicia sesión." };
  const token = String(formData.get("token") ?? "");
  const matchId = await matchIdByToken(token);
  if (!matchId) return { error: "Partido no encontrado." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("confirm_result", { p_match: matchId });
  if (error) return rpcError(error);
  revalidateMatch(token);
  return { message: "Resultado confirmado." };
}

export async function disputeResult(_prev: FormState, formData: FormData): Promise<FormState> {
  if (!(await getProfile())) return { error: "Inicia sesión." };
  const token = String(formData.get("token") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason) return { error: "Explica qué está mal en el resultado." };
  const matchId = await matchIdByToken(token);
  if (!matchId) return { error: "Partido no encontrado." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("dispute_result", { p_match: matchId, p_reason: reason });
  if (error) return rpcError(error);
  later(() => onResultDisputed(matchId));
  revalidateMatch(token);
  return { message: "Disputa enviada. El administrador del club lo resolverá." };
}

/**
 * Corrección del admin (árbitro general). `outcome`:
 *   played      marcador (orientado A/B: `s{n}_a`/`s{n}_b`); el ganador sale del marcador
 *   def_a/def_b gana A/B por default (W.O.)
 *   not_played  no jugado
 *   reopen      borra el resultado (vuelve a agendado o por agendar)
 * Sólo en rondas activas: una ronda cerrada ya congeló sus tablas.
 */
export async function adminSetResult(_prev: FormState, formData: FormData): Promise<FormState> {
  const club = await getMyClubAsAdmin();
  const profile = await getProfile();
  if (!club || !profile) return { error: "No autorizado." };
  const token = String(formData.get("token") ?? "");
  const m = await matchForResult(token);
  if (!m || m.club_id !== club.id) return { error: "Partido no encontrado." };

  const supabase = await createClient();
  const { data: round } = await supabase.from("rounds").select("status").eq("id", m.round_id).single();
  if (round?.status !== "active") return { error: "La ronda ya está cerrada: sus tablas están congeladas." };

  const outcome = String(formData.get("outcome") ?? "");
  const now = new Date().toISOString();
  const override = { admin_override_by: profile.id, confirmed_at: now };
  let patch: TablesUpdate<"matches">;

  if (outcome === "played") {
    const sets = setsFromForm(formData, "a", "b");
    if (typeof sets === "string") return { error: sets };
    const check = validateScore({ sets }, m.config.match_format);
    if (!check.ok) return { error: check.error };
    patch = { ...override, status: "confirmed", result_type: "played", score: { sets }, winner_entry_id: check.summary.winner === "a" ? m.entry_a : m.entry_b };
  } else if (outcome === "def_a" || outcome === "def_b") {
    patch = { ...override, status: "confirmed", result_type: "default", score: null, winner_entry_id: outcome === "def_a" ? m.entry_a : m.entry_b };
  } else if (outcome === "not_played") {
    patch = { ...override, status: "not_played", result_type: "not_played", score: null, winner_entry_id: null };
  } else if (outcome === "reopen") {
    const { data: booking } = await supabase.from("court_bookings").select("id").eq("match_id", m.id).eq("status", "confirmed").maybeSingle();
    patch = {
      status: booking && m.scheduled_at ? "scheduled" : "pending",
      result_type: null, score: null, winner_entry_id: null,
      reported_by: null, reported_at: null, confirmed_by: null, confirmed_at: null, admin_override_by: profile.id,
    };
  } else {
    return { error: "Elige un resultado." };
  }

  const { error } = await supabase.from("matches").update(patch).eq("id", m.id).eq("club_id", club.id);
  if (error) {
    console.error("[matches] adminSetResult:", error.code, error.message);
    return { error: "No se pudo guardar el resultado." };
  }
  revalidateMatch(token);
  return { message: outcome === "reopen" ? "Resultado borrado." : "Resultado guardado." };
}
