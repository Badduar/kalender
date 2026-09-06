-- pg_net landete beim Anlegen im Schema "public"; der Sicherheits-
-- Linter mahnt das zu Recht an. SET SCHEMA kann die Erweiterung
-- nicht, also neu anlegen. Ihre Funktionen liegen in "net" - der
-- Aufruf net.http_post in intern.erinnerungen_anstossen() bleibt
-- unveraendert gueltig, er wird erst zur Laufzeit aufgeloest.
do $$
begin
  if exists (
    select 1 from pg_extension e
      join pg_namespace n on n.oid = e.extnamespace
     where e.extname = 'pg_net' and n.nspname = 'public'
  ) then
    execute 'drop extension pg_net';
    execute 'create extension pg_net with schema extensions';
  end if;
end
$$;
