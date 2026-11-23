"use client";

import { useTransition } from "react";
import { toast } from "sonner";

import { resendInvite, setMemberRole, setMemberStatus } from "@/lib/players/actions";
import { Button } from "@/components/ui/button";

export function MemberActions({
  id,
  role,
  status,
  pending,
}: {
  id: string;
  role: "superadmin" | "club_admin" | "player";
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
      {status === "active" && role === "player" ? (
        <Button
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={() => {
            if (confirm("¿Hacerlo administrador? Podrá gestionar todo el club.")) {
              run(() => setMemberRole(id, "club_admin"), "Ahora es administrador.");
            }
          }}
        >
          Hacer admin
        </Button>
      ) : null}
      {status === "active" && role === "club_admin" ? (
        <Button variant="ghost" size="sm" disabled={busy} onClick={() => run(() => setMemberRole(id, "player"), "Ahora es jugador.")}>
          Quitar admin
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
