import { Download } from "lucide-react";

import { qrSvg, signupUrl } from "@/lib/qr";
import { CopyButton } from "@/components/copy-button";
import { buttonVariants } from "@/components/ui/button";

/** QR del enlace de registro: para imprimir en la recepción o mandar por WhatsApp. */
export async function QrCard({ slug }: { slug: string }) {
  const url = signupUrl(slug);
  const svg = await qrSvg(url, 176);

  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
      <h2 className="font-semibold">Registro de jugadores</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Comparte el enlace o imprime el QR: quien lo abra se registra directo en tu club.
      </p>
      <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center">
        <div
          className="shrink-0 self-start rounded-xl border border-border bg-white p-2 [&>svg]:block"
          aria-label="Código QR del registro de jugadores"
          dangerouslySetInnerHTML={{ __html: svg }}
        />
        <div className="min-w-0 space-y-3">
          <div>
            <p className="break-all text-sm font-medium">{url}</p>
            <CopyButton value={url} label="Copiar enlace" className="mt-1" />
          </div>
          <div className="flex flex-wrap gap-2">
            {/* Endpoints de descarga, no páginas: con <Link> no se dispararía la descarga. */}
            <a href="/api/qr?format=png" download className={buttonVariants({ variant: "outline", size: "sm" })}>
              <Download className="size-4" />
              PNG
            </a>
            <a href="/api/qr?format=svg" download className={buttonVariants({ variant: "outline", size: "sm" })}>
              <Download className="size-4" />
              SVG
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
