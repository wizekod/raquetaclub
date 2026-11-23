import { cn } from "@/lib/utils";

/** `<select>` nativo con el estilo de los inputs: funciona sin JS y en móvil abre el selector del sistema. */
export function NativeSelect({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      className={cn("h-10 rounded-lg border border-input bg-transparent px-3 text-sm disabled:opacity-50", className)}
      {...props}
    />
  );
}
