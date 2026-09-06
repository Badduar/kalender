// ============================================================
//  Edge Function "registrieren"
// ============================================================
//  Der einzige Weg, ein Konto anzulegen. Prueft den Einladungscode
//  und legt das Konto danach mit Dienst-Rechten an.
//
//  Die Funktion laeuft bewusst OHNE JWT-Pruefung (verify_jwt = false),
//  weil sie von noch nicht angemeldeten Personen aufgerufen wird.
//  Die Zugangskontrolle macht der Einladungscode.
//
//  Nach dem Anlegen wird das Profil freigeschaltet. Genau daran
//  haengt der Zugang: ein Konto, das an dieser Funktion vorbei
//  entstanden ist, bleibt ohne Freischaltung und sieht nichts.
//  Die Einstellung "offene Registrierung" im Dashboard ist damit
//  nur noch die zweite Verteidigungslinie, nicht die einzige.
// ============================================================

import { createClient } from "jsr:@supabase/supabase-js@2";

const MIN_PASSWORT = 8;

function kopfzeilen(ursprung: string | null): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": ursprung ?? "*",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
    "Content-Type": "application/json; charset=utf-8",
  };
}

function antwort(inhalt: unknown, status: number, ursprung: string | null) {
  return new Response(JSON.stringify(inhalt), {
    status,
    headers: kopfzeilen(ursprung),
  });
}

function text(wert: unknown): string {
  return typeof wert === "string" ? wert.trim() : "";
}

Deno.serve(async (req: Request) => {
  const ursprung = req.headers.get("origin");

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: kopfzeilen(ursprung) });
  }
  if (req.method !== "POST") {
    return antwort({ fehler: "Nur POST erlaubt." }, 405, ursprung);
  }

  let eingabe: Record<string, unknown>;
  try {
    eingabe = await req.json();
  } catch {
    return antwort({ fehler: "Die Anfrage war unlesbar." }, 400, ursprung);
  }

  const email = text(eingabe.email).toLowerCase();
  const passwort = typeof eingabe.passwort === "string" ? eingabe.passwort : "";
  const name = text(eingabe.name);
  const farbe = text(eingabe.farbe);
  const code = text(eingabe.code);

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return antwort(
      { fehler: "Bitte eine gültige E-Mail-Adresse angeben." },
      400,
      ursprung,
    );
  }
  if (passwort.length < MIN_PASSWORT) {
    return antwort(
      { fehler: `Das Passwort braucht mindestens ${MIN_PASSWORT} Zeichen.` },
      400,
      ursprung,
    );
  }
  if (name.length < 1 || name.length > 60) {
    return antwort(
      { fehler: "Bitte einen Namen mit 1 bis 60 Zeichen angeben." },
      400,
      ursprung,
    );
  }
  if (!code) {
    return antwort({ fehler: "Bitte den Einladungscode angeben." }, 400, ursprung);
  }

  const dienst = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  // Code pruefen und in einem Schritt hochzaehlen.
  const { data: codeGueltig, error: codeFehler } = await dienst.rpc(
    "code_verbrauchen",
    { p_code: code },
  );

  if (codeFehler) {
    console.error("code_verbrauchen:", codeFehler.message);
    return antwort(
      { fehler: "Der Einladungscode konnte gerade nicht geprüft werden." },
      500,
      ursprung,
    );
  }
  if (codeGueltig !== true) {
    // Bewusst dieselbe Meldung fuer "falsch", "abgelaufen" und "aufgebraucht",
    // damit sich ein Code nicht durch Ausprobieren eingrenzen laesst.
    return antwort(
      { fehler: "Dieser Einladungscode ist nicht (mehr) gültig." },
      403,
      ursprung,
    );
  }

  const { data: konto, error: kontoFehler } = await dienst.auth.admin.createUser({
    email,
    password: passwort,
    // Der Einladungscode ist der Nachweis - eine Bestaetigungsmail
    // waere ein zusaetzlicher Stolperstein ohne Sicherheitsgewinn.
    email_confirm: true,
    user_metadata: { name, farbe },
  });

  if (kontoFehler || !konto?.user) {
    // Nutzung zurueckgeben, damit ein Fehlversuch keinen Platz verbraucht.
    await dienst.rpc("code_zuruecknehmen", { p_code: code });

    const meldung = (kontoFehler?.message ?? "").toLowerCase();
    if (meldung.includes("already") || meldung.includes("registered")) {
      return antwort(
        { fehler: "Für diese E-Mail-Adresse gibt es bereits ein Profil." },
        409,
        ursprung,
      );
    }
    console.error("createUser:", kontoFehler?.message);
    return antwort(
      { fehler: "Das Profil konnte nicht angelegt werden." },
      500,
      ursprung,
    );
  }

  // Erst die Freischaltung macht das Profil nutzbar. Ohne sie sieht es
  // nichts und kann nichts anlegen - so bleibt ein Konto, das an dieser
  // Funktion vorbei entstanden ist, wirkungslos.
  const { error: freiFehler } = await dienst.rpc("profil_freischalten", {
    p_profil: konto.user.id,
  });

  if (freiFehler) {
    // Ohne Freischaltung waere das Konto eine leere Huelle - lieber
    // wieder entfernen, damit die E-Mail-Adresse erneut nutzbar ist.
    console.error("profil_freischalten:", freiFehler.message);
    await dienst.auth.admin.deleteUser(konto.user.id).catch(() => {});
    await dienst.rpc("code_zuruecknehmen", { p_code: code });
    return antwort(
      { fehler: "Das Profil konnte nicht freigeschaltet werden." },
      500,
      ursprung,
    );
  }

  return antwort({ ok: true, profil_id: konto.user.id }, 200, ursprung);
});
