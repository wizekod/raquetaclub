# RaquetaClub — Plan maestro del SaaS

## Contexto

> Fuente de verdad del proyecto. Si cambia el alcance, actualizar este documento primero. Avance en §10.

RaquetaClub es un SaaS para clubes de raqueta (tenis y pádel) que cubre la administración del club (canchas y jugadores) y la gestión de torneos. El caso piloto es el **Torneo Escalera 2027** (`specs/BASES ESCALERA 2027.pdf`) de la Academia Match Point. Además habrá torneos **Round Robin** genéricos. Se reutiliza el stack y la arquitectura de reservaprimero (`/Users/josecarlosgarciacubillo/Developer/wizekod/reservaprimero`). El repo `raquetaclub` está vacío, solo tiene `specs/`.

Decisiones tomadas:
- **Una cuenta por club.** `profiles.club_id` es fijo, igual que el staff en reservaprimero. Consecuencia: Supabase Auth exige un email único global, así que una persona en dos clubes necesita dos emails.
- **MVP: canchas solo para partidos de torneo.** Las reservas libres quedan para la Fase 2.
- **Solo singles en el MVP.** Los dobles de pádel van en la Fase 2. Desde ahora se modela un `entry` (participante) para que migrar a parejas no rompa nada.
- **Repo nuevo copiando módulos** de reservaprimero, sin arrastrar su dominio (servicios, clínica, estaciones).

## 1. Stack (idéntico a reservaprimero)

Next.js 16 App Router + TypeScript, con `proxy.ts` en lugar de middleware · Supabase (Postgres + Auth + RLS + Storage + pg_cron/pg_net) · shadcn/ui (base-ui) + Tailwind 4 · Zod 4 · Stripe Subscriptions (club → Carlos) · Resend · WhatsApp Cloud API de Meta · Web Push (VAPID) + PWA · Turnstile + rate limit · Vercel + Cloudflare DNS · sonner, lucide.

**Módulos que se copian casi tal cual desde reservaprimero** (y se renombran `business` → `club`):
- `lib/supabase/{server,client,admin,middleware}.ts`, `proxy.ts`
- `lib/auth/{dal,roles,actions}.ts`, que trae `requireRole`, el login, el registro, recuperar contraseña y Mi cuenta
- `app/(auth)/*`, `app/auth/*` (definir clave)
- `lib/notifications/{email,whatsapp,push,dispatch}.ts`, más `notifications_log` y el patrón de idempotencia
- `lib/stripe/*`, `app/api/webhooks/stripe`, `subscription_plans`, la parte de suscripción del superadmin y el límite de plan (`plan-limit.ts`)
- `lib/security/*` (Turnstile, rate limit), `lib/storage` (logo del club, avatar del jugador), `lib/pwa`, `public/sw.js`, el manifest
- `lib/availability/tz.ts` (zona horaria del club)
- `app/(superadmin)/*` (negocios → clubes, planes, suspender/borrar)
- Las convenciones: RLS + **GRANTs explícitos en cada migración**, trigger `handle_new_user`, `protect_privileged_columns`, `EXCLUDE USING gist` contra el doble booking, pg_cron → `/api/cron/*` con `CRON_SECRET`
- La suite E2E en `qa/` (mismo enfoque de scripts contra Supabase real)

## 2. Roles

| Rol | Alcance | Puede |
|---|---|---|
| **Superadmin** (Carlos) | Global | Clubes (alta, suspender, borrar), planes y precios, métricas (MRR, clubes, jugadores, partidos), impersonar en modo lectura |
| **Admin de club** (N por club) | Su club | Configurar el club y las canchas, bloquear horarios, dar de alta jugadores, aceptar inscripciones a torneos, crear torneos (escalera / round robin), subir el reglamento, asignar los grupos iniciales, ver y corregir resultados, cambiar jugadores de grupo, ver rankings, invitar a otros admins |
| **Jugador** | Su club | Registrarse (nombre, apellidos, email, teléfono, contraseña), inscribirse a torneos, ver su grupo y sus partidos, proponer y confirmar horario, apartar cancha, subir resultado (si gana), confirmar o disputar el resultado (si pierde), ver rankings y reglamento |

En `profiles.role` los valores son `superadmin | club_admin | player`, con `club_id` nulo solo para el superadmin.

## 3. Multi-tenancy y rutas

Por path, igual que en reservaprimero: `raquetaclub.com/{slug}`. Hay una lista de slugs reservados.

- `/{slug}`: página pública del club (torneos activos, rankings públicos opcionales, botón "Únete").
- `/{slug}/registro`: registro de jugador ligado a ese club. El admin también puede crear jugadores desde el panel, con una invitación por email para definir la contraseña (el mismo flujo de invitación de staff de reservaprimero).
- `/club/*`: panel del admin.
- `/jugador/*`: panel del jugador (PWA instalable).
- `/superadmin/*`
- `/p/{token}`: link de partido para agendar y apartar cancha (requiere sesión del jugador del partido; el token solo hace el link compartible por WhatsApp).

## 4. Modelo de datos (migraciones Supabase)

Núcleo:
- **clubs**: id, slug, name, timezone, logo_path, brand_color, phone, address, sports (`tennis`/`padel`), status, plan_id, campos de Stripe, trial_ends_at
- **profiles**: id = auth.users.id, role, club_id, first_name, last_name, phone, phone_key (E.164), avatar_path, status (`active`/`inactive`)
- **courts**: id, club_id, name, sport, surface, active, sort_order
- **court_hours**: court_id, day_of_week, open_time, close_time (horario operativo semanal)
- **court_blocks**: id, club_id, court_id (nulo = todas), start_at, end_at, reason (evento privado del hotel, mantenimiento…), created_by
- **court_bookings**: id, club_id, court_id, match_id, start_at, end_at, status (`confirmed`/`cancelled`), booked_by, cancelled_reason. Tiene `EXCLUDE USING gist (court_id WITH =, tstzrange WITH &&) WHERE status='confirmed'` (error `23P01`), un trigger que rechaza el solape con `court_blocks` (error `RC409`) y un índice único que permite una sola reserva vigente por partido. La relación partido↔reserva vive solo aquí: `matches` no tiene `court_booking_id`.

Torneos:
- **tournaments**: id, club_id, name, type (`ladder`/`round_robin`), sport, format (`singles`), status (`draft`/`registration`/`active`/`finished`), starts_on, ends_on, rules_pdf_path, rules_text, `config jsonb` (ver §5), registration_open
- **tournament_entries**: id, tournament_id, player_id, status (`pending`/`accepted`/`rejected`/`withdrawn`/`expelled`), seed. Es el "participante"; en la Fase 2 tendrá un `partner_id` para dobles.
- **rounds**: id, tournament_id, number, name ("Febrero"), starts_on, ends_on, results_deadline (ej. el último día a las 14:00), status (`scheduled`/`active`/`closed`). En la escalera, 1 ronda = 1 mes = 1 jornada (9 jornadas de feb a oct).
- **groups**: id, round_id, level (1 = el más alto), name
- **group_members**: group_id, entry_id, round_id, tournament_id, position (siembra). `unique(round_id, entry_id)`: un entry juega en un solo grupo por ronda. El resultado final (posición, puntos, movimiento) vive en `standings_snapshots`.
- **matches**: id, club_id, tournament_id, round_id, group_id, entry_a, entry_b, status (`pending`/`scheduled`/`reported`/`disputed`/`confirmed`/`not_played`/`cancelled`), scheduled_at, booking_token, winner_entry_id, `score jsonb` (`{"sets": [[6,4],[3,6],[10,7]]}`), result_type (`played`/`default`/`not_played`; el W.O. es `confirmed` + `default`), reported_by/at, confirmed_by/at, dispute_reason, admin_override_by
- **match_slot_proposals**: match_id, proposed_by, start_at, court_id, status (`proposed`/`accepted`/`declined`/`expired`)
- **standings_snapshots**: (round_id, entry_id) → position, played, won, won_default, lost, lost_default, not_played, sets/games a favor y en contra, bonus, points, movement (`up`/`down`/`stay`/`out`). Es la tabla final congelada al cerrar la ronda (para movimientos, historial y premios).
- **notifications_log**: club_id, match_id, profile_id, channel (`email`/`whatsapp`/`push`), type, `dedupe_key` (único entre los envíos exitosos), status
- **push_subscriptions**, **subscription_plans** (`max_players`, `max_active_tournaments`): adaptados de reservaprimero

**Aislamiento entre clubes**: casi todas las tablas llevan `club_id`, y las FK hacia el padre son compuestas `(padre_id, club_id)`. Así la base rechaza un partido colgado del torneo de otro club, o un jugador inscrito en un club que no es el suyo. Las políticas RLS filtran por la columna local, sin joins.

**Contacto de jugadores**: `authenticated` no tiene GRANT sobre `profiles.email`, `phone` ni `phone_key`. Se leen por la vista `profile_contacts`. Uno mismo, el admin y el superadmin ven todo; un rival con partido en común ve solo el teléfono, para acordar horario. El DAL usa `PROFILE_COLUMNS` (`lib/auth/dal.ts`): nunca `select("*")` sobre `profiles`.

**Alta de usuarios** (`handle_new_user`):
- Invitación del servidor: `app_metadata.invited_role` + `club_id`. Es de confianza porque solo la escribe service_role.
- Autorregistro en `/{slug}/registro`: `user_metadata.club_id`. Siempre da el rol `player`.
- Registro sin club: `club_admin` sin club, que solo puede pasar por `/onboarding`.

Ojo con RLS: un jugador lee los torneos, grupos, partidos y standings de su club. Solo escribe propuestas y resultados en partidos donde él es `entry_a` o `entry_b`, y únicamente mediante RPCs `security definer` (`propose_slot`, `accept_slot`, `report_result`, `confirm_result`, `dispute_result`) que validan el estado de la máquina. Nunca con UPDATE directo.

## 5. Motor de torneos (`lib/tournaments/`, lógica pura y testeable)

**Config jsonb, con los valores por defecto de la escalera:**
```
group_size: 5, promote: 2, relegate: 2,
points: { win: 3, win_default: 2, loss_played: 1, loss_default: 0, not_played: 0 },
bonus: [{ week: 1, value: 0.25 }, { week: 2, value: 0.10 }], bonus_on_default_win: false,
match_format: { sets: 'best_of_3', no_ad: true, third_set: 'match_tiebreak_10' },
results_deadline: { day: 'last', time: '14:00' }, next_round_publish_day: 2,
no_show_minutes: 15, auto_expel_after_inactive_rounds: 2,
tiebreakers: ['points','head_to_head','sets_diff','games_diff','matches_played']
```
Todo se edita desde el formulario del torneo. El round robin usa el mismo motor, con `promote/relegate = 0` y una sola ronda (o fase de grupos más playoff en la Fase 2).

**Archivos:**
- `round-robin.ts`: genera los cruces de un grupo (método del círculo; 5 jugadores → 10 partidos, 4 por jugador).
- `scoring.ts`: valida el marcador (2-0/2-1, sets sin ventaja, TB a 10) y calcula los puntos del partido + el bonus por semana. El bonus depende de la fecha jugada (`scheduled_at`) respecto a `round.starts_on`, va para ambos jugadores, y no aplica al ganador por default.
- `standings.ts`: tabla del grupo con los desempates configurables.
- `ladder.ts`: al cerrar la ronda calcula ascensos y descensos (grupo 1 no asciende, el último grupo no desciende) y arma los grupos de la siguiente ronda. Resuelve también las bajas: inactivos 2 rondas → `expelled`, y el hueco se rellena subiendo al siguiente. Los nuevos inscritos entran al grupo más bajo. Si el número de jugadores no es múltiplo de 5, el último grupo queda de 4 o 6 (configurable).
- `awards.ts`: premios de fin de temporada. "Más consistente" = veces 1° del grupo 1; "Mejor ascenso" = suma de niveles subidos; "Más competitivo" = partidos jugados.

**Flujo de una ronda de escalera:**
1. El admin crea el torneo, sube el reglamento (PDF o texto), abre inscripciones y acepta jugadores.
2. Para la ronda 1, el admin asigna los grupos iniciales a mano, con drag & drop y una sugerencia por seed.
3. Publica la ronda: se generan los partidos y cada jugador recibe email, WhatsApp y push con su grupo y los links `/p/{token}`.
4. Un jugador propone fecha, hora y cancha; solo ve los slots libres (horario de cancha − bloqueos − reservas). El rival acepta y **solo entonces se crea la `court_booking`**. Así se cumple la regla "no se puede reservar si tu contrincante no ha confirmado". La reserva está restringida al partido: no hay amistosos.
5. Tras el partido, **el ganador sube el resultado** y el perdedor lo confirma. Si no confirma en 48 h se autoconfirma (configurable). Si hay disputa, la resuelve el admin (el árbitro general).
6. Un cron en la fecha límite (último día, 14:00) marca como `not_played` los partidos sin resultado confirmado, cierra la ronda, congela los standings, calcula los movimientos y genera el borrador de la siguiente ronda. El admin la revisa y ajusta, y la publica el día 2 (o se autopublica).
7. El admin puede en todo momento: corregir resultados, marcar DEF o W.O., mover jugadores de grupo, dar de baja (disciplina), y cancelar reservas en bloque cuando bloquea las canchas por un evento, con aviso a los afectados y el partido vuelto a `pending`.

Crons por pg_cron → `/api/cron/*`: recordatorios de partido (24 h / 2 h), recordatorio de "aún no agendas" a mitad de mes, autoconfirmación de resultados, cierre de ronda.

## 6. Fases de desarrollo

**Fase 0. Setup**
- Inicializar Next.js 16 + shadcn y copiar los módulos de §1.
- Crear `CLAUDE.md` de raquetaclub (con el formato del de reservaprimero) y `.env.example`.
- Proyecto Supabase, migraciones de §4 con RLS + GRANTs, y semilla de planes.

**Fase 1. MVP (piloto Escalera Match Point)**
1. Auth de 3 roles, registro de jugador por club, alta e invitación de jugadores por el admin, Mi cuenta.
2. Onboarding del club (slug), configuración, admins múltiples (invitación).
3. Canchas: CRUD, horario semanal, bloqueos, y vista de calendario de ocupación (se reutiliza la rejilla día/semana del calendario de reservaprimero).
4. Torneos: CRUD, reglamento, inscripciones y aceptación, asignación de grupos, motor de §5 con tests unitarios.
5. Link de partido: proponer/aceptar horario + reserva de cancha.
6. Resultados: reportar, confirmar, disputar, corregir (admin).
7. Rankings: tabla por grupo, escalera completa por nivel, historial de movimientos, perfil del jugador.
8. Notificaciones: email + WhatsApp (plantillas `partido_publicado`, `propuesta_horario`, `horario_confirmado`, `recordatorio_partido`, `resultado_pendiente`, `ronda_publicada`) + push.
9. Superadmin y Stripe (planes por número de jugadores activos o de torneos).
10. QA E2E y deploy.

**Fase 2**
- Dobles (pádel).
- Reservas libres de cancha.
- Round robin con playoffs / eliminación directa.
- Premios automáticos.
- Exportar PDF o imagen de los cuadros para compartir por WhatsApp.

**Fase 3:** ver recomendaciones.

## 7. Recomendaciones de features adicionales

**Alto valor / bajo esfuerzo:**
- **Imagen compartible de grupos y rankings** (OG image) para WhatsApp: es como hoy se comunican los clubes.
- **Ranking ELO / nivel por jugador** entre torneos, que sirve para sembrar grupos automáticamente.
- **Perfil público del jugador** con historial, H2H y racha.
- **Recordatorios inteligentes**: "te quedan 2 partidos y faltan 7 días".
- **Lista de espera para canchas** y liberación automática de reservas no confirmadas.

**Monetización para el club (y para ti):**
- **Cobro de inscripción a torneos y del atajador** ($70 por partido, como en las bases) vía Stripe Connect o MercadoPago, con comisión para la plataforma.
- **Reservas de cancha pagadas** y membresías o mensualidades del club.
- **Clases y academia**: coaches, grupos de clase, asistencia, paquetes de clases.

**Producto completo (tipo Playtomic para clubes chicos):**
- Partidos abiertos / matchmaking por nivel ("busco rival nivel 3.5").
- Eliminación directa con cuadro (draw) y cabezas de serie, y torneos de fin de semana con programación automática de canchas.
- Ligas por equipos / interclubes.
- Check-in con QR en cancha, que confirma que el partido se jugó (ya existe `lib/qr.ts`) y ayuda a detectar no-shows.
- Sanciones y disciplina con historial (el reglamento las contempla).
- App nativa iOS (tu perfil Swift) sobre la misma API, después de validar la PWA.
- Integración Google Calendar ("agregar partido a mi calendario").
- Estadísticas del club: ocupación de canchas, jugadores activos, retención.

## 8. Supuestos a validar

- "Cambiar de jugada" en las notas lo interpreto como **cambiar jugador de grupo o corregir un resultado** por el admin.
- Los desempates (`tiebreakers`) no vienen en las bases. Propongo: puntos → H2H → diferencia de sets → diferencia de games.
- El bonus por semana se otorga a **ambos** jugadores, excepto al ganador por default. Para el perdedor por default no aplica, porque suma 0 puntos.

## 9. Verificación

- `npm run db:check`: aplica las migraciones en PGlite (Postgres WASM, sin Docker) y corre ~50 comprobaciones de RLS, guardas y constraints (`supabase/tests/check-migrations.mjs`). Toda migración nueva añade ahí sus casos.

- Tests unitarios del motor (`lib/tournaments/*`): generación RR de 5 jugadores = 10 partidos; puntos y bonus de cada caso de las bases; ascensos y descensos en el grupo 1 y en el último; desempates; expulsión por 2 rondas sin jugar.
- Suite E2E en `qa/` (patrón de reservaprimero) contra Supabase real: registro de jugador → inscripción → aceptación → grupos → propuesta y aceptación de horario → reserva de cancha (y rechazo por solape o bloqueo) → resultado reportado y confirmado → cierre de ronda por cron → nueva ronda con movimientos correctos. Incluye pruebas de RLS: un jugador no puede reportar partidos ajenos ni leer otro club.
- `npm run typecheck && npm run lint && npm run build` en verde.
- Piloto real: simular una temporada de 3 meses con los datos de la Escalera Match Point antes de lanzarla.

## 10. Estado del roadmap

### Fase 0 — Setup
- [X] Next.js 16 + shadcn (base-ui) + Tailwind 4: configs, versiones y lockfile iguales a reservaprimero.
- [X] Módulos copiados y adaptados:
  - `lib/supabase/*` y `proxy.ts`, con matcher para `/club`, `/jugador`, `/superadmin`, `/onboarding` y `/p`.
  - `lib/auth/{dal,roles}.ts`, con `requireRole` que además bloquea perfiles inactivos.
  - `lib/security/*`, `lib/storage/media.ts` (logos, reglamentos y avatares por jugador), `lib/players/phone.ts`, `lib/clubs/{slug,constants}.ts`.
  - `lib/notifications/{email,whatsapp,push}.ts`, con las plantillas de WhatsApp del torneo.
  - `lib/stripe/client.ts`, `lib/pwa/*`, `lib/availability/tz.ts`, `components/ui/*`, `app/auth/{callback,confirm}`, PWA (`public/sw.js`, manifest) y `qa/lib.mjs`.
- [X] Migraciones §4 con RLS + GRANTs explícitos + storage + semilla de planes, validadas con `npm run db:check` (49/49).
- [X] `lib/supabase/database.types.ts`: escrito a mano con el formato de `supabase gen types`; se regenera al enlazar el proyecto.
- [X] `npm run typecheck`, `lint` y `build` en verde (el build requiere las variables de `.env.example`).
- [ ] Crear el proyecto Supabase, `supabase link` + `db push` y regenerar tipos (pasos en `supabase/README.md`). Acción de Carlos.
- [ ] Repo en GitHub + Vercel + variables de entorno. Acción de Carlos.

Quedan pendientes de copiar, cada uno junto con la feature que lo usa en la Fase 1 (dependen del dominio):
- pantallas de login, registro y recuperar contraseña, y Mi cuenta → paso 1;
- `lib/stripe/actions.ts`, el webhook y `plan-limit` → paso 9;
- el panel del superadmin → paso 9;
- `lib/notifications/dispatch.ts` y el cron con pg_cron → paso 8.

### Fase 1 — MVP
- [ ] 1. Auth de 3 roles + registro de jugador por club + invitaciones
- [ ] 2. Onboarding de club + configuración + admins múltiples
- [ ] 3. Canchas: CRUD, horario, bloqueos, calendario
- [ ] 4. Torneos + motor `lib/tournaments/*` con tests
- [ ] 5. Link de partido: propuesta/aceptación + reserva (RPCs)
- [ ] 6. Resultados: reportar / confirmar / disputar / corregir
- [ ] 7. Rankings
- [ ] 8. Notificaciones + cron
- [ ] 9. Superadmin + Stripe
- [ ] 10. QA E2E + deploy
