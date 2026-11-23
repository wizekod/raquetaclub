import Link from "next/link";
import { Trophy } from "lucide-react";

/**
 * Landing provisional (Fase 0). La landing de marketing, precios y alta de
 * club llegan en la Fase 1.
 */
export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-6 text-center">
      <span className="flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
        <Trophy className="size-6" />
      </span>
      <div className="space-y-2">
        <h1 className="font-heading text-3xl font-semibold tracking-tight">RaquetaClub</h1>
        <p className="max-w-md text-muted-foreground">
          Canchas, jugadores y torneos de tu club de tenis y pádel en un solo lugar.
        </p>
      </div>
      <Link href="/login" className="text-sm font-medium underline underline-offset-4">
        Iniciar sesión
      </Link>
    </main>
  );
}
