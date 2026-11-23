import type { Metadata } from "next";

import { getMyClub } from "@/lib/clubs/queries";
import { clientEnv } from "@/lib/env";
import { QrCard } from "@/components/clubs/qr-card";

import { ConfiguracionForm } from "./configuracion-form";

export const metadata: Metadata = { title: "Configuración · RaquetaClub" };

export default async function ConfiguracionPage() {
  const club = (await getMyClub())!;
  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-xl font-semibold tracking-tight">Configuración</h1>
      <ConfiguracionForm club={club} hostBase={new URL(clientEnv.NEXT_PUBLIC_APP_URL).host} />
      <QrCard slug={club.slug} />
    </div>
  );
}
