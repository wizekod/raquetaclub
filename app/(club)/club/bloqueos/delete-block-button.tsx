"use client";

import { useTransition } from "react";
import { toast } from "sonner";

import { deleteBlock } from "@/lib/courts/actions";
import { Button } from "@/components/ui/button";

export function DeleteBlockButton({ id }: { id: string }) {
  const [busy, start] = useTransition();
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={busy}
      onClick={() =>
        start(async () => {
          const r = await deleteBlock(id);
          if (r.ok) toast.success("Bloqueo quitado.");
          else toast.error(r.error);
        })
      }
    >
      Quitar
    </Button>
  );
}
