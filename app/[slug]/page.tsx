import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Trophy } from "lucide-react";

import { getPublicClub } from "@/lib/clubs/queries";
import { createAdminClient } from "@/lib/supabase/admin";
import { mediaUrl } from "@/lib/storage/media";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const club = await getPublicClub((await params).slug);
  return { title: club ? `${club.name} · RaquetaClub` : "Club no encontrado" };
}

const TYPE_LABEL = { ladder: "Escalera", round_robin: "Round robin" } as const;
const STATUS_LABEL = { registration: "Inscripciones abiertas", active: "En curso", finished: "Finalizado", draft: "" } as const;

/** Página pública del club: presentación, torneos y alta de jugadores. */
export default async function ClubPublicPage({ params }: Props) {
  const club = await getPublicClub((await params).slug);
  if (!club) notFound();

  // Sólo columnas públicas y torneos publicados (mismo criterio que la RLS de anon).
  const { data: tournaments } = await createAdminClient()
    .from("tournaments")
    .select("id, name, type, status, starts_on, ends_on")
    .eq("club_id", club.id)
    .neq("status", "draft")
    .order("starts_on", { ascending: false });

  const logo = mediaUrl(club.logo_path);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-4 py-10">
      <header className="flex items-center gap-4">
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logo} alt="" className="size-16 rounded-xl object-cover" />
        ) : (
          <span className="flex size-16 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Trophy className="size-7" />
          </span>
        )}
        <div className="min-w-0">
          <h1 className="font-heading text-2xl font-semibold tracking-tight">{club.name}</h1>
          {club.address ? <p className="text-sm text-muted-foreground">{club.address}</p> : null}
        </div>
      </header>

      <div className="flex flex-wrap gap-3">
        <Link href={`/${club.slug}/registro`} className={cn(buttonVariants())}>
          Registrarme como jugador
        </Link>
        <Link href="/login" className={cn(buttonVariants({ variant: "outline" }))}>
          Ya tengo cuenta
        </Link>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">Torneos</h2>
        {tournaments?.length ? (
          <ul className="divide-y divide-border rounded-xl border border-border bg-card">
            {tournaments.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">{t.name}</p>
                  <p className="text-xs text-muted-foreground">{TYPE_LABEL[t.type]}</p>
                </div>
                <span className="shrink-0 rounded-full bg-accent px-2 py-0.5 text-xs text-accent-foreground">
                  {STATUS_LABEL[t.status]}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Este club aún no ha publicado torneos.</p>
        )}
      </section>
    </main>
  );
}
