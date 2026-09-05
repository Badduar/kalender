-- ============================================================
--  Einladungscode pruefen und verbrauchen
-- ============================================================
--  Prueft den Code und zaehlt ihn in einem Schritt hoch. Atomar,
--  damit ein Code mit begrenzter Nutzungszahl nicht durch zwei
--  gleichzeitige Registrierungen ueberzogen werden kann.
--  Nur die Edge Function (service_role) darf das aufrufen.
-- ============================================================

create or replace function public.code_verbrauchen(p_code text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ok boolean;
begin
  update public.einladungscode
     set benutzt = benutzt + 1
   where code = p_code
     and aktiv
     and (max_nutzungen is null or benutzt < max_nutzungen)
  returning true into v_ok;

  return coalesce(v_ok, false);
end;
$$;

-- Macht eine verbrauchte Nutzung wieder rueckgaengig,
-- falls das Anlegen des Kontos danach fehlschlaegt.
create or replace function public.code_zuruecknehmen(p_code text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.einladungscode
     set benutzt = greatest(benutzt - 1, 0)
   where code = p_code;
$$;

revoke execute on function public.code_verbrauchen(text)   from public, anon, authenticated;
revoke execute on function public.code_zuruecknehmen(text) from public, anon, authenticated;
grant  execute on function public.code_verbrauchen(text)   to service_role;
grant  execute on function public.code_zuruecknehmen(text) to service_role;

-- ------------------------------------------------------------
--  Kein Code in dieser Datei!
-- ------------------------------------------------------------
--  Diese Datei liegt in einem oeffentlichen Repository. Ein Code,
--  der hier steht, ist fuer alle lesbar - und damit wertlos.
--  Codes werden von Hand im SQL-Editor angelegt:
--
--    insert into public.einladungscode (code, max_nutzungen, bemerkung)
--    values ('AUSGEDACHTER-CODE', 5, 'Fuer die Familie');
--
--  Nachsehen, welche es gibt und wie oft sie benutzt wurden:
--
--    select code, aktiv, benutzt, max_nutzungen, bemerkung
--      from public.einladungscode;
--
--  Sperren:
--
--    update public.einladungscode set aktiv = false where code = '...';
-- ------------------------------------------------------------
