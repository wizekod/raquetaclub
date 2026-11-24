import type { Metadata } from "next";
import { LayoutGrid, Tags, UserRound } from "lucide-react";

import { requireRole } from "@/lib/auth/dal";
import { pwaMetadata } from "@/lib/pwa/metadata";
import { ROLE_LABEL } from "@/lib/auth/roles";
import { fullName } from "@/lib/utils";
import { PanelShell, type NavItem } from "@/components/dashboard/panel-shell";

const NAV: NavItem[] = [
  { href: "/superadmin", label: "Clubes", icon: LayoutGrid },
  { href: "/superadmin/planes", label: "Planes", icon: Tags },
  { href: "/superadmin/cuenta", label: "Mi cuenta", icon: UserRound },
];

export const metadata: Metadata = pwaMetadata;

export default async function SuperadminLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireRole("superadmin");

  return (
    <PanelShell area="Plataforma" userName={fullName(profile)} roleLabel={ROLE_LABEL[profile.role]} nav={NAV}>
      {children}
    </PanelShell>
  );
}
