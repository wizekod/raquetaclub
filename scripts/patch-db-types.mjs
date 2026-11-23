/**
 * `supabase gen types` no sabe qué argumentos de una RPC aceptan null (ni
 * qué RPC puede devolver null). Este paso, que corre `npm run db:types`
 * después de generar, los marca. Si una firma cambia y el parche ya no
 * aplica, falla en voz alta en vez de dejar tipos incorrectos.
 */
import fs from "node:fs";

const FILE = "lib/supabase/database.types.ts";
// [función, argumento o "Returns", tipo base]
const NULLABLE = [
  ["create_court_block", "p_court", "string"],
  ["create_court_block", "p_reason", "string"],
  ["cancel_match_booking", "p_reason", "string"],
  ["report_result", "p_score", "Json"],
  ["close_round", "p_next", "Json"],
  ["close_round", "Returns", "string"],
];

let src = fs.readFileSync(FILE, "utf8");
for (const [fn, arg, type] of NULLABLE) {
  // Bloque de la función: desde `fn: {` hasta su `Returns`.
  const start = src.search(new RegExp(`\\n {6}${fn}: \\{`));
  if (start < 0) throw new Error(`patch-db-types: no encontré la función ${fn}`);
  const end = src.indexOf("\n      }", start + 1);
  const block = src.slice(start, end);
  const re = arg === "Returns" ? new RegExp(`Returns: ${type}(?! \\| null)`) : new RegExp(`\\b${arg}: ${type}(?! \\| null)`);
  if (!re.test(block)) {
    if (block.includes(arg === "Returns" ? `Returns: ${type} | null` : `${arg}: ${type} | null`)) continue;
    throw new Error(`patch-db-types: no encontré ${fn}.${arg}: ${type}`);
  }
  src = src.slice(0, start) + block.replace(re, (m) => `${m} | null`) + src.slice(end);
}
// Línea en blanco antes del bloque de alias.
src = src.replace("} as const\n// ── Alias", "} as const\n\n// ── Alias");
fs.writeFileSync(FILE, src);
console.log("patch-db-types: ok");
