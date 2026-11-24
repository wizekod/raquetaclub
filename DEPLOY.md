# Despliegue y configuración de servicios

Pasos de configuración que viven fuera del código. Marcar con ✅ al completarlos.

## 1. Supabase

### Migraciones
```bash
npx supabase db push --remote   # sin --remote apunta al stack local (Docker)
npm run db:types                # regenera lib/supabase/database.types.ts
```

### Authentication → URL Configuration
- **Site URL**: la URL pública (hoy la de Vercel; luego `https://raquetaclub.com`).
- **Redirect URLs**: `http://localhost:3000/**`, la de Vercel con `/**`, y el dominio final con `/**`.

### Authentication → Email Templates
El enlace por defecto (`{{ .ConfirmationURL }}`) usa PKCE y sólo funciona si
el correo se abre en el mismo navegador donde se pidió. Las invitaciones las
abre el jugador en su teléfono, así que todas pasan por `/auth/confirm` con
`token_hash`:

| Plantilla | Enlace |
|---|---|
| *Invite user* | `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite&next=/auth/definir-clave` |
| *Confirm signup* | `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/jugador` |
| *Reset password* | `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/auth/definir-clave` |
| *Change email address* | `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email_change&next=/jugador` |

`/jugador` sirve de entrada única: `requireRole` manda a cada rol a su panel
(y a un dueño sin club a `/onboarding`).

Textos sugeridos (en español):
- *Invite user* — Asunto: "Te invitaron a tu club en RaquetaClub". Cuerpo: "Tu club te dio de alta en RaquetaClub. Entra aquí para crear tu contraseña: <a href="…">Crear contraseña</a>".
- *Confirm signup* — Asunto: "Confirma tu cuenta de RaquetaClub".
- *Reset password* — Asunto: "Crea una contraseña nueva".

### SMTP propio (antes del piloto)
El SMTP de prueba de Supabase sólo manda unos pocos correos por hora
(`over_email_send_rate_limit`): no alcanza para dar de alta a un club. Con el
dominio verificado en Resend: *Project Settings → Authentication → SMTP
Settings* → host `smtp.resend.com`, puerto `465`, usuario `resend`, contraseña
= `RESEND_API_KEY`, remitente `avisos@raquetaclub.com`. Mientras tanto, para
altas masivas usa "Contraseña temporal" en Club → Jugadores.

### Superadmin
Regístrate en `/registro` y luego, en el SQL Editor:
```sql
update public.profiles set role = 'superadmin', club_id = null
where email = '<tu correo>';
```

## 2. Vercel
Variables de entorno: las de `.env.example`. Mínimo para arrancar:
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_APP_URL`.

## 3. Avisos y cron (paso 8)

### Variables en Vercel
Copiar de `.env.local` a Vercel (Production) y redeploy:
- `RESEND_API_KEY`, `RESEND_FROM_EMAIL`: correos.
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`: push.
  Las llaves deben ser las mismas en todos los entornos: si cambian, los
  dispositivos ya suscritos dejan de recibir.
- `CRON_SECRET`: lo exige `/api/cron/tick`.

### Cron (pg_cron → /api/cron/tick, cada 30 min)
La migración `…_cron_tick.sql` agenda el job. Le faltan la URL y el secreto,
que viven en Supabase Vault. En Supabase → SQL Editor, una vez:
```sql
select vault.create_secret('https://www.raquetaclub.com', 'app_url');
select vault.create_secret('<el CRON_SECRET de Vercel>', 'cron_secret');
```
Comprobar: `select * from cron.job_run_details order by start_time desc limit 5;`
y la respuesta en `select status_code, content from net._http_response order by created desc limit 5;`.

El tick, en orden:
1. Autoconfirma los resultados sin respuesta tras `auto_confirm_hours` (48 h).
2. Cierra las rondas con la fecha límite vencida y avisa a los admins. Si
   hay disputas, no cierra y avisa una vez al día.
3. Manda recordatorios 24 h y 2 h antes de cada partido agendado.

## 4. Turnstile (anti-bots en los registros)
Protege `/registro` (dueño de club) y `/{slug}/registro` (jugador). El login
ya tiene su propio límite de intentos por IP. Sin llaves el widget no aparece
y la verificación se omite.

1. Cloudflare → *Turnstile* → *Add widget*: nombre "RaquetaClub", dominios
   `raquetaclub.com` y `www.raquetaclub.com` (más el `*.vercel.app` si usas
   las previews), modo *Managed*.
2. En Vercel (Production): `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (Site Key) y
   `TURNSTILE_SECRET_KEY` (Secret Key). Redeploy: la Site Key se incrusta en
   el build.
3. **No** las pongas en `.env.local`: la suite `qa/` envía los formularios sin
   navegador y fallaría el registro.
4. Comprobar: abre `/{slug}/registro` en el celular; debe salir la casilla de
   Cloudflare y el registro debe completarse.

## 5. Lista de lanzamiento
- [ ] Migraciones aplicadas (`npx supabase migration list --remote`: local = remoto).
- [ ] Vercel (Production) con todas las variables de `.env.example`, salvo
      Stripe y WhatsApp (en pausa). `NEXT_PUBLIC_APP_URL=https://www.raquetaclub.com`.
- [ ] Supabase Auth: Site URL y Redirect URLs con el dominio final (§1).
- [ ] Supabase Auth: plantillas de correo (§1) y SMTP de Resend (§1).
- [ ] Vault: `app_url` y `cron_secret` (§3); `net._http_response` responde 200.
- [ ] Turnstile (§4).
- [ ] Tu cuenta de superadmin (§1) y el club piloto con el plan Pro
      (`/superadmin/clubes/…`).
- [ ] En tu celular: instala la PWA (Compartir → "Agregar a inicio" en
      iPhone), entra, activa los avisos en *Mi cuenta* y verifica que llega un
      push (por ejemplo, proponiéndote un horario desde otra cuenta).
- [ ] Correo real: invita a un jugador con tu otro correo y confirma que
      llegan la invitación (Supabase/Resend) y un aviso de la app.
- [ ] Suite completa contra producción con datos de prueba (se limpia sola):
      `QA_APP_URL=https://www.raquetaclub.com ./qa/run.sh` (usa el mismo
      `CRON_SECRET` de `.env.local`). Con Turnstile activo, los checks que
      envían los formularios de registro fallan: es lo esperado.

## 6. Pendiente (pospuesto)
- Stripe: cobro de suscripciones, webhook y MRR real. Hoy el plan se asigna a
  mano en `/superadmin`.

### WhatsApp (pospuesto)
El código ya está listo pero apagado: por ahora los avisos van solo por correo
y push. Para activarlo (solo clubes con plan que incluya WhatsApp):
Sin `WHATSAPP_ACCESS_TOKEN` y `WHATSAPP_PHONE_NUMBER_ID` el canal se omite.
Plantillas a registrar en Meta Business Manager (categoría Utility, idioma
`es`), con estos nombres y variables en orden:

| Plantilla | Texto sugerido |
|---|---|
| `ronda_publicada` | Hola {{1}}, {{2}} publicó la nueva ronda de {{3}}. Juegas en el {{4}}. Agenda tus partidos aquí: {{5}} |
| `propuesta_horario` | Hola {{1}}, en {{2}} {{3}} te propone jugar el {{4}} en {{5}}. Acepta o propón otro horario: {{6}} |
| `horario_confirmado` | Hola {{1}}, tu partido en {{2}} contra {{3}} quedó agendado el {{4}} en {{5}}. Detalles: {{6}} |
| `recordatorio_partido` | Hola {{1}}, te recordamos tu partido en {{2}} contra {{3}} el {{4}} en {{5}}. Si no puedes, cancela aquí: {{6}} |
| `resultado_pendiente` | Hola {{1}}, en {{2}} {{3}} subió el resultado de su partido: {{4}}. Confírmalo o dispútalo: {{5}} |

Los avisos sin plantilla (propuesta rechazada, reserva cancelada, disputas y
cierres de ronda a los admins) van solo por correo y push.
