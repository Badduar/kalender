-- Zaehlt Fehlversuche je Geraet hoch. Reine Diagnosehilfe: haeuft ein
-- Geraet Fehler an, ohne dass 404/410 kommt, stimmt dort etwas nicht.
create or replace function public.push_fehler_zaehlen(p_geraet uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.push_geraet
     set fehler_zaehler = least(fehler_zaehler + 1, 32767)
   where id = p_geraet;
$$;

revoke execute on function public.push_fehler_zaehlen(uuid) from public, anon, authenticated;
grant  execute on function public.push_fehler_zaehlen(uuid) to service_role;
