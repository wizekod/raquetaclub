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

## 3. Pendiente (pasos siguientes)
- Resend + dominio, WhatsApp (plantillas en `lib/notifications/whatsapp.ts`),
  Turnstile, VAPID, Stripe, cron (pg_cron + Vault): se documentan al activar
  cada uno.
