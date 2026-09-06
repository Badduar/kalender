// Anmelden, Abmelden, Registrieren und die Frage "wer bin ich".

import { db } from "./supabase.js";
import { SUPABASE_URL, SUPABASE_KEY } from "./konfig.js";

export async function aktuelleSitzung() {
  const { data } = await db.auth.getSession();
  return data.session ?? null;
}

export async function anmelden(email, passwort) {
  const { error } = await db.auth.signInWithPassword({
    email: String(email).trim().toLowerCase(),
    password: passwort,
  });
  if (error) {
    // Supabase meldet hier absichtlich nicht, ob die E-Mail existiert.
    throw new Error("E-Mail-Adresse oder Passwort stimmt nicht.");
  }
}

export async function abmelden() {
  await db.auth.signOut();
}

// Registrierung laeuft ueber die Edge Function, weil nur sie den
// Einladungscode pruefen kann. Direktes signUp ist im Projekt abgeschaltet.
export async function registrieren({ email, passwort, name, farbe, code }) {
  let antwort;
  try {
    antwort = await fetch(`${SUPABASE_URL}/functions/v1/registrieren`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: SUPABASE_KEY },
      body: JSON.stringify({ email, passwort, name, farbe, code }),
    });
  } catch {
    throw new Error("Keine Verbindung zum Server. Internetverbindung prüfen.");
  }

  const inhalt = await antwort.json().catch(() => ({}));
  if (!antwort.ok) {
    throw new Error(inhalt.fehler ?? "Die Registrierung hat nicht geklappt.");
  }
  return inhalt;
}

// Das eigene Profil inklusive Name und Farbe.
export async function eigenesProfil() {
  const sitzung = await aktuelleSitzung();
  if (!sitzung) return null;

  const { data, error } = await db
    .from("profil")
    .select("id, name, farbe, freigeschaltet, nur_frei_gebucht")
    .eq("id", sitzung.user.id)
    .maybeSingle();

  if (error) throw error;
  return data;
}

// Auf geschuetzten Seiten aufrufen: schickt ohne Sitzung zurueck zur Anmeldung.
export async function verlangeAnmeldung() {
  const sitzung = await aktuelleSitzung();
  if (!sitzung) {
    location.replace("index.html");
    return null;
  }
  return sitzung;
}
