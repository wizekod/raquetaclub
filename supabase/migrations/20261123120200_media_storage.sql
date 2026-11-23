-- ═══════════════════════════════════════════════════════════════════════════
-- Almacenamiento: logos de club, avatares de jugador y reglamentos en PDF.
--
-- Un solo bucket público: logo y reglamento se enseñan en la página pública
-- del club, sin login. Se guarda la RUTA, nunca la URL (lib/storage/media.ts).
--
-- Rutas:
--   {club_id}/logos/{uuid}.{ext}            → admin del club
--   {club_id}/rules/{uuid}.pdf              → admin del club
--   {club_id}/avatars/{profile_id}/{uuid}.{ext} → el propio jugador o el admin
-- El primer segmento permite a la política comprobar el club; el uuid hace
-- cada objeto inmutable (reemplazar = ruta nueva, sin invalidar cachés).
-- ═══════════════════════════════════════════════════════════════════════════

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', true, 10485760,
        array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do update set
  public             = excluded.public,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Se comprueba la forma antes de castear: una ruta cualquiera reventaría el
-- cast a uuid dentro de la política.
create or replace function public.owns_media_path(object_name text)
returns boolean
language plpgsql
stable
set search_path = public, storage
as $$
declare
  v_parts text[] := storage.foldername(object_name);
  v_uuid  constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  v_club  uuid;
begin
  if coalesce(v_parts[1], '') !~* v_uuid then
    return false;
  end if;
  v_club := v_parts[1]::uuid;

  if public.can_manage_club(v_club) then
    return true;
  end if;

  -- Jugador: sólo su propia carpeta de avatar, dentro de su club.
  return v_parts[2] = 'avatars'
     and v_parts[3] = (select auth.uid())::text
     and public.current_club_id() = v_club;
end;
$$;
grant execute on function public.owns_media_path(text) to authenticated;

drop policy if exists media_owner_read   on storage.objects;
drop policy if exists media_owner_insert on storage.objects;
drop policy if exists media_owner_update on storage.objects;
drop policy if exists media_owner_delete on storage.objects;

-- Nada para `anon`: en un bucket público /storage/v1/object/public/... se
-- sirve sin pasar por estas políticas, y sin policy de select nadie puede
-- listar la carpeta de un club.
create policy media_owner_read on storage.objects
  for select to authenticated
  using (bucket_id = 'media' and public.owns_media_path(name));

create policy media_owner_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'media' and public.owns_media_path(name));

create policy media_owner_update on storage.objects
  for update to authenticated
  using      (bucket_id = 'media' and public.owns_media_path(name))
  with check (bucket_id = 'media' and public.owns_media_path(name));

create policy media_owner_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'media' and public.owns_media_path(name));
