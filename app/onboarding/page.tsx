import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { requireRole } from "@/lib/auth/dal";
import { clientEnv } from "@/lib/env";

import { OnboardingForm } from "./onboarding-form";

export const metadata: Metadata = { title: "Crea tu club · RaquetaClub" };

export default async function OnboardingPage() {
  const profile = await requireRole("club_admin");
  if (profile.club_id) redirect("/club");

  return <OnboardingForm hostBase={new URL(clientEnv.NEXT_PUBLIC_APP_URL).host} />;
}
