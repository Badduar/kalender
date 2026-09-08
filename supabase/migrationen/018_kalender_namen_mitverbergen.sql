-- Wer sein Profil auf "andere sehen nur belegt" gestellt hat, soll auch
-- die Namen seiner Kalender nicht preisgeben - ein Kalender "Therapie"
-- waere sonst ein Leck an der Maskierung vorbei. Zuordnen liess er sich
-- zwar nicht, aber die blosse Existenz sagt schon etwas.
--
-- Gebraucht werden fremde Kalender ohnehin nur fuer die Farbe, und bei
-- verdeckten Terminen liefert die Abfrage gar keine kalender_id mehr -
-- dort greift die Farbe des Profils. Es geht also nichts verloren.
drop policy if exists kalender_lesen on public.kalender;
create policy kalender_lesen on public.kalender
  for select to authenticated
  using (
    intern.ist_freigeschaltet()
    and (besitzer_id = (select auth.uid()) or intern.darf_inhalt_sehen(besitzer_id))
  );
