import type { Metadata } from "next";
import { Home, Trophy, UserRound } from "lucide-react";

import { requireRole } from "@/lib/auth/dal";
import { pwaMetadata } from "@/lib/pwa/metadata";
import { ROLE_LABEL } from "@/lib/auth/roles";
import { getMyClub } from "@/lib/clubs/queries";
import { fullName } from "@/lib/utils";
import { PanelShell, type NavItem } from "@/components/dashboard/panel-shell";
import { PushSync } from "@/components/account/push-sync";

// Mis partidos y Rankings se suman en los pasos 5-7.
const NAV: NavItem[] = [
  { href: "/jugador", label: "Inicio", icon: Home },
  { href: "/jugador/torneos", label: "Torneos", icon: Trophy },
  { href: "/jugador/cuenta", label: "Mi cuenta", icon: UserRound },
];

export const metadata: Metadata = pwaMetadata;

export default async function JugadorLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireRole("player");
  const club = await getMyClub();

  return (
    <PanelShell
      area={club?.name ?? "Sin club"}
      userName={fullName(profile)}
      roleLabel={ROLE_LABEL[profile.role]}
      nav={NAV}
      publicPath={club ? `/${club.slug}` : null}
    >
      <PushSync />
      {children}
    </PanelShell>
  );
}
