import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getPublicClub } from "@/lib/clubs/queries";
import { expectedPhoneDigits } from "@/lib/players/phone";
import { getPlanUsage, playersFull } from "@/lib/clubs/plan";

import { RegistroJugadorForm } from "./registro-jugador-form";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const club = await getPublicClub((await params).slug);
  return { title: club ? `Regístrate en ${club.name} · RaquetaClub` : "Club no encontrado" };
}

export default async function RegistroJugadorPage({ params }: Props) {
  const club = await getPublicClub((await params).slug);
  if (!club) notFound();

  if (playersFull(await getPlanUsage(club.id))) {
    return (
      <main className="flex flex-1 items-center justify-center p-6 text-center md:p-10">
        <div className="max-w-md space-y-2">
          <h1 className="text-xl font-semibold">{club.name} no tiene lugares disponibles</h1>
          <p className="text-sm text-muted-foreground">
            Por ahora el club no acepta jugadores nuevos. Avísale al club para que te dé de alta.
          </p>
        </div>
      </main>
    );
  }

  const digits = expectedPhoneDigits(club.phone_country_code);
  return (
    <main className="flex flex-1 items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-md">
        <RegistroJugadorForm
          slug={club.slug}
          clubName={club.name}
          phoneHint={digits ? `${digits} dígitos. Tus rivales lo usarán para acordar los partidos.` : undefined}
        />
      </div>
    </main>
  );
}
