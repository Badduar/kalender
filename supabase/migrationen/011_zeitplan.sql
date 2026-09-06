-- ============================================================
--  Zeitplan: ruft die Erinnerungs-Funktion jede Minute auf
-- ============================================================
--  Jede Minute statt alle fuenf: sonst kaeme eine 15-Minuten-
--  Erinnerung irgendwann zwischen 10 und 15 Minuten vorher an.
--  Rund 43.000 Aufrufe im Monat - im Gratistarif unproblematisch.

create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function intern.erinnerungen_anstossen()
returns void
language plpgsql
security definer
set search_path = public, extensions, net, vault
as $$
declare
  v_wort text;
begin
  select decrypted_secret into v_wort
    from vault.decrypted_secrets where name = 'zeitplan_wort';

  if v_wort is null then
    raise warning 'Zugangswort fehlt - Erinnerungen werden nicht angestossen';
    return;
  end if;

  perform net.http_post(
    url     := 'https://caflqjhsapbqvmuvffir.supabase.co/functions/v1/erinnerungen',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'x-zeitplan-wort', v_wort),
    body    := '{}'::jsonb,
    timeout_milliseconds := 50000
  );
end;
$$;

revoke execute on function intern.erinnerungen_anstossen() from public, anon, authenticated;

select cron.unschedule('erinnerungen')
 where exists (select 1 from cron.job where jobname = 'erinnerungen');

select cron.schedule('erinnerungen', '* * * * *', 'select intern.erinnerungen_anstossen()');
