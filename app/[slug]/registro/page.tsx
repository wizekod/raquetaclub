import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getPublicClub } from "@/lib/clubs/queries";
import { expectedPhoneDigits } from "@/lib/players/phone";

import { RegistroJugadorForm } from "./registro-jugador-form";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const club = await getPublicClub((await params).slug);
  return { title: club ? `Regístrate en ${club.name} · RaquetaClub` : "Club no encontrado" };
}

export default async function RegistroJugadorPage({ params }: Props) {
  const club = await getPublicClub((await params).slug);
  if (!club) notFound();

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
