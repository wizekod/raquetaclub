"use client";

import { useActionState } from "react";

import { cancelBooking, proposeSlot, respondToProposal, withdrawProposal } from "@/lib/matches/actions";
import type { FormState } from "@/lib/forms";
import { FormErrorBanner, useSuccessToast } from "@/components/forms";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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
