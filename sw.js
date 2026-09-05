// ============================================================
//  Service Worker
// ============================================================
//  Legt nur das Geruest der App in den Zwischenspeicher (HTML, CSS, JS,
//  Symbole). Termine kommen IMMER frisch aus dem Netz - ein Kalender,
//  der veraltete Termine anzeigt, waere schlimmer als gar keiner.
// ============================================================

const CACHE = "kalender-v2";

const GERUEST = [
  "./",
  "./index.html",
  "./kalender.html",
  "./manifest.webmanifest",
  "./css/stil.css",
  "./js/app.js",
  "./js/auth.js",
  "./js/daten.js",
  "./js/darstellung.js",
  "./js/ics.js",
  "./js/konfig.js",
  "./js/serie.js",
  "./js/supabase.js",
  "./js/termin_dialog.js",
  "./js/zeit.js",
  "./js/ansicht_monat.js",
  "./js/ansicht_woche.js",
  "./js/ansicht_tag.js",
  "./icons/symbol.svg",
  "./icons/symbol-maskiert.svg",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE)
      // Einzeln, damit eine fehlende Datei nicht die ganze Installation kippt.
      .then((cache) => Promise.allSettled(GERUEST.map((pfad) => cache.add(pfad))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((namen) => Promise.all(namen.filter((n) => n !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const anfrage = e.request;
  if (anfrage.method !== "GET") return;

  const adresse = new URL(anfrage.url);

  // Alles, was nicht zur App-Datei-Sammlung gehoert - vor allem Supabase -
  // geht unangetastet ins Netz.
  if (adresse.origin !== self.location.origin) return;

  // Zuerst das Netz fragen, damit Aenderungen sofort ankommen.
  // Nur wenn es nicht erreichbar ist, den Zwischenspeicher nehmen.
  //
  // Wichtig: "no-cache" erzwingt eine Rueckfrage beim Server. Ohne das
  // wuerde das fetch hier selbst aus dem HTTP-Zwischenspeicher des
  // Browsers bedient - "Netz zuerst" waere dann nur dem Namen nach wahr
  // und neue Programmstaende kaemen verspaetet an. Unveraenderte Dateien
  // beantwortet der Server weiterhin billig mit 304.
  e.respondWith(
    fetch(anfrage.url, { cache: "no-cache", credentials: "same-origin" })
      .then((antwort) => {
        if (antwort.ok) {
          const kopie = antwort.clone();
          caches.open(CACHE).then((cache) => cache.put(anfrage, kopie));
        }
        return antwort;
      })
      .catch(async () => {
        const gespeichert = await caches.match(anfrage);
        if (gespeichert) return gespeichert;
        if (anfrage.mode === "navigate") {
          const geruest = await caches.match("./kalender.html");
          if (geruest) return geruest;
        }
        return new Response("Offline", { status: 503, statusText: "Offline" });
      }),
  );
});
