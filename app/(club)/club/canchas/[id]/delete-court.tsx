"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { deleteCourt } from "@/lib/courts/actions";
import { Button } from "@/components/ui/button";

export function DeleteCourt({ courtId }: { courtId: string }) {
  const [busy, start] = useTransition();
  const router = useRouter();

  return (
    <div className="flex items-center justify-between rounded-xl border border-destructive/30 p-4">
      <div>
        <p className="text-sm font-medium">Borrar cancha</p>
        <p className="text-xs text-muted-foreground">Sólo si nunca tuvo partidos agendados; si no, desactívala.</p>
      </div>
      <Button
        variant="destructive"
        size="sm"
        disabled={busy}
        onClick={() => {
          if (!confirm("¿Borrar la cancha? No se puede deshacer.")) return;
          start(async () => {
            const r = await deleteCourt(courtId);
            if (r.ok) {
              toast.success("Cancha borrada.");
              router.push("/club/canchas");
            } else toast.error(r.error);
          });
        }}
      >
        Borrar
      </Button>
    </div>
  );
}
