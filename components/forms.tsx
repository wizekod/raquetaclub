"use client";

import { useEffect } from "react";
import { toast } from "sonner";

import type { FormState } from "@/lib/forms";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function FieldError({ messages }: { messages?: string[] }) {
  if (!messages?.length) return null;
  return <p className="text-sm text-destructive">{messages[0]}</p>;
}

export function FormErrorBanner({ error }: { error?: string }) {
  if (!error) return null;
  return (
    <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
  );
}

/** Toast con el mensaje de éxito de cada envío (cada respuesta es un objeto nuevo). */
export function useSuccessToast(state: FormState) {
  useEffect(() => {
    if (state.message) toast.success(state.message);
  }, [state]);
}

/** Campo de texto con etiqueta y error, para no repetir el bloque en cada formulario. */
export function TextField({
  id,
  name,
  label,
  errors,
  hint,
  ...input
}: {
  id: string;
  name: string;
  label: string;
  errors?: string[];
  hint?: string;
} & Omit<React.ComponentProps<typeof Input>, "id" | "name">) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} name={name} {...input} />
      {hint && !errors?.length ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      <FieldError messages={errors} />
    </div>
  );
}
