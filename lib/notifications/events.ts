import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { clientEnv } from "@/lib/env";
import { formatDateTime } from "@/lib/format/dates";
import { formatScore } from "@/lib/tournaments/format";

import { clubAdminIds, loadRecipients, notify, notifyMany, type Recipient } from "./dispatch";

/**
 * Avisos de cada evento del torneo. Se llaman con `after()` desde las
 * acciones (no retrasan la respuesta) y desde el cron. Leen con service_role:
 * no dependen de la sesión de quien disparó el evento.
 */

const APP = () => clientEnv.NEXT_PUBLIC_APP_URL;
const matchLink = (token: string) => `${APP()}/p/${token}`;

type MatchCtx = {
  id: string;
  token: string;
  clubId: string;
  clubName: string;
  tz: string;
  tournamentId: string;
  tournamentName: string;
  entryA: string;
  entryB: string;
  /** Perfil de cada lado. */
  playerA: string;
  playerB: string;
  score: unknown;
  resultType: string | null;
  winnerEntry: string | null;
  reportedBy: string | null;
  reportedAt: string | null;
};

async function loadMatch(matchId: string): Promise<MatchCtx | null> {
  const admin = createAdminClient();
  const { data: m } = await admin.from("matches").select("*").eq("id", matchId).maybeSingle();
  if (!m) return null;
  const [{ data: club }, { data: t }, { data: entries }] = await Promise.all([
    admin.from("clubs").select("name, timezone").eq("id", m.club_id).single(),
    admin.from("tournaments").select("name").eq("id", m.tournament_id).single(),
    admin.from("tournament_entries").select("id, player_id").in("id", [m.entry_a, m.entry_b]),
  ]);
  if (!club || !t) return null;
  const playerOf = new Map((entries ?? []).map((e) => [e.id, e.player_id]));
  return {
    id: m.id,
    token: m.booking_token,
    clubId: m.club_id,
    clubName: club.name,
    tz: club.timezone,
    tournamentId: m.tournament_id,
    tournamentName: t.name,
    entryA: m.entry_a,
    entryB: m.entry_b,
    playerA: playerOf.get(m.entry_a) ?? "",
    playerB: playerOf.get(m.entry_b) ?? "",
    score: m.score,
    resultType: m.result_type,
    winnerEntry: m.winner_entry_id,
    reportedBy: m.reported_by,
    reportedAt: m.reported_at,
  };
}

const rivalOf = (c: MatchCtx, profileId: string) => (profileId === c.playerA ? c.playerB : c.playerA);

async function courtName(courtId: string): Promise<string> {
  const { data } = await createAdminClient().from("courts").select("name").eq("id", courtId).maybeSingle();
  return data?.name ?? "Cancha";
}

// ─────────────────────────────── ronda ───────────────────────────────────

/** Ronda publicada: a cada jugador, su grupo y rivales. */
export async function onRoundPublished(roundId: string): Promise<void> {
  const admin = createAdminClient();
  const { data: round } = await admin.from("rounds").select("*").eq("id", roundId).maybeSingle();
  if (!round || round.status !== "active") return;
  const [{ data: club }, { data: t }, { data: groups }, { data: members }, { data: entries }] = await Promise.all([
    admin.from("clubs").select("name, timezone").eq("id", round.club_id).single(),
    admin.from("tournaments").select("id, name").eq("id", round.tournament_id).single(),
    admin.from("groups").select("id, name").eq("round_id", roundId),
    admin.from("group_members").select("group_id, entry_id").eq("round_id", roundId),
    admin.from("tournament_entries").select("id, player_id").eq("tournament_id", round.tournament_id),
  ]);
  if (!club || !t) return;
  const playerOf = new Map((entries ?? []).map((e) => [e.id, e.player_id]));
  const people = await loadRecipients((members ?? []).map((m) => playerOf.get(m.entry_id) ?? ""));
  const groupName = new Map((groups ?? []).map((g) => [g.id, g.name]));
  const link = `${APP()}/jugador/torneos/${t.id}`;
  const deadline = formatDateTime(round.results_deadline, club.timezone);

  const recipients = (members ?? []).flatMap((m) => {
    const r = people.get(playerOf.get(m.entry_id) ?? "");
    return r ? [{ r, member: m }] : [];
  });
  await notifyMany(recipients.map((x) => x.r), (r) => {
    const member = recipients.find((x) => x.r.id === r.id)!.member;
    const rivals = (members ?? [])
      .filter((o) => o.group_id === member.group_id && o.entry_id !== member.entry_id)
      .map((o) => people.get(playerOf.get(o.entry_id) ?? "")?.name ?? "—");
    const group = groupName.get(member.group_id) ?? "tu grupo";
    return {
      type: "ronda_publicada",
      dedupeKey: `round:${roundId}:${r.id}`,
      clubId: round.club_id,
      email: {
        subject: `${t.name}: ya está tu grupo de ${round.name}`,
        text:
          `Hola ${r.firstName}:\n\n${club.name} publicó la ronda ${round.name} de ${t.name}. ` +
          `Juegas en el ${group} contra: ${rivals.join(", ")}.\n\n` +
          `Agenda tus partidos y aparta la cancha aquí: ${link}\n\nFecha límite de resultados: ${deadline}.`,
      },
      whatsapp: { template: "ronda_publicada", params: [r.firstName, club.name, t.name, group, link] },
      push: { title: `${t.name}: ${group}`, body: `Ya puedes agendar tus partidos de ${round.name}.`, url: `/jugador/torneos/${t.id}`, tag: `round-${roundId}` },
    };
  });
}

// ─────────────────────────────── horarios ────────────────────────────────

async function loadProposal(proposalId: string) {
  const { data } = await createAdminClient().from("match_slot_proposals").select("*").eq("id", proposalId).maybeSingle();
  return data;
}

/** Propuesta de horario: al rival. */
export async function onSlotProposed(proposalId: string): Promise<void> {
  const p = await loadProposal(proposalId);
  if (!p || p.status !== "proposed") return;
  const c = await loadMatch(p.match_id);
  if (!c) return;
  const people = await loadRecipients([c.playerA, c.playerB]);
  const to = people.get(rivalOf(c, p.proposed_by));
  const from = people.get(p.proposed_by);
  if (!to || !from) return;
  const when = formatDateTime(p.start_at, c.tz);
  const court = await courtName(p.court_id);
  const link = matchLink(c.token);

  await notify(to, {
    type: "propuesta_horario",
    dedupeKey: `proposal:${p.id}`,
    clubId: c.clubId,
    matchId: c.id,
    email: {
      subject: `${from.name} te propone jugar el ${when}`,
      text: `Hola ${to.firstName}:\n\n${from.name} te propone jugar su partido de ${c.tournamentName} el ${when} en ${court}.\n\nLa cancha se aparta cuando aceptes: ${link}`,
    },
    whatsapp: { template: "propuesta_horario", params: [to.firstName, c.clubName, from.name, when, court, link] },
    push: { title: "Te propusieron horario", body: `${from.name}: ${when}, ${court}`, url: `/p/${c.token}`, tag: `match-${c.id}` },
  });
}

/** Propuesta aceptada: la cancha quedó apartada. A los dos jugadores. */
export async function onSlotAccepted(proposalId: string): Promise<void> {
  const p = await loadProposal(proposalId);
  if (!p || p.status !== "accepted") return;
  const c = await loadMatch(p.match_id);
  if (!c) return;
  const people = await loadRecipients([c.playerA, c.playerB]);
  const when = formatDateTime(p.start_at, c.tz);
  const court = await courtName(p.court_id);
  const link = matchLink(c.token);

  await notifyMany([...people.values()], (r) => {
    const rival = people.get(rivalOf(c, r.id))?.name ?? "tu rival";
    return {
      type: "horario_confirmado",
      dedupeKey: `accepted:${p.id}:${r.id}`,
      clubId: c.clubId,
      matchId: c.id,
      email: {
        subject: `Partido confirmado: ${when}`,
        text: `Hola ${r.firstName}:\n\nTu partido contra ${rival} quedó agendado el ${when} en ${court}. La cancha ya está apartada.\n\nDetalles: ${link}`,
      },
      whatsapp: { template: "horario_confirmado", params: [r.firstName, c.clubName, rival, when, court, link] },
      push: { title: "Partido confirmado", body: `vs ${rival}: ${when}, ${court}`, url: `/p/${c.token}`, tag: `match-${c.id}` },
    };
  });
}

/** Propuesta rechazada: a quien la hizo (sin plantilla de WhatsApp). */
export async function onSlotDeclined(proposalId: string): Promise<void> {
  const p = await loadProposal(proposalId);
  if (!p || p.status !== "declined") return;
  const c = await loadMatch(p.match_id);
  if (!c) return;
  const people = await loadRecipients([c.playerA, c.playerB]);
  const to = people.get(p.proposed_by);
  const rival = people.get(rivalOf(c, p.proposed_by))?.name ?? "Tu rival";
  if (!to) return;
  const when = formatDateTime(p.start_at, c.tz);
  await notify(to, {
    type: "propuesta_rechazada",
    dedupeKey: `declined:${p.id}`,
    clubId: c.clubId,
    matchId: c.id,
    email: {
      subject: `${rival} no puede el ${when}`,
      text: `Hola ${to.firstName}:\n\n${rival} rechazó jugar el ${when}. Propón otro horario: ${matchLink(c.token)}`,
    },
    push: { title: "Propuesta rechazada", body: `${rival} no puede el ${when}`, url: `/p/${c.token}`, tag: `match-${c.id}` },
  });
}

/** Reserva cancelada: a los jugadores que no la cancelaron. */
export async function onBookingCancelled(matchId: string, bookingId: string, byProfile: string): Promise<void> {
  const c = await loadMatch(matchId);
  if (!c) return;
  const { data: booking } = await createAdminClient().from("court_bookings").select("start_at, cancelled_reason").eq("id", bookingId).maybeSingle();
  if (!booking) return;
  const people = await loadRecipients([c.playerA, c.playerB, byProfile]);
  const by = people.get(byProfile)?.name ?? "El club";
  const when = formatDateTime(booking.start_at, c.tz);
  const recipients = [c.playerA, c.playerB].filter((id) => id !== byProfile).flatMap((id) => people.get(id) ?? []);
  await notifyMany(recipients, (r) => ({
    type: "reserva_cancelada",
    dedupeKey: `cancelled:${bookingId}:${r.id}`,
    clubId: c.clubId,
    matchId: c.id,
    email: {
      subject: `Se canceló tu partido del ${when}`,
      text:
        `Hola ${r.firstName}:\n\n${by} canceló la reserva del ${when}` +
        `${booking.cancelled_reason ? ` (${booking.cancelled_reason})` : ""}. El partido vuelve a estar por agendar: ${matchLink(c.token)}`,
    },
    push: { title: "Partido cancelado", body: `${when}: vuelve a estar por agendar`, url: `/p/${c.token}`, tag: `match-${c.id}` },
  }));
}

// ────────────────────────────── resultados ───────────────────────────────

/** Resultado subido: al rival, para que lo confirme. */
export async function onResultReported(matchId: string): Promise<void> {
  const c = await loadMatch(matchId);
  if (!c || !c.reportedBy) return;
  const people = await loadRecipients([c.playerA, c.playerB]);
  const to = people.get(rivalOf(c, c.reportedBy));
  const from = people.get(c.reportedBy);
  if (!to || !from) return;
  // Marcador desde el punto de vista de quien lo recibe.
  const score = c.resultType === "default" ? "default (no te presentaste)" : formatScore(c.score, to.id === c.playerB);
  const link = matchLink(c.token);
  await notify(to, {
    type: "resultado_pendiente",
    dedupeKey: `reported:${c.id}:${c.reportedAt}`,
    clubId: c.clubId,
    matchId: c.id,
    email: {
      subject: `Confirma el resultado contra ${from.name}`,
      text: `Hola ${to.firstName}:\n\n${from.name} subió el resultado de su partido: ${score}.\n\nConfírmalo o dispútalo aquí: ${link}\nSi no respondes, se confirma solo en 48 horas.`,
    },
    whatsapp: { template: "resultado_pendiente", params: [to.firstName, c.clubName, from.name, score, link] },
    push: { title: "Confirma el resultado", body: `${from.name}: ${score}`, url: `/p/${c.token}`, tag: `match-${c.id}` },
  });
}

/** Resultado disputado: a los administradores del club. */
export async function onResultDisputed(matchId: string): Promise<void> {
  const c = await loadMatch(matchId);
  if (!c) return;
  const { data: m } = await createAdminClient().from("matches").select("dispute_reason").eq("id", matchId).single();
  const people = await loadRecipients([c.playerA, c.playerB, ...(await clubAdminIds(c.clubId))]);
  const names = `${people.get(c.playerA)?.name ?? "—"} vs ${people.get(c.playerB)?.name ?? "—"}`;
  const admins = [...people.values()].filter((r) => r.id !== c.playerA && r.id !== c.playerB);
  await notifyMany(admins, (r) => ({
    type: "resultado_disputado",
    dedupeKey: `disputed:${c.id}:${c.reportedAt}:${r.id}`,
    clubId: c.clubId,
    matchId: c.id,
    email: {
      subject: `Resultado en disputa: ${names}`,
      text: `Hola ${r.firstName}:\n\nEl resultado de ${names} (${c.tournamentName}) está en disputa.\nMotivo: ${m?.dispute_reason ?? "—"}\n\nResuélvelo aquí: ${matchLink(c.token)}`,
    },
    push: { title: "Resultado en disputa", body: names, url: `/p/${c.token}`, tag: `dispute-${c.id}` },
  }));
}

// ──────────────────────────────── admins ─────────────────────────────────

/** Aviso a los admins de un club (cierres de ronda del cron). */
export async function notifyClubAdmins(
  clubId: string,
  msg: { type: string; dedupeKey: string; subject: string; text: string; url: string },
): Promise<void> {
  const people = await loadRecipients(await clubAdminIds(clubId));
  await notifyMany([...people.values()], (r: Recipient) => ({
    type: msg.type,
    dedupeKey: `${msg.dedupeKey}:${r.id}`,
    clubId,
    email: { subject: msg.subject, text: `Hola ${r.firstName}:\n\n${msg.text}\n\n${APP()}${msg.url}` },
    push: { title: msg.subject, body: msg.text.slice(0, 120), url: msg.url, tag: msg.dedupeKey },
  }));
}

// ───────────────────────────── recordatorios ─────────────────────────────

/** Recordatorio de partido agendado (24 h o 2 h antes) a los dos jugadores. */
export async function onMatchReminder(bookingId: string, kind: "24h" | "2h"): Promise<void> {
  const { data: b } = await createAdminClient().from("court_bookings").select("*").eq("id", bookingId).maybeSingle();
  if (!b || b.status !== "confirmed") return;
  const c = await loadMatch(b.match_id);
  if (!c) return;
  const people = await loadRecipients([c.playerA, c.playerB]);
  const when = formatDateTime(b.start_at, c.tz);
  const court = await courtName(b.court_id);
  const link = matchLink(c.token);

  await notifyMany([...people.values()], (r) => {
    const rival = people.get(rivalOf(c, r.id))?.name ?? "tu rival";
    return {
      type: "recordatorio_partido",
      dedupeKey: `reminder:${kind}:${b.id}:${r.id}`,
      clubId: c.clubId,
      matchId: c.id,
      email: {
        subject: kind === "2h" ? `Tu partido es en 2 horas (${court})` : `Recordatorio: juegas el ${when}`,
        text:
          `Hola ${r.firstName}:\n\nTe recordamos tu partido contra ${rival} el ${when} en ${court}.\n` +
          `Si no puedes jugar, cancela la reserva con tiempo: ${link}`,
      },
      whatsapp: { template: "recordatorio_partido", params: [r.firstName, c.clubName, rival, when, court, link] },
      push: { title: kind === "2h" ? "Tu partido es en 2 horas" : "Partido mañana", body: `vs ${rival}: ${when}, ${court}`, url: `/p/${c.token}`, tag: `reminder-${b.id}` },
    };
  });
}
