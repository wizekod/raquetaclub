"use client";

import { useActionState } from "react";

import {
  adminSetResult,
  cancelBooking,
  confirmResult,
  disputeResult,
  proposeSlot,
  reportResult,
  respondToProposal,
  withdrawProposal,
} from "@/lib/matches/actions";
import type { FormState } from "@/lib/forms";
import { FormErrorBanner, useSuccessToast } from "@/components/forms";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";

type CourtSlots = { id: string; name: string; slots: { value: string; label: string }[] };

function Feedback({ state }: { state: FormState }) {
  useSuccessToast(state);
  return (
    <>
      <FormErrorBanner error={state.error} />
      {state.message ? <p className="rounded-md bg-primary/10 px-3 py-2 text-sm text-primary">{state.message}</p> : null}
    </>
  );
}

/** Un radio por horario libre; sin JS funciona igual. */
export function ProposeForm({ token, courts }: { token: string; courts: CourtSlots[] }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(proposeSlot, {});
  const any = courts.some((c) => c.slots.length);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <Feedback state={state} />
      {any ? (
        courts
          .filter((c) => c.slots.length)
          .map((c) => (
            <fieldset key={c.id} className="space-y-2">
              <legend className="text-sm font-medium">{c.name}</legend>
              <div className="flex flex-wrap gap-2">
                {c.slots.map((s) => (
                  <label
                    key={s.value}
                    className="cursor-pointer rounded-lg border border-border px-3 py-1.5 text-sm has-checked:border-primary has-checked:bg-primary/10"
                  >
                    <input type="radio" name="slot" value={s.value} className="sr-only" required />
                    {s.label}
                  </label>
                ))}
              </div>
            </fieldset>
          ))
      ) : (
        <p className="text-sm text-muted-foreground">No quedan horarios libres ese día. Prueba con otro.</p>
      )}
      {any ? (
        <Button type="submit" disabled={pending}>
          {pending ? "Enviando…" : "Proponer este horario"}
        </Button>
      ) : null}
    </form>
  );
}

export function RespondForm({ token, proposalId }: { token: string; proposalId: string }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(respondToProposal, {});
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="proposalId" value={proposalId} />
      <Button type="submit" name="accept" value="1" size="sm" disabled={pending}>
        Aceptar
      </Button>
      <Button type="submit" name="accept" value="0" size="sm" variant="ghost" disabled={pending}>
        Rechazar
      </Button>
      <div className="basis-full">
        <Feedback state={state} />
      </div>
    </form>
  );
}

export function WithdrawButton({ token, proposalId }: { token: string; proposalId: string }) {
  return (
    <form action={withdrawProposal}>
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="proposalId" value={proposalId} />
      <Button type="submit" size="sm" variant="ghost">
        Retirar
      </Button>
    </form>
  );
}

export function CancelBookingForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(cancelBooking, {});
  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="token" value={token} />
      <Feedback state={state} />
      <div className="flex flex-wrap gap-2">
        <Input name="reason" placeholder="Motivo (opcional)" maxLength={200} className="min-w-0 flex-1" />
        <Button
          type="submit"
          variant="destructive"
          disabled={pending}
          onClick={(e) => {
            if (!confirm("¿Cancelar la reserva? El partido vuelve a estar por agendar.")) e.preventDefault();
          }}
        >
          Cancelar reserva
        </Button>
      </div>
    </form>
  );
}

/** Tres filas de sets con dos columnas. `x`/`y` son los sufijos de los nombres. */
function SetInputs({ x, y, xLabel, yLabel }: { x: string; y: string; xLabel: string; yLabel: string }) {
  const cell = "h-9 w-14 text-center tabular-nums";
  return (
    <div className="grid grid-cols-[auto_auto_auto_auto] items-center gap-x-3 gap-y-2 text-sm">
      <span />
      {[1, 2, 3].map((n) => (
        <span key={n} className="text-center text-xs text-muted-foreground">
          {n === 3 ? "3.º / TB" : `Set ${n}`}
        </span>
      ))}
      {[
        [x, xLabel],
        [y, yLabel],
      ].map(([suffix, label]) => (
        <div key={suffix} className="contents">
          <span className="max-w-32 truncate">{label}</span>
          {[1, 2, 3].map((n) => (
            <Input key={n} name={`s${n}_${suffix}`} inputMode="numeric" maxLength={2} aria-label={`${label}, set ${n}`} className={cell} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function ReportResultForm({ token, rivalName }: { token: string; rivalName: string }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(reportResult, {});
  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="token" value={token} />
      <Feedback state={state} />
      <SetInputs x="me" y="rival" xLabel="Tú" yLabel={rivalName} />
      <p className="text-xs text-muted-foreground">El 3.er set es el tie-break a 10 (ej. 10-8). Déjalo vacío si fue 2-0.</p>
      <label className="flex items-center gap-2 text-sm">
        <input type="radio" name="result" value="played" defaultChecked className="size-4 accent-primary" /> Jugamos y gané
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="radio" name="result" value="default" className="size-4 accent-primary" /> Gané por default: {rivalName} no se presentó
      </label>
      <Button type="submit" disabled={pending}>
        {pending ? "Enviando…" : "Subir resultado"}
      </Button>
    </form>
  );
}

export function ConfirmResultForms({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(confirmResult, {});
  const [dState, disputeAction, disputing] = useActionState<FormState, FormData>(disputeResult, {});
  return (
    <div className="space-y-3">
      <form action={formAction}>
        <input type="hidden" name="token" value={token} />
        <Feedback state={state} />
        <Button type="submit" disabled={pending}>
          Confirmar resultado
        </Button>
      </form>
      <form action={disputeAction} className="space-y-2">
        <input type="hidden" name="token" value={token} />
        <Feedback state={dState} />
        <div className="flex flex-wrap gap-2">
          <Input name="reason" placeholder="¿Qué está mal? (ej. fue 6-4 4-6 10-8)" maxLength={500} className="min-w-0 flex-1" />
          <Button type="submit" variant="outline" disabled={disputing}>
            Disputar
          </Button>
        </div>
      </form>
    </div>
  );
}

export function AdminResultForm({ token, nameA, nameB }: { token: string; nameA: string; nameB: string }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(adminSetResult, {});
  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="token" value={token} />
      <Feedback state={state} />
      <SetInputs x="a" y="b" xLabel={nameA} yLabel={nameB} />
      <NativeSelect name="outcome" defaultValue="played" aria-label="Resultado" className="w-full">
        <option value="played">Jugado: el marcador decide al ganador</option>
        <option value="def_a">Gana {nameA} por default (W.O.)</option>
        <option value="def_b">Gana {nameB} por default (W.O.)</option>
        <option value="not_played">No jugado</option>
        <option value="reopen">Borrar resultado</option>
      </NativeSelect>
      <Button type="submit" variant="outline" disabled={pending}>
        {pending ? "Guardando…" : "Guardar como administrador"}
      </Button>
    </form>
  );
}
