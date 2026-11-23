-- ═══════════════════════════════════════════════════════════════════════════
-- Cerrar todas las sesiones de un usuario desde el servidor (de reservaprimero).
--
-- Al dar de baja a un jugador o admin, sus sesiones abiertas tienen que caer.
-- La API admin de Supabase sólo cierra sesiones a partir del JWT del propio
-- usuario, no por id; borrando sus filas de auth.sessions se invalidan sus
-- refresh tokens (en cascada). El access token vigente expira solo (< 1 h), y
-- mientras tanto `requireRole` ya lo saca de los paneles por estar inactivo.
--
-- Sólo la llama el servidor con service_role.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.revoke_user_sessions(p_user_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from auth.sessions where user_id = p_user_id;
$$;

revoke all on function public.revoke_user_sessions(uuid) from public, anon, authenticated;
grant execute on function public.revoke_user_sessions(uuid) to service_role;
