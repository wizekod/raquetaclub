-- ═══════════════════════════════════════════════════════════════════════════
-- Invitaciones: aplicar `app_metadata.invited_role` también al ACTUALIZAR.
--
-- GoTrue (admin createUser / inviteUserByEmail + updateUserById) inserta la
-- fila de auth.users y escribe el app_metadata personalizado en un UPDATE
-- posterior. El trigger AFTER INSERT de `handle_new_user` no lo ve: el
-- invitado quedaba como `club_admin` sin club (lo detectó qa/fase0-smoke).
--
-- Este trigger aplica la invitación cuando aparece en app_metadata, sólo si
-- el perfil aún no pertenece a ningún club: nunca mueve a una cuenta ya
-- vinculada de un club a otro, ni toca a un superadmin. app_metadata sólo lo
-- escribe service_role, así que es de confianza.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.handle_user_invitation()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_app  jsonb := coalesce(new.raw_app_meta_data, '{}'::jsonb);
  v_uuid constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  v_club uuid;
begin
  if not (v_app ? 'invited_role') or coalesce(v_app ->> 'club_id', '') !~* v_uuid then
    return new;
  end if;

  select id into v_club from public.clubs where id = (v_app ->> 'club_id')::uuid;
  if v_club is null then
    return new;
  end if;

  update public.profiles
  set role = case v_app ->> 'invited_role'
               when 'club_admin' then 'club_admin'::public.user_role
               else 'player'::public.user_role
             end,
      club_id = v_club
  where id = new.id
    and club_id is null
    and role <> 'superadmin';

  return new;
end;
$$;

drop trigger if exists on_auth_user_invited on auth.users;
create trigger on_auth_user_invited
  after update of raw_app_meta_data on auth.users
  for each row
  when (old.raw_app_meta_data is distinct from new.raw_app_meta_data)
  execute function public.handle_user_invitation();
