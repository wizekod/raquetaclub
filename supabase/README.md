# Base de datos — Supabase

Migraciones SQL versionadas en `supabase/migrations/`:

| Archivo | Contenido |
|---|---|
| `20261123120000_initial_schema.sql` | Enums, 17 tablas de CLAUDE.md §4, `phone_key()`, FK compuestas `(id, club_id)` para aislar clubes, `EXCLUDE USING gist` anti-solape en `court_bookings` y trigger contra bloqueos (`RC409`) |
| `20261123120100_rls_and_grants.sql` | Helpers de rol/club (`SECURITY DEFINER`), `handle_new_user` (invitación / autorregistro / dueño), guardas de columnas, GRANTs explícitos por tabla y columna, vista `profile_contacts`, RLS en todas las tablas |
| `20261123120200_media_storage.sql` | Bucket público `media` (logos, avatares, reglamentos PDF) + políticas por carpeta de club |
| `20261123120300_seed_subscription_plans.sql` | Planes `Free` (20 jugadores, 1 torneo) y `Pro` (ilimitado). Precios placeholder |

## Validar en local (sin Docker)

```bash
npm run db:check
```

Aplica todas las migraciones en PGlite (Postgres en WASM) con stubs de `auth` y
`storage`, y corre ~50 comprobaciones de RLS, guardas y constraints. Correrlo
con cada migración nueva y añadir ahí sus casos.

## Aplicar al proyecto hosted

1. Crea el proyecto en <https://supabase.com/dashboard> (región cercana a los clubes).
2. Desde la raíz del repo:

   ```bash
   npx supabase login
   npx supabase link --project-ref <REFERENCE_ID>
   npx supabase db push --remote     # sin --remote apunta al stack local (Docker)
   npm run db:types                  # regenera tipos y conserva los alias de la app
   ```

3. Copia a `.env.local` (Project Settings → API): `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.

4. Para darte de alta como superadmin, regístrate y luego en el SQL Editor:

   ```sql
   update public.profiles set role = 'superadmin', club_id = null
   where email = '<tu correo>';
   ```

## Convenciones

- Toda tabla nueva en `public` lleva sus `GRANT` explícitos (service_role y,
  si aplica, authenticated/anon) y su RLS en la misma migración.
- Las guardas que llaman a `is_server_role()` deben ser `SECURITY INVOKER`:
  dentro de una `SECURITY DEFINER`, `current_user` es el dueño y la guarda
  quedaría abierta.
- Los jugadores no escriben `matches`, `match_slot_proposals` ni
  `court_bookings` directamente: van por RPCs que validan la máquina de estados.
