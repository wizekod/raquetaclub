"use client";

import { useTransition } from "react";
import { toast } from "sonner";

import { resendInvite, setMemberStatus } from "@/lib/players/actions";
import { Button } from "@/components/ui/button";

export function MemberActions({
  id,
  status,
  pending,
}: {
  id: string;
  status: "active" | "inactive";
  pending: boolean;
}) {
  const [busy, start] = useTransition();

  const run = (fn: () => Promise<{ ok: true } | { ok: false; error: string }>, ok: string) =>
    start(async () => {
      const r = await fn();
      if (r.ok) toast.success(ok);
      else toast.error(r.error);
    });

  return (
    <div className="flex justify-end gap-1">
      {pending && status === "active" ? (
        <Button variant="ghost" size="sm" disabled={busy} onClick={() => run(() => resendInvite(id), "Invitación reenviada.")}>
          Reenviar invitación
        </Button>
      ) : null}
      {status === "active" ? (
        <Button
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={() => {
            if (confirm("¿Dar de baja? No podrá entrar hasta que lo reactives.")) {
              run(() => setMemberStatus(id, "inactive"), "Dado de baja.");
            }
          }}
        >
          Dar de baja
        </Button>
      ) : (
        <Button variant="ghost" size="sm" disabled={busy} onClick={() => run(() => setMemberStatus(id, "active"), "Reactivado.")}>
          Reactivar
        </Button>
      )}
    </div>
  );
}
