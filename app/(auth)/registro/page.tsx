import type { Metadata } from "next";

import { RegistroForm } from "./registro-form";

export const metadata: Metadata = { title: "Registra tu club · RaquetaClub" };

/** Alta de quien administra un club. Los jugadores se registran en /{slug}/registro. */
export default function RegistroPage() {
  return <RegistroForm />;
}
