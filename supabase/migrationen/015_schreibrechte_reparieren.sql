-- ============================================================
--  Loeschen und Aendern wieder ermoeglichen
-- ============================================================
--  Migration 007 hat "select" auf termin und serien_ausnahme
--  entzogen, damit die Maskierung nicht umgangen werden kann.
--  Uebersehen wurde dabei: Postgres verlangt Leserecht auch auf die
--  Spalten, die in der WHERE-Bedingung eines DELETE oder UPDATE
--  stehen. "delete ... where id = ..." liest die Spalte id - und
--  scheiterte deshalb mit "42501 permission denied for table termin".
--  Bearbeiten und Loeschen von Terminen waren dadurch unmoeglich.
--
--  Deshalb gezielt nur die Spalten freigeben, die zum Adressieren
--  noetig sind. Titel, Ort, Notiz und Kategorie bleiben gesperrt,
--  die Maskierung bleibt also vollstaendig erhalten: ueber
--  /rest/v1/termin?select=titel kommt weiterhin nichts heraus.
--
--  Nicht freigegeben wird, was "insert ... on conflict do update"
--  braeuchte - dafuer schreibt der Client stattdessen erst loeschen,
--  dann einfuegen (siehe ausnahmeSetzen in js/daten.js).

grant select (id, ersteller_id) on public.termin to authenticated;

grant select (id, termin_id, original_datum) on public.serien_ausnahme to authenticated;
