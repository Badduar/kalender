// ============================================================
//  Erinnerungen auf dieses Geraet
// ============================================================
//  Meldet das Geraet beim Push-Dienst des Browsers an und legt das
//  Abo in der Datenbank ab. Verschickt wird spaeter vom Server.
//
//  Wichtig fuer iPhone und iPad: Push funktioniert dort NUR, wenn der
//  Kalender ueber "Zum Home-Bildschirm" installiert wurde. Aus einem
//  Safari-Tab heraus gibt es kein Abo - das ist eine Vorgabe von
//  Apple, kein Fehler der App.
// ============================================================

import { db } from "./supabase.js";
import { VAPID_OEFFENTLICH } from "./konfig.js";

// base64url -> Uint8Array, das Format erwartet pushManager.subscribe
function schluesselBytes(base64url) {
  const rand = "=".repeat((4 - (base64url.length % 4)) % 4);
  const roh = atob((base64url + rand).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(roh, (z) => z.charCodeAt(0));
}

// Laeuft die App als installierte App (und nicht im Browser-Tab)?
export function alsAppGestartet() {
  return window.matchMedia("(display-mode: standalone)").matches
    || window.navigator.standalone === true;
}

export function istApple() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

// Was auf diesem Geraet moeglich ist - fuer eine ehrliche Anzeige im Menue.
export function pushLage() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    return { moeglich: false, grund: "Dieser Browser kann keine Erinnerungen empfangen." };
  }
  // Beim lokalen Testen wird der Service Worker absichtlich wieder
  // entfernt (sonst bekommt man alte Programmstaende serviert) - ein
  // Push-Abo wuerde dort beim naechsten Laden mit verschwinden.
  if (location.protocol !== "https:") {
    return {
      moeglich: false,
      grund: "Erinnerungen gibt es nur über die veröffentlichte Adresse, nicht beim lokalen Testen.",
    };
  }
  if (istApple() && !alsAppGestartet()) {
    return {
      moeglich: false,
      grund: "Auf iPhone und iPad musst du den Kalender zuerst über „Teilen → Zum Home-Bildschirm“ installieren. "
           + "Aus dem Safari-Tab heraus lässt Apple keine Erinnerungen zu.",
    };
  }
  if (Notification.permission === "denied") {
    return {
      moeglich: false,
      grund: "Benachrichtigungen sind für diese Seite gesperrt. Das lässt sich nur in den Browser-Einstellungen wieder ändern.",
    };
  }
  return { moeglich: true, grund: null };
}

async function arbeiter() {
  const reg = await navigator.serviceWorker.getRegistration();
  return reg ?? await navigator.serviceWorker.register("sw.js");
}

// Ist dieses Geraet schon angemeldet?
export async function istAngemeldet() {
  if (!("serviceWorker" in navigator)) return false;
  const reg = await navigator.serviceWorker.getRegistration();
  const abo = await reg?.pushManager?.getSubscription();
  return Boolean(abo);
}

function geraeteName() {
  const ua = navigator.userAgent;
  if (/iPad/.test(ua)) return "iPad";
  if (/iPhone/.test(ua)) return "iPhone";
  if (/Android/.test(ua)) return "Android-Gerät";
  if (/Windows/.test(ua)) return "Windows-Rechner";
  if (/Mac/.test(ua)) return "Mac";
  return "Gerät";
}

export async function anmelden(profilId) {
  const lage = pushLage();
  if (!lage.moeglich) throw new Error(lage.grund);

  // Muss aus einem Klick heraus geschehen, sonst lehnen Browser ab.
  const erlaubnis = await Notification.requestPermission();
  if (erlaubnis !== "granted") {
    throw new Error("Ohne erlaubte Benachrichtigungen geht es nicht.");
  }

  const reg = await arbeiter();
  await navigator.serviceWorker.ready;

  const abo = await reg.pushManager.getSubscription()
    ?? await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: schluesselBytes(VAPID_OEFFENTLICH),
    });

  const daten = abo.toJSON();
  const { error } = await db.from("push_geraet").upsert({
    profil_id: profilId,
    endpunkt: daten.endpoint,
    p256dh: daten.keys.p256dh,
    auth: daten.keys.auth,
    bezeichnung: geraeteName(),
  }, { onConflict: "endpunkt" });

  if (error) {
    // Nicht das halb fertige Abo stehen lassen.
    await abo.unsubscribe().catch(() => {});
    throw error;
  }
  return true;
}

export async function abmelden() {
  const reg = await navigator.serviceWorker.getRegistration();
  const abo = await reg?.pushManager?.getSubscription();
  if (!abo) return;

  const { endpoint } = abo.toJSON();
  await db.from("push_geraet").delete().eq("endpunkt", endpoint);
  await abo.unsubscribe().catch(() => {});
}
