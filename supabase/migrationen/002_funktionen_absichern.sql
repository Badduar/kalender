-- ============================================================
--  Hilfsfunktionen aus der oeffentlichen API herausnehmen
-- ============================================================
--  Alles im Schema "public" ist ueber /rest/v1/rpc aufrufbar.
--  Die Hilfsfunktionen der Sichtbarkeitspruefung gehoeren da nicht
--  hin - sie wandern in ein internes Schema. Die RLS-Policies
--  koennen sie weiterhin verwenden.
-- ============================================================

create schema if not exists intern;
revoke all on schema intern from public, anon;
grant usage on schema intern to authenticated;

create or replace function intern.ist_ersteller(p_termin uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.termin t
    where t.id = p_termin and t.ersteller_id = (select auth.uid())
  );
$$;

create or replace function intern.sieht_termin(p_termin uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.termin_sichtbarkeit s
    where s.termin_id = p_termin and s.profil_id = (select auth.uid())
  );
$$;

revoke execute on function intern.ist_ersteller(uuid) from public, anon;
revoke execute on function intern.sieht_termin(uuid) from public, anon;
grant  execute on function intern.ist_ersteller(uuid) to authenticated;
grant  execute on function intern.sieht_termin(uuid) to authenticated;

-- Policies auf die internen Funktionen umstellen
drop policy if exists termin_lesen on public.termin;
create policy termin_lesen on public.termin
  for select to authenticated
  using (ersteller_id = (select auth.uid()) or intern.sieht_termin(id));

drop policy if exists sichtbarkeit_lesen on public.termin_sichtbarkeit;
create policy sichtbarkeit_lesen on public.termin_sichtbarkeit
  for select to authenticated
  using (profil_id = (select auth.uid()) or intern.ist_ersteller(termin_id));

drop policy if exists sichtbarkeit_setzen on public.termin_sichtbarkeit;
create policy sichtbarkeit_setzen on public.termin_sichtbarkeit
  for insert to authenticated
  with check (intern.ist_ersteller(termin_id));

drop policy if exists sichtbarkeit_entfernen on public.termin_sichtbarkeit;
create policy sichtbarkeit_entfernen on public.termin_sichtbarkeit
  for delete to authenticated
  using (intern.ist_ersteller(termin_id));

drop policy if exists ausnahme_lesen on public.serien_ausnahme;
create policy ausnahme_lesen on public.serien_ausnahme
  for select to authenticated
  using (intern.ist_ersteller(termin_id) or intern.sieht_termin(termin_id));

drop policy if exists ausnahme_schreiben on public.serien_ausnahme;
create policy ausnahme_schreiben on public.serien_ausnahme
  for all to authenticated
  using (intern.ist_ersteller(termin_id))
  with check (intern.ist_ersteller(termin_id));

drop function if exists public.ist_ersteller(uuid);
drop function if exists public.sieht_termin(uuid);

-- Trigger-Funktionen ebenfalls nach intern, mit festem search_path
create or replace function intern.setze_geaendert_am()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.geaendert_am := now();
  return new;
end;
$$;

drop trigger if exists termin_geaendert on public.termin;
create trigger termin_geaendert
  before update on public.termin
  for each row execute function intern.setze_geaendert_am();

drop function if exists public.setze_geaendert_am();

create or replace function intern.neues_profil()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name  text;
  v_farbe text;
begin
  v_name := left(btrim(coalesce(new.raw_user_meta_data ->> 'name', '')), 60);
  if v_name = '' then
    v_name := left(split_part(coalesce(new.email, 'Profil'), '@', 1), 60);
  end if;
  if v_name = '' then
    v_name := 'Profil';
  end if;

  v_farbe := coalesce(new.raw_user_meta_data ->> 'farbe', '');
  if v_farbe !~ '^#[0-9a-fA-F]{6}$' then
    v_farbe := '#4a90d9';
  end if;

  insert into public.profil (id, name, farbe)
  values (new.id, v_name, v_farbe)
  on conflict (id) do nothing;

  return new;
end;
$$;

revoke execute on function intern.neues_profil() from public, anon, authenticated;

drop trigger if exists auth_neues_profil on auth.users;
create trigger auth_neues_profil
  after insert on auth.users
  for each row execute function intern.neues_profil();

drop function if exists public.neues_profil();
