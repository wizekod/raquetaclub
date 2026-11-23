"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth/dal";
import type { FormState } from "@/lib/forms";

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
  const { error } = await supabase.rpc("propose_slot", { p_match: matchId, p_court: courtId!, p_start: start });
  if (error) return rpcError(error);
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
  if (!(await getProfile())) return { error: "Inicia sesión." };
  const token = String(formData.get("token") ?? "");
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 200);
  const matchId = await matchIdByToken(token);
  if (!matchId) return { error: "Partido no encontrado." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_match_booking", { p_match: matchId, p_reason: reason || null });
  if (error) return rpcError(error);
  revalidateMatch(token);
  return { message: "Reserva cancelada. El partido vuelve a estar por agendar." };
}
