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

82 Prüfungen zu Zeitrechnung, Serienterminen, Feiertagen und Schulferien — ohne Netz und ohne Datenbank.
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

### „Andere sehen nur belegt"

Im Menü lässt sich der eigene Kalender so einstellen, dass andere Profile nur
noch Uhrzeit und Farbe sehen — nicht Titel, Ort, Notiz oder Kategorie. Die
Kategorie ist bewusst mit dabei: „Arzt" würde verraten, worum es geht.

Das setzt der **Server** durch, nicht die Oberfläche. Zugriffsregeln wirken
zeilenweise, nicht spaltenweise — deshalb wurde dem Client das direkte Lesen von
`termin` und `serien_ausnahme` **entzogen**. Termine kommen ausschließlich über
die Funktion `termine_im_zeitraum`, die die Felder ausblendet. Ein direkter
Aufruf von `/rest/v1/termin` endet mit `403 permission denied`.

Zwei Nebenwege mussten mit:

- **Live-Synchronisierung**: Sie hing an der Tabelle `termin` und hätte bei jeder
  Änderung die ganze Zeile samt Titel verschickt. Jetzt überträgt sie nur einen
  Zeitstempel aus `aenderung` — „etwas hat sich geändert" — und der Client lädt
  neu, wobei die Maskierung greift.
- **ICS-Export**: Er las die Tabelle direkt und hätte verdeckte Titel in die
  Datei geschrieben. Er nutzt jetzt dieselbe Funktion wie die Anzeige.

Verdeckte Termine erscheinen schraffiert und heißen „Belegt".

---

## Aufbau

```
index.html          Anmelden und Registrieren
kalender.html       Hauptansicht mit Dialogen
testserver.py       Testserver für die Entwicklung
pruefungen.mjs      Prüfungen für Zeit-, Serien- und Feiertagslogik
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
  feiertage.js      Feiertage (gerechnet) und Schulferien (Tabelle)
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

Das Menü hinter dem eigenen Namen (oben rechts) enthält: Anzeige (Feiertage,
Schulferien), „Andere sehen nur belegt", Import/Export und — unter *App* —
**App aktualisieren**. Der Knopf wirft Zwischenspeicher und Service Worker weg
und lädt frisch; er hilft, wenn nach einer Veröffentlichung noch der alte Stand
angezeigt wird. Die Anmeldung bleibt dabei erhalten.

Ansicht und Datum stehen in der Adresszeile (`#woche/2026-09-04`) — Lesezeichen
und der Zurück-Knopf funktionieren also.

## Feiertage und Schulferien

Beides ist fest eingebaut und steht **nicht** in der Datenbank — es sind keine
Termine, die jemand versehentlich verschieben oder löschen könnte. Über das
Profilmenü lässt sich jedes einzeln ausblenden; die Einstellung merkt sich der
jeweilige Browser.

- **Feiertage** (die 10 gesetzlichen in Hamburg): farbig hinterlegt, mit Namen.
  Sie werden **gerechnet** — alle beweglichen hängen am Ostersonntag. Diese
  Angaben veralten nie. Ostersonntag und Pfingstsonntag fehlen bewusst: sie sind
  keine gesetzlichen Feiertage, sondern Sonntage.
- **Schulferien**: dezent als schmaler Streifen, mit Namen nur am ersten Tag.
  Sechs Wochen Sommerferien flächig einzufärben würde die Ansicht erschlagen.

⚠️ **Ferientermine müssen irgendwann verlängert werden.** Erfasst ist die
amtliche Ferienordnung bis zum **14.08.2030** (`FERIEN_BIS` in
[`js/feiertage.js`](js/feiertage.js)). Danach zeigt der Kalender einfach keine
Ferien mehr an — er wird nicht falsch, nur unvollständig. Zum Verlängern die
neuen Zeiträume unten in der Tabelle anfügen; die Quelle ist die
„Ferienordnung Hamburg" auf hamburg.de.

Die eingetragenen Daten stammen aus der amtlichen Ferienordnung der Behörde für
Schule und Berufsbildung und wurden gegen den Ferienkalender der
Kultusministerkonferenz abgeglichen.

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
