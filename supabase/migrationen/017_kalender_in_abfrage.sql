-- ============================================================
--  Kalender in die Abfrage aufnehmen
-- ============================================================
--  Sonst weiss die Anzeige nicht, welche Farbe gilt und was der
--  Umschalter ausblenden soll.
--
--  Bei verdeckten Terminen bleibt der Kalender verborgen: "Dienst"
--  wuerde sonst genau das verraten, was "andere sehen nur belegt"
--  verbergen soll - dasselbe Problem wie bei der Kategorie.
--  Rueckgabetyp geaendert, deshalb erst loeschen.

drop function if exists public.termine_im_zeitraum(date, date);

create function public.termine_im_zeitraum(
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
    case when intern.darf_inhalt_sehen(t.ersteller_id) then t.kalender_id end,
    t.serie_regel,
    t.serie_ende,
    case when t.ersteller_id = (select auth.uid()) then t.erinnerung_minuten end,
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
