// ============================================================
//  Datenzugriff
// ============================================================
//  Alles, was mit der Datenbank spricht. Welche Termine zurueckkommen,
//  entscheidet die Row Level Security auf dem Server - hier wird nichts
//  nachtraeglich weggefiltert.
// ============================================================

import { db } from "./supabase.js";
import { vorkommen, serienEnde } from "./serie.js";
import { tagesBeginn, tagPlus, schluesselVon } from "./zeit.js";

const SPALTEN =
  "id, ersteller_id, titel, beschreibung, ort, beginn, ende, ganztags," +
  " kategorie_id, serie_regel, serie_ende," +
  " sichtbar:termin_sichtbarkeit(profil_id)," +
  " ausnahmen:serien_ausnahme(id, original_datum, geloescht, beginn, ende, titel, ort, beschreibung)";

// ------------------------------------------------------------
//  Stammdaten
// ------------------------------------------------------------

export async function profileLaden() {
  const { data, error } = await db
    .from("profil")
    .select("id, name, farbe")
    .order("name");
  if (error) throw error;
  return data ?? [];
}

export async function kategorienLaden() {
  const { data, error } = await db
    .from("kategorie")
    .select("id, name, farbe, erstellt_von")
    .order("name");
  if (error) throw error;
  return data ?? [];
}

export async function kategorieAnlegen(name, farbe, eigeneId) {
  const { data, error } = await db
    .from("kategorie")
    .insert({ name: name.trim(), farbe, erstellt_von: eigeneId })
    .select("id, name, farbe, erstellt_von")
    .single();
  if (error) {
    if (error.code === "23505") throw new Error("Diese Kategorie gibt es schon.");
    throw error;
  }
  return data;
}

export async function kategorieLoeschen(id) {
  const { error } = await db.from("kategorie").delete().eq("id", id);
  if (error) throw error;
}

// ------------------------------------------------------------
//  Termine laden
// ------------------------------------------------------------
//  Zwei Abfragen, weil Serien anders eingegrenzt werden muessen:
//  eine woechentliche Serie von 2024 kann heute noch Vorkommen haben,
//  ihr "beginn" liegt aber weit vor dem Fenster.

export async function termineLaden(vonSchluessel, bisSchluessel) {
  const vonZeit = tagesBeginn(vonSchluessel).toISOString();
  const bisZeit = tagesBeginn(tagPlus(bisSchluessel, 1)).toISOString();

  const einzeln = db.from("termin").select(SPALTEN)
    .is("serie_regel", null)
    .lt("beginn", bisZeit)
    .gte("ende", vonZeit);

  const serien = db.from("termin").select(SPALTEN)
    .not("serie_regel", "is", null)
    .lt("beginn", bisZeit)
    .or(`serie_ende.is.null,serie_ende.gte.${vonSchluessel}`);

  const [a, b] = await Promise.all([einzeln, serien]);
  if (a.error) throw a.error;
  if (b.error) throw b.error;

  const termine = [...(a.data ?? []), ...(b.data ?? [])];

  // Serien in einzelne Vorkommen aufloesen.
  const alle = [];
  for (const termin of termine) {
    termin.sichtbarFuer = (termin.sichtbar ?? []).map((s) => s.profil_id);
    for (const v of vorkommen(termin, vonSchluessel, bisSchluessel)) alle.push(v);
  }

  alle.sort((x, y) => {
    if (x.termin.ganztags !== y.termin.ganztags) return x.termin.ganztags ? -1 : 1;
    return x.beginn - y.beginn;
  });
  return alle;
}

// Vorkommen nach Tagen sortieren. Mehrtaegige Termine tauchen an
// jedem betroffenen Tag auf.
export function nachTagen(vorkommenListe, tagesSchluessel) {
  const karte = new Map(tagesSchluessel.map((s) => [s, []]));
  for (const v of vorkommenListe) {
    const von = schluesselVon(v.beginn);
    // Ein Termin, der genau um Mitternacht endet, gehoert noch zum Vortag.
    const bis = schluesselVon(new Date(Math.max(v.ende.getTime() - 1, v.beginn.getTime())));
    for (let s = von; s <= bis; s = tagPlus(s, 1)) {
      if (karte.has(s)) karte.get(s).push(v);
      if (s > tagesSchluessel.at(-1)) break;
    }
  }
  return karte;
}

// ------------------------------------------------------------
//  Termine schreiben
// ------------------------------------------------------------

export async function terminAnlegen(felder, sichtbarFuer) {
  const { data, error } = await db
    .from("termin")
    .insert(baueFelder(felder))
    .select("id")
    .single();
  if (error) throw error;

  await sichtbarkeitSetzen(data.id, sichtbarFuer);
  return data.id;
}

export async function terminAendern(id, felder, sichtbarFuer) {
  const { error } = await db.from("termin").update(baueFelder(felder)).eq("id", id);
  if (error) throw error;
  if (sichtbarFuer) await sichtbarkeitSetzen(id, sichtbarFuer);
}

export async function terminLoeschen(id) {
  const { error } = await db.from("termin").delete().eq("id", id);
  if (error) throw error;
}

function baueFelder(f) {
  const felder = {
    titel: f.titel.trim(),
    beschreibung: f.beschreibung?.trim() || null,
    ort: f.ort?.trim() || null,
    beginn: f.beginn.toISOString(),
    ende: f.ende.toISOString(),
    ganztags: Boolean(f.ganztags),
    kategorie_id: f.kategorie_id || null,
    serie_regel: f.serie_regel || null,
    serie_ende: null,
  };
  if (f.ersteller_id) felder.ersteller_id = f.ersteller_id;
  if (felder.serie_regel) {
    felder.serie_ende = serienEnde(schluesselVon(f.beginn), felder.serie_regel);
  }
  return felder;
}

async function sichtbarkeitSetzen(terminId, profilIds) {
  const liste = [...new Set(profilIds ?? [])];

  if (liste.length) {
    const { error } = await db.from("termin_sichtbarkeit").upsert(
      liste.map((profil_id) => ({ termin_id: terminId, profil_id })),
      { onConflict: "termin_id,profil_id", ignoreDuplicates: true },
    );
    if (error) throw error;

    // Erst danach entfernen, was nicht mehr dazugehoert - so ist der
    // Termin nie zwischendurch fuer alle unsichtbar.
    const { error: wegFehler } = await db
      .from("termin_sichtbarkeit")
      .delete()
      .eq("termin_id", terminId)
      .not("profil_id", "in", `(${liste.join(",")})`);
    if (wegFehler) throw wegFehler;
  } else {
    const { error } = await db.from("termin_sichtbarkeit").delete().eq("termin_id", terminId);
    if (error) throw error;
  }
}

// ------------------------------------------------------------
//  Einzelne Vorkommen einer Serie
// ------------------------------------------------------------

export async function vorkommenLoeschen(terminId, originalDatum) {
  const { error } = await db.from("serien_ausnahme").upsert(
    { termin_id: terminId, original_datum: originalDatum, geloescht: true,
      beginn: null, ende: null, titel: null, ort: null, beschreibung: null },
    { onConflict: "termin_id,original_datum" },
  );
  if (error) throw error;
}

export async function vorkommenAendern(terminId, originalDatum, felder) {
  const { error } = await db.from("serien_ausnahme").upsert(
    {
      termin_id: terminId,
      original_datum: originalDatum,
      geloescht: false,
      beginn: felder.beginn.toISOString(),
      ende: felder.ende.toISOString(),
      titel: felder.titel?.trim() || null,
      ort: felder.ort?.trim() || null,
      beschreibung: felder.beschreibung?.trim() || null,
    },
    { onConflict: "termin_id,original_datum" },
  );
  if (error) throw error;
}

// ------------------------------------------------------------
//  Synchronisierung
// ------------------------------------------------------------
//  Meldet jede Aenderung, die den angemeldeten Nutzer betrifft.
//  Uebertragen wird bewusst nichts Inhaltliches - die App laedt
//  danach einfach den sichtbaren Zeitraum neu.

export function aufAenderungenHoeren(rueckruf) {
  const kanal = db.channel("kalender-aenderungen");
  for (const tabelle of ["termin", "termin_sichtbarkeit", "serien_ausnahme"]) {
    kanal.on("postgres_changes", { event: "*", schema: "public", table: tabelle }, rueckruf);
  }
  kanal.subscribe();
  return () => db.removeChannel(kanal);
}
