import type { Enums } from "@/lib/supabase/database.types";

export const TYPE_LABEL: Record<Enums<"tournament_type">, string> = {
  ladder: "Escalera",
  round_robin: "Round robin",
};

export const STATUS_LABEL: Record<Enums<"tournament_status">, string> = {
  draft: "Borrador",
  registration: "Inscripciones",
  active: "En curso",
  finished: "Finalizado",
};

export const ENTRY_STATUS_LABEL: Record<Enums<"entry_status">, string> = {
  pending: "Por aceptar",
  accepted: "Aceptado",
  rejected: "Rechazado",
  withdrawn: "Baja",
  expelled: "Expulsado",
};

export const ROUND_STATUS_LABEL: Record<Enums<"round_status">, string> = {
  draft: "Borrador",
  active: "Publicada",
  closed: "Cerrada",
};

export const MATCH_STATUS_LABEL: Record<Enums<"match_status">, string> = {
  pending: "Por agendar",
  scheduled: "Agendado",
  reported: "Resultado por confirmar",
  disputed: "En disputa",
  confirmed: "Jugado",
  not_played: "No jugado",
  cancelled: "Cancelado",
};
