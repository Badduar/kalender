-- ============================================================
--  Signal statt Inhalt fuer die Live-Synchronisierung
-- ============================================================
--  Bisher hing Realtime an der Tabelle "termin". Damit ging bei jeder
--  Aenderung die ganze Zeile an alle Berechtigten - samt Titel. Fuer
--  verdeckte Termine waere das ein Leck an der Maskierung vorbei.
--
--  Stattdessen gibt es eine einzige Zeile, die nur einen Zeitstempel
--  traegt. Sie sagt "irgendetwas hat sich geaendert", mehr nicht; der
--  Client laedt daraufhin seinen Zeitraum neu und bekommt dabei die
--  Maskierung. Der Preis: auch Aenderungen, die einen nichts angehen,
--  loesen ein Nachladen aus. Das ist der richtige Tausch.
-- ============================================================

create table if not exists public.aenderung (
  id        smallint primary key default 1 check (id = 1),
  zeitpunkt timestamptz not null default now()
);

insert into public.aenderung (id) values (1) on conflict (id) do nothing;

alter table public.aenderung enable row level security;

drop policy if exists aenderung_lesen on public.aenderung;
create policy aenderung_lesen on public.aenderung
  for select to authenticated
  using (true);

-- Nur der Trigger schreibt, niemand sonst.
revoke insert, update, delete on public.aenderung from anon, authenticated;

create or replace function intern.melde_aenderung()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.aenderung set zeitpunkt = now() where id = 1;
  return null;
end;
$$;

revoke execute on function intern.melde_aenderung() from public, anon, authenticated;

-- Je Anweisung einmal, nicht je Zeile.
drop trigger if exists termin_meldet on public.termin;
create trigger termin_meldet
  after insert or update or delete on public.termin
  for each statement execute function intern.melde_aenderung();

drop trigger if exists sichtbarkeit_meldet on public.termin_sichtbarkeit;
create trigger sichtbarkeit_meldet
  after insert or update or delete on public.termin_sichtbarkeit
  for each statement execute function intern.melde_aenderung();

drop trigger if exists ausnahme_meldet on public.serien_ausnahme;
create trigger ausnahme_meldet
  after insert or update or delete on public.serien_ausnahme
  for each statement execute function intern.melde_aenderung();

-- Inhaltstragende Tabellen aus der Uebertragung nehmen,
-- das Signal aufnehmen.
do $$
begin
  begin alter publication supabase_realtime drop table public.termin; exception when others then null; end;
  begin alter publication supabase_realtime drop table public.termin_sichtbarkeit; exception when others then null; end;
  begin alter publication supabase_realtime drop table public.serien_ausnahme; exception when others then null; end;
  begin alter publication supabase_realtime add table public.aenderung; exception when duplicate_object then null; end;
end
$$;
