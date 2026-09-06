// ============================================================
//  Edge Function "erinnerungen"
// ============================================================
//  Wird vom Zeitplan (pg_cron) alle paar Minuten aufgerufen und
//  verschickt faellige Erinnerungen als Web Push.
//
//  Die Serienlogik wird NICHT nachgebaut, sondern direkt aus der
//  veroeffentlichten App geladen. Damit rechnet der Versand exakt so
//  wie die Anzeige im Browser - eine zweite, abweichende Fassung der
//  Wiederholungsregeln kann es gar nicht erst geben.
//  Nebenwirkung: Aendert sich serie.js, folgt der Versand beim
//  naechsten Kaltstart automatisch mit.
//
//  Ohne JWT-Pruefung, dafuer mit eigenem Zugangswort im Kopf
//  "x-zeitplan-wort" - der Aufruf kommt aus der Datenbank, nicht
//  von einem angemeldeten Nutzer.
// ============================================================

import { createClient } from "jsr:@supabase/supabase-js@2";
import * as webpush from "jsr:@negrel/webpush@0.5.0";
const APP = "https://badduar.github.io/kalender/js";
const { vorkommen } = await import(`${APP}/serie.js`);
const { tagPlus, uhrzeit, heuteSchluessel } = await import(`${APP}/zeit.js`);

// Wie weit vor und zurueck nach Vorkommen gesucht wird. Drei Stunden
// Vorlauf koennen ueber Mitternacht reichen, deshalb je ein Tag Rand.
const TAGE_ZURUECK = 1;
const TAGE_VORAUS = 2;

// Alarme, deren Termin schon laenger vorbei ist, werden verworfen.
// Sonst kaeme nach einer laengeren Stoerung ein Schwall alter Meldungen.
const VERFALL_MINUTEN = 30;

function antwort(inhalt: unknown, status = 200) {
  return new Response(JSON.stringify(inhalt), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

Deno.serve(async (req: Request) => {
  const dienst = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  // ---- Zugang pruefen ----
  const { data: wort, error: wortFehler } = await dienst.rpc("geheimnis_lesen", {
    p_name: "zeitplan_wort",
  });
  if (wortFehler || !wort) {
    console.error("Zugangswort nicht lesbar:", wortFehler?.message);
    return antwort({ fehler: "Serverfehler" }, 500);
  }
  if (req.headers.get("x-zeitplan-wort") !== wort) {
    return antwort({ fehler: "Nicht berechtigt" }, 401);
  }

  // ---- Schluessel laden ----
  const { data: schluesselText, error: schluesselFehler } = await dienst.rpc(
    "geheimnis_lesen",
    { p_name: "vapid_schluessel" },
  );
  if (schluesselFehler || !schluesselText) {
    console.error("VAPID-Schluessel fehlt:", schluesselFehler?.message);
    return antwort({ fehler: "Serverfehler" }, 500);
  }

  const vapidKeys = await webpush.importVapidKeys(JSON.parse(schluesselText));
  const server = await webpush.ApplicationServer.new({
    contactInformation: "mailto:kalender@badduar.github.io",
    vapidKeys,
  });

  // ---- Termine mit Erinnerung holen ----
  const heute = heuteSchluessel();
  const von = tagPlus(heute, -TAGE_ZURUECK);
  const bis = tagPlus(heute, TAGE_VORAUS);

  const { data: termine, error: terminFehler } = await dienst
    .from("termin")
    .select(
      "id, ersteller_id, titel, ort, beginn, ende, ganztags, serie_regel," +
      " serie_ende, erinnerung_minuten," +
      " ausnahmen:serien_ausnahme(original_datum, geloescht, beginn, ende, titel, ort)",
    )
    .not("erinnerung_minuten", "is", null);

  if (terminFehler) {
    console.error("Termine:", terminFehler.message);
    return antwort({ fehler: "Serverfehler" }, 500);
  }

  const jetzt = Date.now();
  let geprueft = 0;
  let verschickt = 0;
  let geraeteEntfernt = 0;

  for (const termin of termine ?? []) {
    for (const v of vorkommen(termin, von, bis)) {
      geprueft += 1;

      const alarm = v.beginn.getTime() - termin.erinnerung_minuten * 60_000;
      if (alarm > jetzt) continue;                                    // noch zu frueh
      if (v.beginn.getTime() < jetzt - VERFALL_MINUTEN * 60_000) continue; // zu alt

      // Erst vormerken, dann senden: laufen zwei Durchgaenge gleichzeitig,
      // gewinnt genau einer. Ohne das gaebe es Doppelmeldungen.
      const { data: vormerkung, error: merkFehler } = await dienst
        .from("erinnerung_gesendet")
        .insert({ termin_id: termin.id, vorkommen: v.schluessel })
        .select("termin_id");

      if (merkFehler) continue;          // 23505 = schon verschickt
      if (!vormerkung?.length) continue;

      const { data: geraete } = await dienst
        .from("push_geraet")
        .select("id, endpunkt, p256dh, auth")
        .eq("profil_id", termin.ersteller_id);

      if (!geraete?.length) continue;

      const wann = termin.ganztags
        ? "heute, ganztägig"
        : `um ${uhrzeit(v.beginn)} Uhr`;
      const nachricht = JSON.stringify({
        titel: v.termin.titel ?? "Termin",
        text: [wann, v.termin.ort].filter(Boolean).join(" · "),
        datum: v.schluessel,
      });

      for (const geraet of geraete) {
        try {
          await server
            .subscribe({
              endpoint: geraet.endpunkt,
              keys: { p256dh: geraet.p256dh, auth: geraet.auth },
            })
            .pushTextMessage(nachricht, { urgency: webpush.Urgency.High, ttl: 3600 });

          verschickt += 1;
          await dienst.from("push_geraet")
            .update({ zuletzt_ok: new Date().toISOString(), fehler_zaehler: 0 })
            .eq("id", geraet.id);
        } catch (ex) {
          // 404/410 heisst: das Geraet hat das Abo weggeworfen.
          const status = (ex as { response?: { status?: number } })?.response?.status;
          if (status === 404 || status === 410) {
            await dienst.from("push_geraet").delete().eq("id", geraet.id);
            geraeteEntfernt += 1;
          } else {
            console.error("Push fehlgeschlagen:", geraet.id, String(ex));
            await dienst.rpc("push_fehler_zaehlen", { p_geraet: geraet.id })
              .then(() => {}, () => {});
          }
        }
      }
    }
  }

  // Alte Vormerkungen wegraeumen, sonst waechst die Tabelle ewig.
  await dienst
    .from("erinnerung_gesendet")
    .delete()
    .lt("gesendet_am", new Date(jetzt - 30 * 86_400_000).toISOString());

  return antwort({ ok: true, geprueft, verschickt, geraeteEntfernt });
});
