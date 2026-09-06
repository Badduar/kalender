-- ============================================================
--  Erinnerungen per Web Push
-- ============================================================

-- Vorlaufzeit je Termin. NULL = keine Erinnerung.
-- 15er-Schritte bis drei Stunden, so wie die Auswahl in der App.
alter table public.termin
  add column if not exists erinnerung_minuten smallint;

alter table public.termin drop constraint if exists termin_erinnerung;
alter table public.termin add constraint termin_erinnerung check (
  erinnerung_minuten is null
  or (erinnerung_minuten between 15 and 180 and erinnerung_minuten % 15 = 0)
);

-- ------------------------------------------------------------
--  Angemeldete Geraete
-- ------------------------------------------------------------
create table if not exists public.push_geraet (
  id             uuid primary key default gen_random_uuid(),
  profil_id      uuid not null references public.profil (id) on delete cascade,
  endpunkt       text not null unique,
  p256dh         text not null,
  auth           text not null,
  bezeichnung    text,
  erstellt_am    timestamptz not null default now(),
  zuletzt_ok     timestamptz,
  fehler_zaehler smallint not null default 0
);

create index if not exists push_geraet_profil_idx on public.push_geraet (profil_id);

alter table public.push_geraet enable row level security;

drop policy if exists geraet_lesen on public.push_geraet;
create policy geraet_lesen on public.push_geraet
  for select to authenticated
  using (profil_id = (select auth.uid()));

drop policy if exists geraet_anmelden on public.push_geraet;
create policy geraet_anmelden on public.push_geraet
  for insert to authenticated
  with check (profil_id = (select auth.uid()) and intern.ist_freigeschaltet());

drop policy if exists geraet_abmelden on public.push_geraet;
create policy geraet_abmelden on public.push_geraet
  for delete to authenticated
  using (profil_id = (select auth.uid()));

-- ------------------------------------------------------------
--  Was schon verschickt wurde
-- ------------------------------------------------------------
--  Verhindert Doppelmeldungen, wenn der Zeitplan mehrfach laeuft.
--  "vorkommen" ist das urspruengliche Datum laut Serienregel.
create table if not exists public.erinnerung_gesendet (
  termin_id   uuid not null references public.termin (id) on delete cascade,
  vorkommen   date not null,
  gesendet_am timestamptz not null default now(),
  primary key (termin_id, vorkommen)
);

alter table public.erinnerung_gesendet enable row level security;
-- Bewusst ohne Policy: nur die Edge Function (service_role) kommt heran.
revoke all on public.erinnerung_gesendet from anon, authenticated;

-- ------------------------------------------------------------
--  Geheimnisse
-- ------------------------------------------------------------
--  Der private VAPID-Schluessel und das Zugangswort des Zeitplans
--  liegen im Vault, nicht im Quelltext.
create or replace function public.geheimnis_lesen(p_name text)
returns text
language sql
stable
security definer
set search_path = public, vault
as $$
  select decrypted_secret from vault.decrypted_secrets where name = p_name;
$$;

revoke execute on function public.geheimnis_lesen(text) from public, anon, authenticated;
grant  execute on function public.geheimnis_lesen(text) to service_role;

-- ------------------------------------------------------------
--  Einmalig von Hand: Geheimnisse anlegen
-- ------------------------------------------------------------
--  Die Werte stehen bewusst NICHT hier. Neu erzeugen und eintragen:
--
--    select vault.create_secret('<VAPID-Paar als JWK-JSON>',
--             'vapid_schluessel', 'VAPID-Schluesselpaar fuer Web Push');
--    select vault.create_secret(encode(gen_random_bytes(24), 'hex'),
--             'zeitplan_wort', 'Zugangswort fuer die Erinnerungs-Funktion');
--
--  Das VAPID-Paar erzeugt man mit dem Skript in der README; der
--  oeffentliche Teil gehoert als VAPID_OEFFENTLICH in js/konfig.js.
