"""Kleiner Testserver fuer die Entwicklung.

Der eingebaute http.server laesst Browser die JS-Module zwischenspeichern.
Beim Entwickeln fuehrt das dazu, dass Aenderungen scheinbar wirkungslos
bleiben. Dieser Server schickt deshalb "no-store" mit.

Nur zum lokalen Ausprobieren gedacht - veroeffentlicht wird ueber
GitHub Pages, dort uebernimmt der Service Worker das Nachladen.

    python testserver.py [Port]
"""

import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

VERZEICHNIS = Path(__file__).resolve().parent


class OhneZwischenspeicher(SimpleHTTPRequestHandler):
    extensions_map = {
        **SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript",
        ".mjs": "text/javascript",
        ".webmanifest": "application/manifest+json",
        ".svg": "image/svg+xml",
        ".ics": "text/calendar",
    }

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def log_message(self, format, *args):
        # Nur Fehler melden, sonst rauscht die Konsole zu.
        if not args or not str(args[0]).startswith(("GET", "HEAD")):
            super().log_message(format, *args)


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8123
    handler = partial(OhneZwischenspeicher, directory=str(VERZEICHNIS))
    with ThreadingHTTPServer(("127.0.0.1", port), handler) as server:
        print(f"Kalender laeuft auf http://localhost:{port}")
        print("Beenden mit Strg+C")
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            print("\nBeendet.")


if __name__ == "__main__":
    main()
