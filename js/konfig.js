// Zentrale Einstellungen.
//
// Der Schluessel unten ist der oeffentliche "publishable key". Er darf im
// Quelltext stehen: Was damit sichtbar wird, entscheidet allein die
// Row Level Security in der Datenbank. Der "service_role"-Schluessel
// gehoert dagegen NIEMALS hierher.

export const SUPABASE_URL = "https://caflqjhsapbqvmuvffir.supabase.co";
export const SUPABASE_KEY = "sb_publishable_k4SvIx3K3j0tBzgi8bNAvQ_smBZvw9o";

// Oeffentlicher Teil des VAPID-Schluesselpaars fuer Web Push.
// Gehoert wie der Schluessel oben in den Quelltext; der private Teil
// liegt im Supabase-Vault und verlaesst den Server nie.
export const VAPID_OEFFENTLICH =
  "BKdZrQpYlVExUd_y_bofoR78ke9Pyld4EmaSgQZVLysyvLDvqwFMpIzQYbEsM0hRlkGyBDRxudiQTLJVZoG2acc";

export const ZEITZONE = "Europe/Berlin";

// Auswahl der Erinnerungszeiten: 15-Minuten-Schritte bis drei Stunden.
export const ERINNERUNG_STUFEN = Array.from({ length: 12 }, (_, i) => (i + 1) * 15);
export const ERINNERUNG_STANDARD = 15;
export const STANDARD_FARBE = "#4a90d9";

// Auswahl fuer Profil- und Kategoriefarben.
export const FARBPALETTE = [
  "#3b7dd8", "#27ae60", "#c0392b", "#8e44ad",
  "#e67e22", "#16a085", "#d81b60", "#607d8b",
];
