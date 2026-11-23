import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CalendarDays, CalendarOff, Home, LayoutGrid, Settings, Trophy, UserRound, Users } from "lucide-react";

import { requireRole } from "@/lib/auth/dal";
import { pwaMetadata } from "@/lib/pwa/metadata";
import { ROLE_LABEL } from "@/lib/auth/roles";
import { getMyClub } from "@/lib/clubs/queries";
import { fullName } from "@/lib/utils";
import { PanelShell, type NavItem } from "@/components/dashboard/panel-shell";
import { PushSync } from "@/components/account/push-sync";

// Rankings se suma en el paso 7.
const NAV: NavItem[] = [
  { href: "/club", label: "Inicio", icon: Home },
  { href: "/club/torneos", label: "Torneos", icon: Trophy },
  { href: "/club/calendario", label: "Calendario", icon: CalendarDays },
  { href: "/club/jugadores", label: "Jugadores", icon: Users },
  { href: "/club/canchas", label: "Canchas", icon: LayoutGrid },
  { href: "/club/bloqueos", label: "Bloquear horarios", icon: CalendarOff },
  { href: "/club/configuracion", label: "Configuración", icon: Settings },
  { href: "/club/cuenta", label: "Mi cuenta", icon: UserRound },
];

export const metadata: Metadata = pwaMetadata;

export default async function ClubLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireRole("club_admin");
  const club = await getMyClub();
  if (!club) redirect("/onboarding");

  return (
    <PanelShell
      area={club.name}
      userName={fullName(profile)}
      roleLabel={ROLE_LABEL[profile.role]}
      nav={NAV}
      publicPath={`/${club.slug}`}
    >
      <PushSync />
      {children}
    </PanelShell>
  );
}
