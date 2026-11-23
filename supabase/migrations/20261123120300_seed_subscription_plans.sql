-- ═══════════════════════════════════════════════════════════════════════════
-- Planes de suscripción base (club → Carlos). Idempotente.
-- price y stripe_price_id son PLACEHOLDERS: se fijan desde /superadmin/planes
-- cuando se active Stripe (Fase 1, paso 9).
-- ═══════════════════════════════════════════════════════════════════════════
insert into public.subscription_plans (name, max_players, max_active_tournaments, price, features)
values
  ('Free', 20,   1,    0, '{"whatsapp": false, "public_rankings": true, "reminders": true}'::jsonb),
  ('Pro',  null, null, 0, '{"whatsapp": true,  "public_rankings": true, "reminders": true}'::jsonb)
on conflict (name) do nothing;
