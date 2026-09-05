-- ============================================================
--  Nachbesserungen aus dem Performance-Linter
-- ============================================================

-- Fremdschluessel ohne Index: bremsen Loeschvorgaenge und Verknuepfungen.
create index if not exists termin_kategorie_idx    on public.termin (kategorie_id);
create index if not exists kategorie_ersteller_idx on public.kategorie (erstellt_von);

-- "for all" schliesst SELECT mit ein. Damit lagen auf serien_ausnahme zwei
-- Lese-Policies uebereinander, die bei jeder Abfrage beide ausgewertet
-- wurden. Schreibrechte deshalb einzeln vergeben.
drop policy if exists ausnahme_schreiben on public.serien_ausnahme;

create policy ausnahme_anlegen on public.serien_ausnahme
  for insert to authenticated
  with check (intern.ist_ersteller(termin_id));

create policy ausnahme_aendern on public.serien_ausnahme
  for update to authenticated
  using (intern.ist_ersteller(termin_id))
  with check (intern.ist_ersteller(termin_id));

create policy ausnahme_loeschen on public.serien_ausnahme
  for delete to authenticated
  using (intern.ist_ersteller(termin_id));
