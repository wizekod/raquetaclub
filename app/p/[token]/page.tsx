import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarCheck, ChevronLeft, MessageCircle } from "lucide-react";

import { requireProfile } from "@/lib/auth/dal";
import { roleHome } from "@/lib/auth/roles";
import { eachDate, todayInTz, zonedDateAndMinutes } from "@/lib/availability/tz";
import { freeSlotsForDay } from "@/lib/courts/queries";
import { clientEnv } from "@/lib/env";
import { formatDateTime, formatLongDate, formatTime } from "@/lib/format/dates";
import { getMatchByToken } from "@/lib/matches/queries";
import { MATCH_STATUS_LABEL } from "@/lib/tournaments/labels";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { NativeSelect } from "@/components/ui/native-select";

import { CancelBookingForm, ProposeForm, RespondForm, WithdrawButton } from "./match-forms";

export const metadata: Metadata = { title: "Partido · RaquetaClub" };

type Props = { params: Promise<{ token: string }>; searchParams: Promise<{ fecha?: string }> };

/**
 * Link de partido: lo comparten los dos jugadores (WhatsApp, correo). Pide
 * sesión (proxy); sólo los dos jugadores proponen/aceptan y el admin del
 * club puede ver y cancelar la reserva.
 */
export default async function MatchPage({ params, searchParams }: Props) {
  const { token } = await params;
  const { fecha } = await searchParams;
  const profile = await requireProfile(`/p/${token}`);
  const view = profile.status === "active" ? await getMatchByToken(token, profile) : null;
  if (!view || (!view.me && !view.isAdmin)) notFound();

  const { match, round, tournament, timeZone: tz, me, rival } = view;
  const roundOpen = round.status === "active";
  const canPropose = !!me && roundOpen && match.status === "pending";

  // Días elegibles: de hoy (o el inicio de la ronda) al último día de la ronda.
  const today = todayInTz(tz);
  const deadlineDay = zonedDateAndMinutes(round.results_deadline, tz).date;
  const first = round.starts_on > today ? round.starts_on : today;
  const last = round.ends_on < deadlineDay ? round.ends_on : deadlineDay;
  const days = first <= last ? eachDate(first, last) : [];
  const day = fecha && days.includes(fecha) ? fecha : days[0];
  const courts = canPropose && day ? await freeSlotsForDay(match.club_id, tournament.sport, day, tz, tournament.config.match_minutes) : [];

  const link = `${clientEnv.NEXT_PUBLIC_APP_URL}/p/${token}`;
  const waText = encodeURIComponent(`Hola, va nuestro partido de ${tournament.name}. Propón o acepta horario aquí: ${link}`);
  const whatsapp = rival?.phoneKey ? `https://wa.me/${rival.phoneKey.replace(/\D/g, "")}?text=${waText}` : null;

  return (
    <main className="mx-auto max-w-2xl space-y-6 px-4 py-8">
      <Link href={roleHome(profile.role)} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-4" /> Mi panel
      </Link>

      <div>
        <p className="text-sm text-muted-foreground">
          {tournament.name} · {round.name}
          {view.groupName ? ` · ${view.groupName}` : ""}
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">
          {view.a.name} <span className="text-muted-foreground">vs</span> {view.b.name}
        </h1>
        <p className="mt-1 text-sm">
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{MATCH_STATUS_LABEL[match.status]}</span>
          <span className="ml-2 text-muted-foreground">Jugar a más tardar el {formatDateTime(round.results_deadline, tz)}</span>
        </p>
      </div>

      {view.booking ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarCheck className="size-5 text-primary" /> Cancha apartada
            </CardTitle>
            <CardDescription>
              {formatDateTime(view.booking.start_at, tz)} a {formatTime(view.booking.end_at, tz)} · {view.booking.courtName}
            </CardDescription>
          </CardHeader>
          {(me && view.booking.upcoming) || view.isAdmin ? (
            <CardContent>
              <CancelBookingForm token={token} />
            </CardContent>
          ) : null}
        </Card>
      ) : null}

      {rival ? (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">Ponte de acuerdo con {rival.name}:</span>
          {whatsapp ? (
            <a href={whatsapp} target="_blank" rel="noreferrer" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
              <MessageCircle className="size-4" /> WhatsApp
            </a>
          ) : (
            <span className="text-muted-foreground">sin teléfono registrado</span>
          )}
        </div>
      ) : null}

      {view.proposals.length ? (
        <Card>
          <CardHeader>
            <CardTitle>Propuestas</CardTitle>
            <CardDescription>La cancha se aparta sólo cuando el rival acepta.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border rounded-lg border border-border">
              {view.proposals.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                  <div className="min-w-0 flex-1 text-sm">
                    <p className="font-medium">
                      {formatDateTime(p.start_at, tz)} · {p.courtName}
                    </p>
                    <p className="text-xs text-muted-foreground">{p.mine ? "Esperando a tu rival" : `Propuesta de ${rival?.name ?? "un jugador"}`}</p>
                  </div>
                  {me && !p.mine ? <RespondForm token={token} proposalId={p.id} /> : null}
                  {p.mine ? <WithdrawButton token={token} proposalId={p.id} /> : null}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {canPropose ? (
        <Card>
          <CardHeader>
            <CardTitle>Proponer horario</CardTitle>
            <CardDescription>
              Partidos de {tournament.config.match_minutes} min. Sólo ves horarios libres; puedes mandar hasta 3 propuestas.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {days.length ? (
              <form className="flex flex-wrap gap-2">
                <NativeSelect name="fecha" defaultValue={day} aria-label="Día" className="min-w-0 flex-1">
                  {days.map((d) => (
                    <option key={d} value={d}>
                      {formatLongDate(d)}
                    </option>
                  ))}
                </NativeSelect>
                <button type="submit" className={cn(buttonVariants({ variant: "outline" }))}>
                  Ver horarios
                </button>
              </form>
            ) : (
              <p className="text-sm text-muted-foreground">Ya no quedan días en esta ronda.</p>
            )}
            {day ? (
              <ProposeForm
                token={token}
                courts={courts.map((c) => ({
                  id: c.id,
                  name: c.name,
                  slots: c.slots.map((s) => ({ value: `${c.id}|${new Date(s.start).toISOString()}`, label: formatTime(s.start, tz) })),
                }))}
              />
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {!me && view.isAdmin ? (
        <p className="text-sm text-muted-foreground">Vista de administrador: los jugadores proponen y aceptan el horario desde este link.</p>
      ) : null}
    </main>
  );
}
