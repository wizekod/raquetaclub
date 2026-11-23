import { getProfile, requireUser } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";

import { AccountSettings } from "./account-settings";
import { PushCard } from "./push-card";

/** Sección "Mi cuenta" lista para cualquier panel: carga sus propios datos. */
export async function AccountSection() {
  const user = await requireUser();
  const profile = await getProfile();

  // El teléfono no está en la tabla para `authenticated`: va por la vista.
  const supabase = await createClient();
  const { data: contact } = await supabase
    .from("profile_contacts")
    .select("phone")
    .eq("id", user.id)
    .maybeSingle();

  const inClub = profile?.role === "club_admin" || profile?.role === "player";

  return (
    <section className="space-y-3">
      <h1 className="text-xl font-semibold tracking-tight">Mi cuenta</h1>
      <AccountSettings
        firstName={profile?.first_name ?? ""}
        lastName={profile?.last_name ?? ""}
        phone={contact?.phone ?? ""}
        phoneRequired={inClub}
        email={user.email ?? ""}
        pendingEmail={user.new_email ?? null}
      />
      {/* Avisos de partidos: sólo para quien está en un club. */}
      {inClub ? (
        <div className="pt-2">
          <PushCard />
        </div>
      ) : null}
    </section>
  );
}
