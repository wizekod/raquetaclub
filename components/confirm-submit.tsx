"use client";

import { Button } from "@/components/ui/button";

/**
 * Botón de envío que pide confirmación. Sin JS el formulario se envía igual
 * (las acciones destructivas validan en el servidor).
 */
export function ConfirmSubmit({
  message,
  ...props
}: { message: string } & React.ComponentProps<typeof Button>) {
  return (
    <Button
      type="submit"
      {...props}
      onClick={(e) => {
        if (!confirm(message)) e.preventDefault();
      }}
    />
  );
}
