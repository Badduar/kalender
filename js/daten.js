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

// Text, der anstelle des Titels steht, wenn jemand sein Profil auf
// "nur Frei/Gebucht" gestellt hat.
export const VERDECKT_TITEL = "Belegt";

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
//  Geladen wird ueber eine Datenbankfunktion, nicht ueber die Tabelle.
//  Nur so lassen sich einzelne Felder verbergen: Zugriffsregeln wirken
//  zeilenweise, nicht spaltenweise. Der direkte Lesezugriff auf
//  "termin" ist dem Client deshalb entzogen.

export async function termineLaden(vonSchluessel, bisSchluessel) {
  const { data, error } = await db.rpc("termine_im_zeitraum", {
    p_von: vonSchluessel,
    p_bis: bisSchluessel,
  });
  if (error) throw error;

  const alle = [];
  for (const termin of aufbereiten(data)) {
    for (const v of vorkommen(termin, vonSchluessel, bisSchluessel)) alle.push(v);
  }

  alle.sort((x, y) => {
    if (x.termin.ganztags !== y.termin.ganztags) return x.termin.ganztags ? -1 : 1;
    return x.beginn - y.beginn;
  });
  return alle;
}

// Alle Termine ohne Zeitraum - fuer den ICS-Export.
export async function alleTermineLaden() {
  const { data, error } = await db.rpc("termine_im_zeitraum", {
    p_von: null, p_bis: null,
  });
  if (error) throw error;
  return aufbereiten(data);
}

// Verdeckte Termine kommen ohne Titel zurueck. Der Ersatztext wird
// hier gesetzt, damit die Anzeige ihn nicht jedes Mal erraten muss.
function aufbereiten(zeilen) {
  for (const termin of zeilen ?? []) {
    termin.sichtbarFuer = termin.sichtbar_fuer ?? [];
    if (termin.verdeckt) termin.titel = VERDECKT_TITEL;
  }
  return zeilen ?? [];
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
  // Die Kennung entsteht hier, nicht in der Datenbank: der Client darf
  // "termin" nicht mehr lesen, also kann er sie auch nicht zurueckbekommen.
  const id = crypto.randomUUID();

  const { error } = await db.from("termin").insert({ id, ...baueFelder(felder) });
  if (error) throw error;

  await sichtbarkeitSetzen(id, sichtbarFuer);
  return id;
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
//  Uebertragen wird nur ein Zeitstempel aus der Tabelle "aenderung",
//  kein Termininhalt. Frueher hing das an "termin" selbst - damit ging
//  bei jeder Aenderung die ganze Zeile samt Titel an alle Berechtigten,
//  was die Maskierung verdeckter Termine ausgehebelt haette.
//
//  Der Preis: auch Aenderungen, die einen nichts angehen, loesen ein
//  Nachladen aus. Bei einem Familienkalender faellt das nicht auf.

export function aufAenderungenHoeren(rueckruf) {
  const kanal = db.channel("kalender-aenderungen");
  kanal.on(
    "postgres_changes",
    { event: "*", schema: "public", table: "aenderung" },
    rueckruf,
  );
  kanal.subscribe();
  return () => db.removeChannel(kanal);
}

// ------------------------------------------------------------
//  Eigenes Profil
// ------------------------------------------------------------

// Stellt den ganzen eigenen Kalender auf "nur Frei/Gebucht" um.
export async function nurFreiGebuchtSetzen(eigeneId, an) {
  const { error } = await db
    .from("profil")
    .update({ nur_frei_gebucht: Boolean(an) })
    .eq("id", eigeneId);
  if (error) throw error;
}
