# Kalender

Gemeinsamer Kalender für mehrere Profile. Bei jedem Termin wird einzeln
festgelegt, wer ihn sehen darf. Jede Person kann mehrere eigene Kalender
führen und zwischen ihnen umschalten. Ansichten: Monat, Woche, Tag und
Übersicht.

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

## Testkonten aufräumen

Beim Entwickeln entstehen Testprofile. Die werden **gezielt** entfernt, nie
pauschal:

```sql
-- Nur Testkonten. example.com/.org/.net sind laut RFC 2606 für Tests
-- reserviert - ein echtes Familienmitglied kann so eine Adresse nicht haben.
delete from auth.users
 where email like '%@example.com'
    or email like '%@example.org'
    or email like '%@example.net';
```

> ⛔ **Niemals `delete from auth.users;` ohne Bedingung.** Daran hängt per
> Kaskade alles: Profile, Termine, Freigaben, Serien-Ausnahmen, angemeldete
> Geräte. Ein Versehen ist nicht rückgängig zu machen.

Vorher nachsehen, was getroffen würde:

```sql
select email, created_at from auth.users order by created_at;
```

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

82 Prüfungen zu Zeitrechnung, Serienterminen, Feiertagen, Schulferien und zum
Gleichlauf von Anzeige und Erinnerungsversand — ohne Netz und ohne Datenbank.
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
  ansicht_uebersicht.js  Tagesliste ohne Raster
  suche.js          Termine suchen
  kalender_verwalten.js  eigene Kalender anlegen und ändern
  termin_dialog.js  Anlegen und Bearbeiten
  feiertage.js      Feiertage (gerechnet) und Schulferien (Tabelle)
  push.js           Gerät für Erinnerungen an- und abmelden
  ics.js            Import und Export von .ics-Dateien
  app.js            Zustand, Navigation, Start
supabase/
  migrationen/      SQL, in dieser Reihenfolge einspielen
  funktionen/
    registrieren/   Konto anlegen (prüft den Einladungscode)
    erinnerungen/   verschickt fällige Erinnerungen
```

## Bedienung

| Taste | Wirkung |
|---|---|
| ← / → | vor- und zurückblättern |
| `M` / `W` / `T` | Monat, Woche, Tag |
| `Ü` | Übersicht (springt auf heute) |
| `H` | zu heute |
| `N` | neuer Termin |
| `/` | Termine suchen |

**Übersicht** zeigt die Termine eines Tages als schlichte Liste statt im Raster —
mit Uhrzeit, Ort, Notiz und eingestellter Erinnerung. Der Knopf springt immer auf
heute; mit ← → blättert man von dort weiter.

**Suchen** (Menü oder `/`) durchsucht Titel, Ort und Notiz. Mehrere Wörter müssen
alle vorkommen, die Reihenfolge ist egal. Gesucht wird zwei Jahre zurück und drei
Jahre voraus; bei Serien werden nur die nächsten und letzten drei Vorkommen
gezeigt, sonst bestünde die Liste aus hundertmal demselben Termin.

> **Verdeckte Termine sind von der Suche ausgenommen.** Wer sein Profil auf
> „andere sehen nur belegt" gestellt hat, taucht in fremden Suchergebnissen
> nicht auf — auch nicht unter „belegt". Sonst ließe sich über einen Treffer
> erschließen, worum es geht, oder man könnte sie wenigstens aufzählen. Im
> Kalender bleiben sie als „Belegt" sichtbar, nur eben nicht auffindbar.

Das Menü hinter dem eigenen Namen (oben rechts) enthält: Anzeige (Feiertage,
Schulferien), „Andere sehen nur belegt", Import/Export und — unter *App* —
**App aktualisieren**. Der Knopf wirft Zwischenspeicher und Service Worker weg
und lädt frisch; er hilft, wenn nach einer Veröffentlichung noch der alte Stand
angezeigt wird. Die Anmeldung bleibt dabei erhalten.

Ansicht und Datum stehen in der Adresszeile (`#woche/2026-09-04`) — Lesezeichen
und der Zurück-Knopf funktionieren also.

## Mehrere Kalender je Person

Neben dem ersten Kalender („Privat") lassen sich weitere anlegen — etwa
„Dienst" — und über den Umschalter in der Kopfzeile wechseln. **Ohne zweite
Anmeldung**, alles innerhalb desselben Kontos. Verwaltet werden sie im Menü
unter *Meine Kalender*: anlegen, umbenennen, Farbe ändern, entfernen.

Der aktive Kalender bestimmt zweierlei: **welche deiner Termine angezeigt
werden** und **wo neue landen**. Termine anderer Profile bleiben in jedem
Kalender sichtbar — sonst bräche einem beim Umschalten auf „Dienst" der halbe
Familienkalender weg und man verpasst etwas.

An der Sichtbarkeit ändert das nichts: Wer einen Termin sehen darf, entscheidet
weiter die Freigabe je Termin. Ein Kalender ist eine Sortierhilfe, keine
Zugriffssperre.

Zwei Feinheiten:

- **Die Farbe sagt jetzt „welcher Kalender", nicht mehr „welche Person".**
  Rangfolge: Kategorie schlägt Kalender schlägt Profilfarbe. In Woche, Tag und
  Übersicht steht der Ersteller ohnehin dabei; nur im Monatsraster geht diese
  Information verloren. Stimmt die Farben untereinander ab.
- **Kalendernamen sind Teil der Maskierung.** Wer „andere sehen nur belegt"
  gesetzt hat, gibt weder die Zuordnung eines Termins noch die Namen seiner
  Kalender preis — ein Kalender „Therapie" wäre sonst ein Leck an der
  Maskierung vorbei.

Ein Kalender, in dem noch Termine stehen, lässt sich nicht entfernen; die App
sagt das auch so. Der letzte Kalender bleibt immer bestehen.

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

## Erinnerungen aufs Handy

Je Termin einstellbar: keine Erinnerung oder 15-Minuten-Schritte bis drei
Stunden vorher, voreingestellt 15 Minuten. Die Meldung geht an den **Ersteller**
des Termins — auf alle Geräte, die er im Menü unter *Erinnerungen* angemeldet
hat. Wer den Termin nur sehen darf, bekommt keine.

### Was du je Gerät tun musst

1. Kalender unter https://badduar.github.io/kalender/ öffnen
2. Menü → *Erinnerungen* → **Auf diesem Gerät erinnern** anhaken
3. Die Nachfrage des Browsers erlauben

> ⚠️ **iPad und iPhone**: Das klappt **nur, wenn der Kalender vorher über
> „Teilen → Zum Home-Bildschirm" installiert wurde.** Aus einem Safari-Tab
> heraus lässt Apple keine Erinnerungen zu — das ist deren Vorgabe, kein Fehler
> der App. Die App sagt es dir auch, wenn es daran scheitert.
>
> Auf Android funktioniert es auch im normalen Browser-Tab.

Beim lokalen Testen sind Erinnerungen bewusst abgeschaltet, weil dort der
Service Worker absichtlich entfernt wird.

### Tagesüberblick am Morgen

Im Menü unter *Erinnerungen* lässt sich **Morgens Überblick über den Tag**
einschalten und eine Uhrzeit wählen. Dann kommt einmal am Morgen eine Meldung
mit allem, was an dem Tag ansteht — ganztägige Termine zuerst, danach nach
Uhrzeit sortiert, höchstens sechs, der Rest als „… und 3 weitere". Ein Feiertag
oder Ferienbeginn steht als eigene Zeile obendrauf. Ein Tipp auf die Meldung
öffnet die Übersicht.

- **Gezeigt wird, was du auch in der App siehst** — also auch die Termine der
  anderen. Was auf „nur belegt" steht, erscheint als „Belegt", nie mit Titel.
- **An stillen Tagen bleibt es still.** Keine Termine und kein Feiertag heißt
  keine Meldung.
- **Die Uhrzeit gilt fürs Konto, nicht fürs Gerät.** Handy und iPad bekommen
  beide eine.
- **Wanduhrzeit:** 7:00 bleibt 7:00, auch nach der Zeitumstellung.
- Wann die Meldung ankommt, entscheidet das Gerät. Android weckt Handys, die
  nachts unberührt liegen, verzögert auf — als Wecker taugt das nicht.

### Wie es innen funktioniert

`pg_cron` ruft jede Minute die Edge Function `erinnerungen` auf (über `pg_net`,
abgesichert mit einem Zugangswort aus dem Vault). Die Funktion rechnet aus,
welche Vorkommen jetzt fällig sind, sieht nach, ob für den Ersteller überhaupt
ein Gerät angemeldet ist, merkt die Erinnerung dann in `erinnerung_gesendet`
vor — **vor** dem Senden, damit zwei gleichzeitige Durchgänge nicht beide
schicken — und verschickt sie. Abos, die der Push-Dienst mit 404/410 ablehnt,
werden automatisch entfernt.

Die Geräteprüfung steht **vor** der Vormerkung, und das mit Absicht: andernfalls
verbraucht eine Erinnerung ohne Empfänger ihren Platz. Meldet man das Handy
eine Minute später an, käme sie nie, obwohl sie noch fällig wäre.

Der private VAPID-Schlüssel und das Zugangswort liegen im Supabase-Vault, nicht
im Quelltext. Nur der öffentliche Schlüssel steht in `js/konfig.js`.

Für den Tagesüberblick musste die Frage „wer darf was sehen?" serverfähig
werden. Sie hing überall an `auth.uid()` — also daran, wer gerade angemeldet
ist; der Versandserver ist aber niemand. Migration 019 gibt jeder Prüfung eine
Fassung mit ausdrücklichem Leser (`…_fuer(p_leser, …)`) und macht die bisherige
zur dünnen Hülle, die `auth.uid()` einsetzt. Es bleibt **eine** Maskierungs-
logik. Zwei Fassungen könnten auseinanderlaufen, und dann verriete die
Morgenmeldung eines Tages genau das, was die App als „Belegt" verbirgt.
`termine_im_zeitraum_fuer` darf nur `service_role` aufrufen — sonst könnte sich
ein Angemeldeter einen fremden Leser eintragen und alles mitlesen.

**Warum liegen `zeit.js`, `serie.js` und `feiertage.js` doppelt herum?** Der
Edge-Runtime lässt keine Importe von fremden Adressen zu (statisch wie
dynamisch, beides geprüft), deshalb bekommt die Funktion Kopien unter
`supabase/funktionen/erinnerungen/`. Damit sie nicht auseinanderlaufen,
vergleicht `pruefungen.mjs` beide Fassungen: Serien über 40 Regel- und
Zeitraum-Kombinationen auf identische Vorkommen, Feiertage und Ferien Tag für
Tag von 2024 bis 2031. Änderst du eines dieser Module, musst du die Kopie
nachziehen **und die Edge Function neu veröffentlichen** — sonst erinnert der
Server zu anderen Zeiten, als der Kalender anzeigt.

`ueberblick.js` liegt aus einem anderen Grund als eigene Datei neben der
Funktion: In `index.ts` eingebaut wäre der Textaufbau von Node aus nicht
erreichbar, und `pruefungen.mjs` könnte ihn nicht prüfen — auch nicht den
Fall, auf den es ankommt (ein verdeckter Termin darf auch hier nur „Belegt"
heißen).

### Wenn Erinnerungen ausbleiben

- **Ist überhaupt ein Gerät angemeldet?** Das ist die mit Abstand häufigste
  Ursache — der Haken im Menü muss auf **jedem** Gerät einzeln gesetzt werden,
  auf dem die Meldung ankommen soll. Ist die Tabelle leer, wird nichts
  verschickt:
  ```sql
  select p.name, g.bezeichnung, g.zuletzt_ok from public.push_geraet g
    join public.profil p on p.id = g.profil_id;
  ```
  Im Terminfenster warnt die App inzwischen selbst, wenn eine Erinnerung
  eingestellt ist, für das Konto aber kein Gerät angemeldet ist.
- **Projekt pausiert?** Supabase legt Gratis-Projekte nach 7 Tagen ohne Zugriff
  schlafen; dann läuft auch der Zeitplan nicht mehr. Bei täglicher Nutzung
  passiert das nicht.
- **Läuft der Zeitplan?**
  ```sql
  select * from cron.job;
  select start_time, status from cron.job_run_details order by start_time desc limit 10;
  ```
- **Ist das Gerät noch angemeldet?**
  ```sql
  select bezeichnung, zuletzt_ok, fehler_zaehler from public.push_geraet;
  ```

Web Push ist „nach bestem Bemühen": Das Betriebssystem darf Meldungen verzögern,
besonders im Stromsparmodus. Für Unverzichtbares ist eine Erinnerung aus der
Kalender-App des Geräts verlässlicher.

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
