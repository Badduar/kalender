-- ============================================================
--  "Nur Frei/Gebucht": andere sehen Zeit und Farbe, nicht den Inhalt
-- ============================================================
--  Row Level Security wirkt zeilenweise, nicht spaltenweise. Um
--  einzelne Felder zu verbergen, darf der Client die Tabelle gar nicht
--  mehr lesen; er bekommt die Termine ueber eine Funktion, die Titel,
--  Ort, Notiz und Kategorie ausblendet, wenn sie ihn nichts angehen.
-- ============================================================

alter table public.profil
  add column if not exists nur_frei_gebucht boolean not null default false;

comment on column public.profil.nur_frei_gebucht is
  'Wenn wahr, sehen andere von den Terminen dieses Profils nur Zeit und Farbe.';

-- ------------------------------------------------------------
--  Eine einzige Stelle entscheidet ueber Sichtbarkeit
-- ------------------------------------------------------------
create or replace function intern.darf_termin_sehen(p_termin uuid, p_ersteller uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select intern.ist_freigeschaltet()
     and (p_ersteller = (select auth.uid()) or intern.sieht_termin(p_termin));
$$;

-- Den Inhalt sieht, wem der Termin gehoert - und jeder andere nur dann,
-- wenn der Ersteller sein Profil nicht auf Frei/Gebucht gestellt hat.
create or replace function intern.darf_inhalt_sehen(p_ersteller uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_ersteller = (select auth.uid())
      or not coalesce(
           (select p.nur_frei_gebucht from public.profil p where p.id = p_ersteller),
           false);
$$;

revoke execute on function intern.darf_termin_sehen(uuid, uuid) from public, anon;
revoke execute on function intern.darf_inhalt_sehen(uuid)        from public, anon;
grant  execute on function intern.darf_termin_sehen(uuid, uuid) to authenticated;
grant  execute on function intern.darf_inhalt_sehen(uuid)        to authenticated;

-- Die Leseregel benutzt jetzt dieselbe Funktion wie die Abfrage unten.
drop policy if exists termin_lesen on public.termin;
create policy termin_lesen on public.termin
  for select to authenticated
  using (intern.darf_termin_sehen(id, ersteller_id));

-- ------------------------------------------------------------
--  Termine holen - der einzige Leseweg fuer Clients
-- ------------------------------------------------------------
--  Der Sicherheits-Linter meldet diese Funktion als
--  "security definer, von Angemeldeten aufrufbar". Das ist Absicht:
--  sie IST die Schnittstelle und prueft die Berechtigung selbst.
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
  serie_regel   text,
  serie_ende    date,
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
    case when intern.darf_inhalt_sehen(t.ersteller_id) then t.titel end,
    case when intern.darf_inhalt_sehen(t.ersteller_id) then t.beschreibung end,
    case when intern.darf_inhalt_sehen(t.ersteller_id) then t.ort end,
    t.beginn,
    t.ende,
    t.ganztags,
    -- Auch die Kategorie bleibt verborgen: "Arzt" wuerde verraten,
    -- worum es geht. Ohne sie greift die Farbe des Erstellers.
    case when intern.darf_inhalt_sehen(t.ersteller_id) then t.kategorie_id end,
    t.serie_regel,
    t.serie_ende,
    not intern.darf_inhalt_sehen(t.ersteller_id),
    case
      when t.ersteller_id = (select auth.uid()) then coalesce(
        (select array_agg(v.profil_id) from public.termin_sichtbarkeit v where v.termin_id = t.id),
        '{}'::uuid[])
      else coalesce(
        (select array_agg(v.profil_id) from public.termin_sichtbarkeit v
          where v.termin_id = t.id and v.profil_id = (select auth.uid())),
        '{}'::uuid[])
    end,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'original_datum', a.original_datum,
        'geloescht',      a.geloescht,
        'beginn',         a.beginn,
        'ende',           a.ende,
        'titel',        case when intern.darf_inhalt_sehen(t.ersteller_id) then a.titel end,
        'ort',          case when intern.darf_inhalt_sehen(t.ersteller_id) then a.ort end,
        'beschreibung', case when intern.darf_inhalt_sehen(t.ersteller_id) then a.beschreibung end
      ))
      from public.serien_ausnahme a where a.termin_id = t.id
    ), '[]'::jsonb)
  from public.termin t
  where intern.darf_termin_sehen(t.id, t.ersteller_id)
    -- Ohne Zeitraum: alles (fuer den ICS-Export).
    and (p_bis is null or t.beginn < ((p_bis + 1)::timestamp at time zone 'Europe/Berlin'))
    and (
      p_von is null
      or (t.serie_regel is null and t.ende >= (p_von::timestamp at time zone 'Europe/Berlin'))
      -- Serien koennen lange vor dem Fenster begonnen haben.
      or (t.serie_regel is not null and (t.serie_ende is null or t.serie_ende >= p_von))
    );
$$;

revoke execute on function public.termine_im_zeitraum(date, date) from public, anon;
grant  execute on function public.termine_im_zeitraum(date, date) to authenticated;

-- ------------------------------------------------------------
--  Direkten Lesezugriff entziehen
-- ------------------------------------------------------------
--  Sonst waere die Maskierung wertlos: man koennte einfach
--  /rest/v1/termin abfragen. Schreiben bleibt erlaubt, dafuer
--  sorgen weiterhin die Policies.
revoke select on public.termin          from authenticated;
revoke select on public.serien_ausnahme from authenticated;
