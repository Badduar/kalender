-- ============================================================
--  Freischaltung: nur wer per Einladungscode kam, zaehlt
-- ============================================================
--  Ob die Selbstregistrierung im Dashboard abgeschaltet ist, laesst
--  sich von aussen nicht zuverlaessig pruefen - und ein Haken, den
--  jemand versehentlich umlegt, waere ein stiller Totalausfall des
--  Schutzes. Deshalb steht die Huerde hier in der Datenbank.
--
--  Die Edge Function "registrieren" setzt das Kennzeichen mit
--  Dienstrechten. Wer auf anderem Weg ein Konto anlegt, bekommt ein
--  Profil ohne Freischaltung: es sieht nichts und kann nichts anlegen.
-- ============================================================

alter table public.profil
  add column if not exists freigeschaltet boolean not null default false;

-- Bestehende Profile stammen alle aus der Edge Function.
update public.profil set freigeschaltet = true where freigeschaltet = false;

create or replace function intern.ist_freigeschaltet()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select p.freigeschaltet from public.profil p where p.id = (select auth.uid())),
    false
  );
$$;

revoke execute on function intern.ist_freigeschaltet() from public, anon;
grant  execute on function intern.ist_freigeschaltet() to authenticated;

-- ------------------------------------------------------------
--  Lesen
-- ------------------------------------------------------------
-- Das eigene Profil sieht man immer - sonst koennte die App nicht
-- einmal erklaeren, warum nichts geht. Die uebrigen Profile (Namen
-- und Farben) erst nach Freischaltung.
drop policy if exists profil_lesen on public.profil;
create policy profil_lesen on public.profil
  for select to authenticated
  using (id = (select auth.uid()) or intern.ist_freigeschaltet());

drop policy if exists kategorie_lesen on public.kategorie;
create policy kategorie_lesen on public.kategorie
  for select to authenticated
  using (intern.ist_freigeschaltet());

drop policy if exists termin_lesen on public.termin;
create policy termin_lesen on public.termin
  for select to authenticated
  using (
    intern.ist_freigeschaltet()
    and (ersteller_id = (select auth.uid()) or intern.sieht_termin(id))
  );

-- ------------------------------------------------------------
--  Schreiben
-- ------------------------------------------------------------
drop policy if exists termin_anlegen on public.termin;
create policy termin_anlegen on public.termin
  for insert to authenticated
  with check (ersteller_id = (select auth.uid()) and intern.ist_freigeschaltet());

drop policy if exists kategorie_anlegen on public.kategorie;
create policy kategorie_anlegen on public.kategorie
  for insert to authenticated
  with check (erstellt_von = (select auth.uid()) and intern.ist_freigeschaltet());

drop policy if exists sichtbarkeit_setzen on public.termin_sichtbarkeit;
create policy sichtbarkeit_setzen on public.termin_sichtbarkeit
  for insert to authenticated
  with check (intern.ist_ersteller(termin_id) and intern.ist_freigeschaltet());

drop policy if exists ausnahme_anlegen on public.serien_ausnahme;
create policy ausnahme_anlegen on public.serien_ausnahme
  for insert to authenticated
  with check (intern.ist_ersteller(termin_id) and intern.ist_freigeschaltet());

-- ------------------------------------------------------------
--  Freischalten - nur fuer die Edge Function
-- ------------------------------------------------------------
create or replace function public.profil_freischalten(p_profil uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.profil set freigeschaltet = true where id = p_profil;
$$;

revoke execute on function public.profil_freischalten(uuid) from public, anon, authenticated;
grant  execute on function public.profil_freischalten(uuid) to service_role;

-- Hinweis: Die Regel profil_aendern wird in Migration 006 gesetzt.
-- Die hier urspruenglich verwendete Fassung fragte "profil" direkt ab
-- und loeste damit eine Endlosrekursion aus.
