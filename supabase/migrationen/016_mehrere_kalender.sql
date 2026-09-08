-- ============================================================
--  Mehrere Kalender je Person
-- ============================================================
--  Eine Person kann sich neben ihrem ersten Kalender weitere anlegen
--  (z.B. "Dienst") und im laufenden Betrieb umschalten - ohne zweite
--  Anmeldung. An der Sichtbarkeit aendert sich nichts: freigegebene
--  Termine sehen weiterhin alle, die freigeschaltet sind.
--
--  Die Leseregel wird in Migration 018 nachgeschaerft.
-- ============================================================

create table if not exists public.kalender (
  id          uuid primary key default gen_random_uuid(),
  besitzer_id uuid not null references public.profil (id) on delete cascade,
  name        text not null check (length(btrim(name)) between 1 and 40),
  farbe       text not null default '#4a90d9' check (farbe ~ '^#[0-9a-fA-F]{6}$'),
  erstellt_am timestamptz not null default now(),
  unique (besitzer_id, name)
);

create index if not exists kalender_besitzer_idx on public.kalender (besitzer_id);

alter table public.kalender enable row level security;

-- Lesen duerfen alle Freigeschalteten: die Farbe und der Name eines
-- fremden Kalenders werden gebraucht, um dessen Termine darzustellen.
drop policy if exists kalender_lesen on public.kalender;
create policy kalender_lesen on public.kalender
  for select to authenticated
  using (intern.ist_freigeschaltet());

drop policy if exists kalender_anlegen on public.kalender;
create policy kalender_anlegen on public.kalender
  for insert to authenticated
  with check (besitzer_id = (select auth.uid()) and intern.ist_freigeschaltet());

drop policy if exists kalender_aendern on public.kalender;
create policy kalender_aendern on public.kalender
  for update to authenticated
  using (besitzer_id = (select auth.uid()))
  with check (besitzer_id = (select auth.uid()));

drop policy if exists kalender_loeschen on public.kalender;
create policy kalender_loeschen on public.kalender
  for delete to authenticated
  using (besitzer_id = (select auth.uid()));

-- ------------------------------------------------------------
--  Zuordnung am Termin
-- ------------------------------------------------------------
--  "restrict": ein Kalender mit Terminen laesst sich nicht loeschen.
--  Lieber eine ehrliche Fehlermeldung als still verschwundene Termine.
--  Beim Loeschen eines ganzen Profils stoert das nicht - dort raeumt
--  die Kaskade die Termine vor den Kalendern weg (nachgemessen).
alter table public.termin
  add column if not exists kalender_id uuid references public.kalender (id) on delete restrict;

create index if not exists termin_kalender_idx on public.termin (kalender_id);

-- ------------------------------------------------------------
--  Jedes Profil bekommt einen ersten Kalender
-- ------------------------------------------------------------
--  Name "Privat", Farbe wie bisher das Profil - so sieht nach der
--  Umstellung alles aus wie vorher.
insert into public.kalender (besitzer_id, name, farbe)
select p.id, 'Privat', p.farbe
  from public.profil p
 where not exists (select 1 from public.kalender k where k.besitzer_id = p.id);

-- Bestehende Termine dem ersten Kalender ihres Erstellers zuordnen.
update public.termin t
   set kalender_id = k.id
  from public.kalender k
 where k.besitzer_id = t.ersteller_id
   and t.kalender_id is null;

-- Kuenftige Profile bekommen ihren Kalender automatisch.
create or replace function intern.erster_kalender()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.kalender (besitzer_id, name, farbe)
  values (new.id, 'Privat', new.farbe)
  on conflict (besitzer_id, name) do nothing;
  return new;
end;
$$;

revoke execute on function intern.erster_kalender() from public, anon, authenticated;

drop trigger if exists profil_erster_kalender on public.profil;
create trigger profil_erster_kalender
  after insert on public.profil
  for each row execute function intern.erster_kalender();
