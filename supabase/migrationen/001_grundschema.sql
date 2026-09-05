-- ============================================================
--  Kalender - Grundschema, Rechte und Sichtbarkeit
-- ============================================================
--  Alle Zeitstempel sind timestamptz (intern UTC).
--  Angezeigt und gerechnet wird im Client in Europe/Berlin.
--
--  Die Migrationen 002 bis 004 bauen darauf auf und ersetzen
--  einige der hier angelegten Funktionen und Policies.
--  Wer die Datenbank neu aufsetzt, spielt alle vier der Reihe
--  nach ein.
--
--  auth.uid() steht bewusst als "(select auth.uid())" in den
--  Policies: so wertet Postgres es einmal je Abfrage aus statt
--  einmal je Zeile.
-- ============================================================

create extension if not exists pgcrypto;

-- ------------------------------------------------------------
--  Tabellen
-- ------------------------------------------------------------

-- Ein Profil je Benutzerkonto. Wird per Trigger automatisch angelegt.
create table if not exists public.profil (
  id          uuid primary key references auth.users (id) on delete cascade,
  name        text not null check (length(btrim(name)) between 1 and 60),
  farbe       text not null default '#4a90d9' check (farbe ~ '^#[0-9a-fA-F]{6}$'),
  erstellt_am timestamptz not null default now()
);

-- Kategorien sind gemeinsam: jeder sieht sie, damit fremde Termine
-- in der richtigen Farbe erscheinen. Aendern darf nur, wer sie angelegt hat.
create table if not exists public.kategorie (
  id           uuid primary key default gen_random_uuid(),
  name         text not null unique check (length(btrim(name)) between 1 and 40),
  farbe        text not null default '#4a90d9' check (farbe ~ '^#[0-9a-fA-F]{6}$'),
  erstellt_von uuid references public.profil (id) on delete set null,
  erstellt_am  timestamptz not null default now()
);

-- Ein Termin. serie_regel = NULL bedeutet Einzeltermin.
-- serie_regel enthaelt eine RRULE-Teilmenge (FREQ, INTERVAL, BYDAY, BYMONTHDAY, COUNT, UNTIL).
-- serie_ende ist der ausgerechnete letzte Tag der Serie (NULL = unbegrenzt),
-- damit abgelaufene Serien beim Laden guenstig weggefiltert werden koennen.
create table if not exists public.termin (
  id           uuid primary key default gen_random_uuid(),
  ersteller_id uuid not null references public.profil (id) on delete cascade,
  titel        text not null check (length(btrim(titel)) between 1 and 200),
  beschreibung text check (length(beschreibung) <= 5000),
  ort          text check (length(ort) <= 200),
  beginn       timestamptz not null,
  ende         timestamptz not null,
  ganztags     boolean not null default false,
  kategorie_id uuid references public.kategorie (id) on delete set null,
  serie_regel  text check (length(serie_regel) <= 500),
  serie_ende   date,
  erstellt_am  timestamptz not null default now(),
  geaendert_am timestamptz not null default now(),
  constraint termin_zeitraum check (ende >= beginn)
);

-- Wer darf den Termin sehen. Der Ersteller sieht ihn immer,
-- unabhaengig davon ob hier eine Zeile fuer ihn steht.
create table if not exists public.termin_sichtbarkeit (
  termin_id uuid not null references public.termin (id) on delete cascade,
  profil_id uuid not null references public.profil (id) on delete cascade,
  primary key (termin_id, profil_id)
);

-- Abweichungen einzelner Vorkommen einer Serie.
-- original_datum = der Tag (lokal, Europe/Berlin), an dem das Vorkommen
-- laut Regel urspruenglich stattgefunden haette.
-- NULL in einem Feld bedeutet: unveraendert gegenueber dem Serien-Kopf.
create table if not exists public.serien_ausnahme (
  id             uuid primary key default gen_random_uuid(),
  termin_id      uuid not null references public.termin (id) on delete cascade,
  original_datum date not null,
  geloescht      boolean not null default false,
  beginn         timestamptz,
  ende           timestamptz,
  titel          text check (length(btrim(titel)) between 1 and 200),
  ort            text check (length(ort) <= 200),
  beschreibung   text check (length(beschreibung) <= 5000),
  unique (termin_id, original_datum)
);

-- Nur die Edge Function "registrieren" (service_role) greift hierauf zu.
-- Fuer angemeldete und anonyme Clients ist die Tabelle komplett gesperrt.
create table if not exists public.einladungscode (
  code          text primary key check (length(btrim(code)) between 4 and 64),
  aktiv         boolean not null default true,
  max_nutzungen integer check (max_nutzungen is null or max_nutzungen > 0),
  benutzt       integer not null default 0,
  bemerkung     text,
  erstellt_am   timestamptz not null default now()
);

-- ------------------------------------------------------------
--  Indizes
-- ------------------------------------------------------------

create index if not exists termin_beginn_idx      on public.termin (beginn);
create index if not exists termin_ersteller_idx   on public.termin (ersteller_id);
create index if not exists termin_serie_idx       on public.termin (serie_ende) where serie_regel is not null;
create index if not exists sichtbarkeit_profil_idx on public.termin_sichtbarkeit (profil_id);
create index if not exists ausnahme_termin_idx    on public.serien_ausnahme (termin_id);

-- ------------------------------------------------------------
--  Trigger
-- ------------------------------------------------------------

create or replace function public.setze_geaendert_am()
returns trigger
language plpgsql
as $$
begin
  new.geaendert_am := now();
  return new;
end;
$$;

drop trigger if exists termin_geaendert on public.termin;
create trigger termin_geaendert
  before update on public.termin
  for each row execute function public.setze_geaendert_am();

-- Legt zu jedem neuen Konto automatisch ein Profil an, damit es nie
-- ein Konto ohne Profil gibt. Name und Farbe kommen aus den Metadaten
-- der Registrierung; ungueltige Werte werden auf Standards zurueckgesetzt,
-- damit eine Registrierung nie an einer Pruefregel scheitert.
create or replace function public.neues_profil()
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

drop trigger if exists auth_neues_profil on auth.users;
create trigger auth_neues_profil
  after insert on auth.users
  for each row execute function public.neues_profil();

-- ------------------------------------------------------------
--  Hilfsfunktionen fuer die Sichtbarkeit
-- ------------------------------------------------------------
--  Wichtig: Eine Policy auf "termin", die "termin_sichtbarkeit" abfragt,
--  waehrend deren Policy wieder "termin" abfragt, ergibt eine
--  Endlos-Rekursion. Diese beiden Funktionen laufen als Eigentuemer
--  (security definer) und umgehen damit RLS - sie brechen den Kreis.

create or replace function public.ist_ersteller(p_termin uuid)
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

create or replace function public.sieht_termin(p_termin uuid)
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

revoke execute on function public.ist_ersteller(uuid) from public, anon;
revoke execute on function public.sieht_termin(uuid) from public, anon;
grant  execute on function public.ist_ersteller(uuid) to authenticated;
grant  execute on function public.sieht_termin(uuid) to authenticated;

-- ------------------------------------------------------------
--  Row Level Security
-- ------------------------------------------------------------

alter table public.profil              enable row level security;
alter table public.kategorie           enable row level security;
alter table public.termin              enable row level security;
alter table public.termin_sichtbarkeit enable row level security;
alter table public.serien_ausnahme     enable row level security;
alter table public.einladungscode      enable row level security;

-- profil: Namen und Farben aller Profile sind fuer Angemeldete lesbar,
-- weil man sie fuer die Sichtbarkeits-Auswahl braucht. Aendern nur das eigene.
drop policy if exists profil_lesen on public.profil;
create policy profil_lesen on public.profil
  for select to authenticated
  using (true);

drop policy if exists profil_aendern on public.profil;
create policy profil_aendern on public.profil
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- kategorie: alle lesen, jeder darf anlegen, aendern/loeschen nur der Anleger.
drop policy if exists kategorie_lesen on public.kategorie;
create policy kategorie_lesen on public.kategorie
  for select to authenticated
  using (true);

drop policy if exists kategorie_anlegen on public.kategorie;
create policy kategorie_anlegen on public.kategorie
  for insert to authenticated
  with check (erstellt_von = (select auth.uid()));

drop policy if exists kategorie_aendern on public.kategorie;
create policy kategorie_aendern on public.kategorie
  for update to authenticated
  using (erstellt_von = (select auth.uid()))
  with check (erstellt_von = (select auth.uid()));

drop policy if exists kategorie_loeschen on public.kategorie;
create policy kategorie_loeschen on public.kategorie
  for delete to authenticated
  using (erstellt_von = (select auth.uid()));

-- termin: sehen darf der Ersteller und jeder freigeschaltete Nutzer.
-- Aendern und loeschen darf nur der Ersteller.
drop policy if exists termin_lesen on public.termin;
create policy termin_lesen on public.termin
  for select to authenticated
  using (ersteller_id = (select auth.uid()) or public.sieht_termin(id));

drop policy if exists termin_anlegen on public.termin;
create policy termin_anlegen on public.termin
  for insert to authenticated
  with check (ersteller_id = (select auth.uid()));

drop policy if exists termin_aendern on public.termin;
create policy termin_aendern on public.termin
  for update to authenticated
  using (ersteller_id = (select auth.uid()))
  with check (ersteller_id = (select auth.uid()));

drop policy if exists termin_loeschen on public.termin;
create policy termin_loeschen on public.termin
  for delete to authenticated
  using (ersteller_id = (select auth.uid()));

-- termin_sichtbarkeit: die eigene Freischaltung sieht jeder,
-- alle Freischaltungen eines Termins sieht dessen Ersteller.
-- Setzen und entfernen darf nur der Ersteller.
drop policy if exists sichtbarkeit_lesen on public.termin_sichtbarkeit;
create policy sichtbarkeit_lesen on public.termin_sichtbarkeit
  for select to authenticated
  using (profil_id = (select auth.uid()) or public.ist_ersteller(termin_id));

drop policy if exists sichtbarkeit_setzen on public.termin_sichtbarkeit;
create policy sichtbarkeit_setzen on public.termin_sichtbarkeit
  for insert to authenticated
  with check (public.ist_ersteller(termin_id));

drop policy if exists sichtbarkeit_entfernen on public.termin_sichtbarkeit;
create policy sichtbarkeit_entfernen on public.termin_sichtbarkeit
  for delete to authenticated
  using (public.ist_ersteller(termin_id));

-- serien_ausnahme: erbt die Sichtbarkeit vom zugehoerigen Termin.
drop policy if exists ausnahme_lesen on public.serien_ausnahme;
create policy ausnahme_lesen on public.serien_ausnahme
  for select to authenticated
  using (public.ist_ersteller(termin_id) or public.sieht_termin(termin_id));

drop policy if exists ausnahme_schreiben on public.serien_ausnahme;
create policy ausnahme_schreiben on public.serien_ausnahme
  for all to authenticated
  using (public.ist_ersteller(termin_id))
  with check (public.ist_ersteller(termin_id));

-- einladungscode: bewusst ohne jede Policy.
-- Damit kommt ausser service_role niemand an die Tabelle heran.
revoke all on public.einladungscode from anon, authenticated;

-- ------------------------------------------------------------
--  Realtime
-- ------------------------------------------------------------
--  Ohne "replica identity full", damit beim Loeschen nur die id
--  uebertragen wird und keine Inhalte an Unbefugte gelangen.
--  Der Client laedt bei jeder Meldung den sichtbaren Zeitraum neu.

do $$
begin
  begin
    alter publication supabase_realtime add table public.termin;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.termin_sichtbarkeit;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.serien_ausnahme;
  exception when duplicate_object then null;
  end;
end
$$;
