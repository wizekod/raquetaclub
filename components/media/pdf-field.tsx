"use client";

import { useRef, useState } from "react";
import { FileText } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { MEDIA_BUCKET, PDF_MAX_BYTES, mediaPath, mediaUrl } from "@/lib/storage/media";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

/**
 * Sube un PDF (reglamento) directo a Storage, igual que `ImageField`: la
 * política del bucket es el control real y la acción de servidor valida la
 * ruta que llega en el input oculto antes de guardarla.
 */
export function PdfField({
  name,
  clubId,
  defaultPath,
  label,
  onBusyChange,
}: {
  name: string;
  clubId: string;
  defaultPath?: string | null;
  label: string;
  onBusyChange?: (busy: boolean) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [path, setPath] = useState<string | null>(defaultPath ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    if (file.type !== "application/pdf") return setError("Sube un archivo PDF.");
    if (file.size > PDF_MAX_BYTES) return setError("El PDF pesa más de 10 MB.");

    setBusy(true);
    onBusyChange?.(true);
    try {
      const target = mediaPath(clubId, "rules", "pdf");
      const { error: upErr } = await createClient()
        .storage.from(MEDIA_BUCKET)
        .upload(target, file, { contentType: "application/pdf", cacheControl: "31536000" });
      if (upErr) setError("No se pudo subir el PDF.");
      else setPath(target);
    } finally {
      setBusy(false);
      onBusyChange?.(false);
    }
  }

  const url = mediaUrl(path);
  return (
    <div className="grid gap-2">
      <Label>{label}</Label>
      <input type="hidden" name={name} value={path ?? ""} />
      <input ref={inputRef} type="file" accept="application/pdf" className="sr-only" onChange={handleChange} />
      <div className="flex flex-wrap items-center gap-2">
        {url ? (
          <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm font-medium underline underline-offset-4">
            <FileText className="size-4" /> Ver PDF
          </a>
        ) : (
          <span className="text-sm text-muted-foreground">Sin PDF</span>
        )}
        <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => inputRef.current?.click()}>
          {busy ? "Subiendo…" : url ? "Cambiar PDF" : "Subir PDF"}
        </Button>
        {path ? (
          <Button type="button" variant="ghost" size="sm" onClick={() => setPath(null)}>
            Quitar
          </Button>
        ) : null}
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
