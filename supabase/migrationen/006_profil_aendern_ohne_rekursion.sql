-- ============================================================
--  Eigenes Profil aendern - ohne Endlosrekursion
-- ============================================================
--  Man darf Name und Farbe des eigenen Profils aendern, aber nicht
--  die Freischaltung. Der Vergleichswert dafuer darf NICHT per
--  Unterabfrage aus "profil" kommen: das loest wieder die Leseregel
--  derselben Tabelle aus, und Postgres bricht mit
--  "42P17 infinite recursion detected in policy" ab - auch beim
--  voellig harmlosen Umbenennen.
--
--  Die security-definer-Funktion umgeht RLS und bricht den Kreis.
-- ============================================================

drop policy if exists profil_aendern on public.profil;
create policy profil_aendern on public.profil
  for update to authenticated
  using (id = (select auth.uid()))
  with check (
    id = (select auth.uid())
    and freigeschaltet = intern.ist_freigeschaltet()
  );
