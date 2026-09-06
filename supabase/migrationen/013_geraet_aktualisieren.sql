-- Meldet sich dasselbe Geraet erneut an, ist der Endpunkt derselbe.
-- Ohne Aenderungsregel scheitert das Eintragen dann am Unique-Index.
drop policy if exists geraet_aktualisieren on public.push_geraet;
create policy geraet_aktualisieren on public.push_geraet
  for update to authenticated
  using (profil_id = (select auth.uid()))
  with check (profil_id = (select auth.uid()));
