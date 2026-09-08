-- ============================================================
--  Tagesueberblick am Morgen
-- ============================================================
--  Zu einer selbst gewaehlten Uhrzeit kommt eine Push-Meldung mit
--  den Terminen des laufenden Tages.
--
--  Der schwierige Teil steht ganz oben: Wer was sehen darf, haengt
--  bisher ueberall an auth.uid() - also daran, wer gerade angemeldet
--  ist. Der Versandserver ist aber niemand; er handelt fuer jemanden,
--  ohne dieser jemand zu sein.
--
--  Deshalb bekommt jede Pruefung eine Fassung mit ausdruecklichem
--  Leser, und die bisherige wird zur duennen Huelle, die auth.uid()
--  einsetzt. Es bleibt genau EINE Maskierungslogik. Zwei Fassungen
--  koennten auseinanderlaufen, und dann verriete der Tagesueberblick
--  eines Tages genau das, was die App als "Belegt" verbirgt.
-- ============================================================

-- ------------------------------------------------------------
--  Pruefungen mit ausdruecklichem Leser
-- ------------------------------------------------------------

create or replace function intern.ist_freigeschaltet_fuer(p_leser uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select p.freigeschaltet from public.profil p where p.id = p_leser),
    false
  );
$$;

create or replace function intern.sieht_termin_fuer(p_leser uuid, p_termin uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.termin_sichtbarkeit s
    where s.termin_id = p_termin and s.profil_id = p_leser
  );
$$;

create or replace function intern.darf_termin_sehen_fuer(
  p_leser uuid, p_termin uuid, p_ersteller uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select intern.ist_freigeschaltet_fuer(p_leser)
     and (p_ersteller = p_leser or intern.sieht_termin_fuer(p_leser, p_termin));
$$;

create or replace function intern.darf_inhalt_sehen_fuer(p_leser uuid, p_ersteller uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_ersteller = p_leser
      or not coalesce(
           (select p.nur_frei_gebucht from public.profil p where p.id = p_ersteller),
           false);
$$;

-- ------------------------------------------------------------
--  Die bisherigen Pruefungen werden Huellen
-- ------------------------------------------------------------
--  Wortgleiches Verhalten wie vorher: ohne Anmeldung ist auth.uid()
--  NULL, dann liefern die Fassungen oben false.

create or replace function intern.ist_freigeschaltet()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select intern.ist_freigeschaltet_fuer((select auth.uid()));
$$;

create or replace function intern.sieht_termin(p_termin uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select intern.sieht_termin_fuer((select auth.uid()), p_termin);
$$;

create or replace function intern.darf_termin_sehen(p_termin uuid, p_ersteller uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select intern.darf_termin_sehen_fuer((select auth.uid()), p_termin, p_ersteller);
$$;

create or replace function intern.darf_inhalt_sehen(p_ersteller uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select intern.darf_inhalt_sehen_fuer((select auth.uid()), p_ersteller);
$$;

-- Die _fuer-Fassungen darf nur der Server aufrufen. Ein Angemeldeter
-- koennte sich sonst einen fremden Leser eintragen und alles sehen.
revoke execute on function intern.ist_freigeschaltet_fuer(uuid)         from public, anon, authenticated;
revoke execute on function intern.sieht_termin_fuer(uuid, uuid)         from public, anon, authenticated;
revoke execute on function intern.darf_termin_sehen_fuer(uuid, uuid, uuid) from public, anon, authenticated;
revoke execute on function intern.darf_inhalt_sehen_fuer(uuid, uuid)    from public, anon, authenticated;

-- ------------------------------------------------------------
--  Termine holen - jetzt mit ausdruecklichem Leser
-- ------------------------------------------------------------
create or replace function public.termine_im_zeitraum_fuer(
  p_leser uuid,
  p_von   date default null,
  p_bis   date default null
)
returns table (
  id            uuid,
  ersteller_id  uuid,
  titel         text,
  beschreibung  text,
  ort           text,
  beginn        timestamptz,
  ende          timestamptz,
  ganztags      boolean,
  kategorie_id  uuid,
  kalender_id   uuid,
  serie_regel   text,
  serie_ende    date,
  erinnerung_minuten smallint,
  verdeckt      boolean,
  sichtbar_fuer uuid[],
  ausnahmen     jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select
    t.id,
    t.ersteller_id,
    case when intern.darf_inhalt_sehen_fuer(p_leser, t.ersteller_id) then t.titel end,
    case when intern.darf_inhalt_sehen_fuer(p_leser, t.ersteller_id) then t.beschreibung end,
    case when intern.darf_inhalt_sehen_fuer(p_leser, t.ersteller_id) then t.ort end,
    t.beginn,
    t.ende,
    t.ganztags,
    -- Auch die Kategorie bleibt verborgen: "Arzt" wuerde verraten,
    -- worum es geht. Ohne sie greift die Farbe des Erstellers.
    case when intern.darf_inhalt_sehen_fuer(p_leser, t.ersteller_id) then t.kategorie_id end,
    -- Und der Kalendername ebenso: "Therapie" waere schon die Auskunft.
    case when intern.darf_inhalt_sehen_fuer(p_leser, t.ersteller_id) then t.kalender_id end,
    t.serie_regel,
    t.serie_ende,
    case when t.ersteller_id = p_leser then t.erinnerung_minuten end,
    not intern.darf_inhalt_sehen_fuer(p_leser, t.ersteller_id),
    case
      when t.ersteller_id = p_leser then coalesce(
        (select array_agg(v.profil_id) from public.termin_sichtbarkeit v where v.termin_id = t.id),
        '{}'::uuid[])
      else coalesce(
        (select array_agg(v.profil_id) from public.termin_sichtbarkeit v
          where v.termin_id = t.id and v.profil_id = p_leser),
        '{}'::uuid[])
    end,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'original_datum', a.original_datum,
        'geloescht',      a.geloescht,
        'beginn',         a.beginn,
        'ende',           a.ende,
        'titel',        case when intern.darf_inhalt_sehen_fuer(p_leser, t.ersteller_id) then a.titel end,
        'ort',          case when intern.darf_inhalt_sehen_fuer(p_leser, t.ersteller_id) then a.ort end,
        'beschreibung', case when intern.darf_inhalt_sehen_fuer(p_leser, t.ersteller_id) then a.beschreibung end
      ))
      from public.serien_ausnahme a where a.termin_id = t.id
    ), '[]'::jsonb)
  from public.termin t
  where intern.darf_termin_sehen_fuer(p_leser, t.id, t.ersteller_id)
    -- Ohne Zeitraum: alles (fuer den ICS-Export).
    and (p_bis is null or t.beginn < ((p_bis + 1)::timestamp at time zone 'Europe/Berlin'))
    and (
      p_von is null
      or (t.serie_regel is null and t.ende >= (p_von::timestamp at time zone 'Europe/Berlin'))
      -- Serien koennen lange vor dem Fenster begonnen haben.
      or (t.serie_regel is not null and (t.serie_ende is null or t.serie_ende >= p_von))
    );
$$;

revoke execute on function public.termine_im_zeitraum_fuer(uuid, date, date)
  from public, anon, authenticated;
grant  execute on function public.termine_im_zeitraum_fuer(uuid, date, date)
  to service_role;

-- Der bisherige Leseweg der App: derselbe Rumpf, Leser ist man selbst.
create or replace function public.termine_im_zeitraum(
  p_von date default null,
  p_bis date default null
)
returns table (
  id            uuid,
  ersteller_id  uuid,
  titel         text,
  beschreibung  text,
  ort           text,
  beginn        timestamptz,
  ende          timestamptz,
  ganztags      boolean,
  kategorie_id  uuid,
  kalender_id   uuid,
  serie_regel   text,
  serie_ende    date,
  erinnerung_minuten smallint,
  verdeckt      boolean,
  sichtbar_fuer uuid[],
  ausnahmen     jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select * from public.termine_im_zeitraum_fuer((select auth.uid()), p_von, p_bis);
$$;

revoke execute on function public.termine_im_zeitraum(date, date) from public, anon;
grant  execute on function public.termine_im_zeitraum(date, date) to authenticated;

-- ------------------------------------------------------------
--  Wann der Ueberblick kommen soll
-- ------------------------------------------------------------
--  Wanduhrzeit, keine Zeitzone: 7:00 bleibt 7:00, auch wenn die Uhr
--  umgestellt wird. NULL = kein Ueberblick.
alter table public.profil
  add column if not exists tagesueberblick_um time;

-- ------------------------------------------------------------
--  Was schon verschickt wurde
-- ------------------------------------------------------------
--  Ein Eintrag je Profil und Tag. Verhindert, dass der Minutentakt
--  den Ueberblick den ganzen Morgen lang wiederholt.
create table if not exists public.tagesueberblick_gesendet (
  profil_id   uuid not null references public.profil (id) on delete cascade,
  datum       date not null,
  gesendet_am timestamptz not null default now(),
  primary key (profil_id, datum)
);

alter table public.tagesueberblick_gesendet enable row level security;
-- Bewusst ohne Policy: nur die Edge Function (service_role) kommt heran.
revoke all on public.tagesueberblick_gesendet from anon, authenticated;
