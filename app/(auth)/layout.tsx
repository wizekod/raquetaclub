import type { Metadata } from "next";
import Link from "next/link";
import { Trophy } from "lucide-react";

import { pwaMetadata } from "@/lib/pwa/metadata";

// Quien agrega la web app desde el login también la instala.
export const metadata: Metadata = pwaMetadata;

function Brand({ className }: { className?: string }) {
  return (
    <Link href="/" className={`flex items-center gap-2 font-semibold tracking-tight ${className ?? ""}`}>
      <span className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <Trophy className="size-4" />
      </span>
      RaquetaClub
    </Link>
  );
}

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-svh lg:grid-cols-2">
      <div className="relative hidden flex-col justify-between border-r border-border bg-muted/40 p-10 lg:flex">
        <Brand />
        <div>
          <p className="max-w-sm text-2xl font-semibold leading-snug tracking-tight">
            Tu club, tus torneos y tus partidos en un solo lugar.
          </p>
          <p className="mt-3 max-w-sm text-sm text-muted-foreground">
            Escaleras, round robin, canchas y resultados sin hojas de cálculo ni grupos de WhatsApp.
          </p>
        </div>
        <p className="text-xs text-muted-foreground">© {new Date().getFullYear()} RaquetaClub</p>
      </div>

      <div className="flex flex-col items-center justify-center gap-6 p-6 md:p-10">
        <Brand className="lg:hidden" />
        <div className="w-full max-w-md">{children}</div>
      </div>
    </div>
  );
}
