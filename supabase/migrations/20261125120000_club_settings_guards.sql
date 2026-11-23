-- ═══════════════════════════════════════════════════════════════════════════
-- Paso 2 (configuración del club y administradores múltiples).
--
-- 1. Cambiar la lada del club recalcula `profiles.phone_key` de sus miembros:
--    el trigger de profiles sólo corre al cambiar el teléfono o el club, y sin
--    esto quedarían con la lada vieja (WhatsApp a un número equivocado).
--
-- 2. Un club nunca se queda sin administrador activo. Aplica a todos, también
--    a service_role: es un invariante de datos, no de permisos. Error RC422
--    para que la app lo muestre con su propio mensaje.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.clubs_resync_phone_keys()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles p
  set phone_key = public.phone_key(p.phone, new.phone_country_code)
  where p.club_id = new.id
    and p.phone is not null;
  return new;
end;
$$;

drop trigger if exists clubs_resync_phone_keys on public.clubs;
create trigger clubs_resync_phone_keys
  after update of phone_country_code on public.clubs
  for each row
  when (old.phone_country_code is distinct from new.phone_country_code)
  execute function public.clubs_resync_phone_keys();

create or replace function public.guard_last_club_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.role = 'club_admin' and old.status = 'active' and old.club_id is not null
     and (new.role <> 'club_admin'
          or new.status <> 'active'
          or new.club_id is distinct from old.club_id)
     and not exists (
       select 1 from public.profiles p
       where p.club_id = old.club_id
         and p.role = 'club_admin'
         and p.status = 'active'
         and p.id <> old.id
     ) then
    raise exception 'El club necesita al menos un administrador activo'
      using errcode = 'RC422';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_guard_last_admin on public.profiles;
create trigger profiles_guard_last_admin
  before update of role, status, club_id on public.profiles
  for each row execute function public.guard_last_club_admin();
