# Kalender

Gemeinsamer Kalender für mehrere Profile. Bei jedem Termin wird einzeln
festgelegt, wer ihn sehen darf. Ansichten: Monat, Woche, Tag.

- **Oberfläche:** reines HTML/CSS/JavaScript, kein Build-Schritt
- **Server:** Supabase (Postgres + Anmeldung + Live-Synchronisierung)
- **Zeitzone:** durchgehend `Europe/Berlin`, unabhängig von der Geräteeinstellung

---

**Läuft unter: https://badduar.github.io/kalender/**

---

## Wer hereinkommt

Der Zugang hängt **nicht** an einer Einstellung im Supabase-Dashboard, sondern
an einem Kennzeichen in der Datenbank: `profil.freigeschaltet`. Gesetzt wird es
allein von der Edge Function `registrieren`, und nur nach gültigem
Einladungscode.

Wer sich auf anderem Weg ein Konto verschafft, kann sich zwar anmelden, aber:

| | freigeschaltet | nicht freigeschaltet |
|---|---|---|
| Eigenes Profil sehen | ✅ | ✅ (damit die App es erklären kann) |
| Andere Profile sehen | ✅ | ❌ |
| Termine sehen | nur freigegebene | ❌ keine |
| Kategorien sehen | ✅ | ❌ |
| Irgendetwas anlegen | ✅ | ❌ |
| Sich selbst freischalten | — | ❌ (403) |

Die App zeigt solchen Konten eine Erklärung statt eines leeren Kalenders.

> **Warum nicht einfach der Dashboard-Schalter?** Weil sich von außen nicht
> zuverlässig prüfen lässt, ob er steht — ein versehentlich umgelegter Haken
> wäre ein stiller Totalausfall. Der Schalter (*Authentication → Sign In /
> Providers*, „Allow new users to sign up") ist weiterhin sinnvoll, aber nur
> noch die zweite Verteidigungslinie.
>
> Aktuellen Stand abfragen — im Browser auf der Kalenderseite (F12 → Konsole):
> ```js
> (await (await fetch("https://caflqjhsapbqvmuvffir.supabase.co/auth/v1/settings?apikey=sb_publishable_k4SvIx3K3j0tBzgi8bNAvQ_smBZvw9o")).json()).disable_signup
> ```
> `true` = Selbstregistrierung gesperrt, `false` = offen.

---

## Änderungen veröffentlichen

Das Repository ist bereits eingerichtet (`Badduar/kalender`, GitHub Pages aus
`main` / `/ (root)`). Nach einer Änderung genügt:

```bash
cd "C:\Users\Daniel\Documents\Claude Arbeitsordner\kalender"
git add .
git commit -m "Kurze Beschreibung der Änderung"
git push
```

GitHub braucht danach ein bis zwei Minuten, bis die Seite neu gebaut ist.

> Das Repository ist öffentlich — bei kostenlosen Konten verlangt GitHub Pages
> das. Der Schlüssel in `js/konfig.js` ist der dafür vorgesehene öffentliche
> Schlüssel; was damit sichtbar wird, entscheidet allein die Zugriffskontrolle
> in der Datenbank. Der `service_role`-Schlüssel steht nirgends im Projekt und
> darf dort auch nie hinein. **Einladungscodes gehören ebenfalls nicht in
> Dateien** — sie stehen nur in der Datenbank.

## Einladungscode weitergeben

**Codes stehen bewusst nirgends im Quelltext** — dieses Repository ist
öffentlich, ein Code darin wäre für jeden lesbar und damit wertlos. Sie werden
im [Supabase-SQL-Editor](https://supabase.com/dashboard/project/caflqjhsapbqvmuvffir/sql/new)
angelegt:

```sql
insert into public.einladungscode (code, max_nutzungen, bemerkung)
values ('AUSGEDACHTER-CODE', 5, 'Für die Familie');
```

Übersicht, wer wie viel verbraucht hat:

```sql
select code, aktiv, benutzt, max_nutzungen, bemerkung from public.einladungscode;
```

Sperren, sobald alle ihr Profil haben:

```sql
update public.einladungscode set aktiv = false where code = 'AUSGEDACHTER-CODE';
```

Den Code selbst gibst du persönlich weiter — per Nachricht, nicht über das
Repository.

---

## Lokal ausprobieren

```bash
python "C:\Users\Daniel\Documents\Claude Arbeitsordner\kalender\testserver.py"
```

Dann `http://localhost:8123` öffnen. Der Testserver unterbindet das
Zwischenspeichern, damit Änderungen sofort wirken. Auf `localhost` wird
absichtlich **kein** Service Worker registriert — sonst bekommt man beim
Entwickeln alte Programmstände serviert.

---

## Prüfungen

```bash
node "C:\Users\Daniel\Documents\Claude Arbeitsordner\kalender\pruefungen.mjs"
```

41 Prüfungen zu Zeitrechnung und Serienterminen — ohne Netz und ohne Datenbank.
Sie decken vor allem die Zeitumstellung ab (der 28.03.2027 hat nur 23 Stunden,
und ein wöchentlicher 9-Uhr-Termin muss trotzdem um 9 Uhr bleiben). Sinnvoll ist
ein zweiter Durchlauf mit fremder Zeitzone — das Ergebnis muss gleich sein:

```bash
$env:TZ="Asia/Tokyo"; node "C:\Users\Daniel\Documents\Claude Arbeitsordner\kalender\pruefungen.mjs"
```

## Wie die Sichtbarkeit abgesichert ist

Nicht die Oberfläche entscheidet, wer was sieht, sondern die Datenbank
(Row Level Security). Wer nicht freigeschaltet ist, bekommt einen Termin auch
dann nicht, wenn er die Schnittstelle direkt anspricht — er taucht in der
Antwort schlicht nicht auf.

| Wer | darf |
|---|---|
| Ersteller | sehen, ändern, löschen, Freigaben setzen |
| Für den Termin Freigegebene | nur sehen |
| Alle anderen | gar nichts — der Termin existiert für sie nicht |

Zwei Feinheiten:

- Wer einen fremden Termin sehen darf, erfährt **nicht**, wer ihn sonst noch
  sieht. Der Dialog zeigt deshalb keine geratene Häkchenliste, sondern nur die
  eigene Freigabe.
- Namen und Farben der Profile sind für **freigeschaltete** Angemeldete lesbar —
  sonst ließe sich die Freigabeliste nicht bedienen. E-Mail-Adressen sind es
  nicht, und für nicht freigeschaltete Konten ist auch die Namensliste zu.

Die Tabelle `einladungscode` hat bewusst **keine** Zugriffsregel und ist damit
für alle Clients gesperrt; nur die Edge Function kommt heran.

---

## Aufbau

```
index.html          Anmelden und Registrieren
kalender.html       Hauptansicht mit Dialogen
testserver.py       Testserver für die Entwicklung
pruefungen.mjs      Prüfungen für Zeit- und Serienlogik
css/stil.css        Gestaltung, hell und dunkel
js/
  konfig.js         Adresse und öffentlicher Schlüssel
  supabase.js       Verbindung
  auth.js           Anmelden, Abmelden, Registrieren
  daten.js          Termine laden und speichern, Live-Aktualisierung
  zeit.js           Datum und Uhrzeit in Europe/Berlin
  serie.js          Serientermine (RRULE-Teilmenge) ausklappen
  darstellung.js    Farben, Termin-Plättchen, Überlappungen
  ansicht_monat.js  Monatsraster
  ansicht_woche.js  Zeitraster (Woche und Tag)
  ansicht_tag.js    Tagesansicht
  termin_dialog.js  Anlegen und Bearbeiten
  ics.js            Import und Export von .ics-Dateien
  app.js            Zustand, Navigation, Start
supabase/
  migrationen/      SQL, in dieser Reihenfolge einspielen
  funktionen/       Edge Function "registrieren"
```

## Bedienung

| Taste | Wirkung |
|---|---|
| ← / → | vor- und zurückblättern |
| `M` / `W` / `T` | Monat, Woche, Tag |
| `H` | zu heute |
| `N` | neuer Termin |

Ansicht und Datum stehen in der Adresszeile (`#woche/2026-09-04`) — Lesezeichen
und der Zurück-Knopf funktionieren also.

## Serientermine

Gespeichert wird nur die Regel, die einzelnen Vorkommen entstehen im Browser.
Gerechnet wird auf der Berliner Wanduhrzeit: ein wöchentlicher 9-Uhr-Termin
bleibt auch nach der Zeitumstellung ein 9-Uhr-Termin.

Beim Ändern oder Löschen fragt die App, ob nur dieses eine Vorkommen oder die
ganze Serie gemeint ist. „Nur dieser Termin" übernimmt Titel, Ort, Zeit und
Notiz; Kategorie, Sichtbarkeit und Wiederholung gelten immer für die ganze Serie.

Bearbeitet man die ganze Serie von einem späteren Termin aus, bleibt der
Serienanfang stehen — sonst würden alle früheren Termine stillschweigend
wegfallen.

## Was noch nicht drin ist

Erinnerungen und Benachrichtigungen, Datei-Anhänge, Volltextsuche, ein
CalDAV-Abo (ICS ist Datei-Import/-Export, keine laufende Verbindung) und
Bearbeiten ohne Internetverbindung.

## Hinweis zum Supabase-Gratistarif

Projekte werden nach etwa einer Woche ohne Zugriff pausiert und müssen dann im
Dashboard von Hand wieder gestartet werden. Bei täglicher Nutzung passiert das
nicht.
