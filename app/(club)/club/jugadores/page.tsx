import type { Metadata } from "next";

import { getMyClub } from "@/lib/clubs/queries";
import { getProfile } from "@/lib/auth/dal";
import { listClubMembers } from "@/lib/players/queries";
import { expectedPhoneDigits } from "@/lib/players/phone";

import { AddPlayerForm } from "./add-player-form";
import { MemberActions } from "./member-actions";

export const metadata: Metadata = { title: "Jugadores · RaquetaClub" };

export default async function JugadoresPage() {
  const club = (await getMyClub())!;
  const me = await getProfile();
  const members = await listClubMembers(club.id);
  const digits = expectedPhoneDigits(club.phone_country_code);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Jugadores y administradores</h1>
        <p className="text-sm text-muted-foreground">
          {members.filter((m) => m.role === "player").length} jugadores y{" "}
          {members.filter((m) => m.role === "club_admin").length} administradores en {club.name}.
        </p>
      </div>

      <AddPlayerForm phoneHint={digits ? `${digits} dígitos` : undefined} />

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b border-border text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-medium">Nombre</th>
              <th className="px-4 py-2 font-medium">Contacto</th>
              <th className="px-4 py-2 font-medium">Estado</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {members.map((m) => (
              <tr key={m.id} className={m.status === "inactive" ? "text-muted-foreground" : undefined}>
                <td className="px-4 py-3">
                  <p className="font-medium">{`${m.firstName} ${m.lastName}`.trim() || "—"}</p>
                  {m.role === "club_admin" ? <p className="text-xs text-muted-foreground">Administrador</p> : null}
                </td>
                <td className="px-4 py-3">
                  <p className="break-all">{m.email ?? "—"}</p>
                  <p className="text-xs text-muted-foreground">{m.phone ?? "Sin teléfono"}</p>
                </td>
                <td className="px-4 py-3">
                  {m.status === "inactive" ? (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs">De baja</span>
                  ) : m.pending ? (
                    <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs text-amber-700 dark:text-amber-300">
                      No ha entrado
                    </span>
                  ) : (
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">Activo</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  {m.id !== me?.id ? (
                    <MemberActions id={m.id} role={m.role} status={m.status} pending={m.pending} />
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
