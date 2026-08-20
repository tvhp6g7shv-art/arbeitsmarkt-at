"""
Bildproduktion für den Bluesky-Bot.

Rendert eine einzelne Grafik aus der AUSGELIEFERTEN Einbettseite:

    <pages_url>/embed.html?chart=<name>

Absichtlich nicht aus dem Arbeitsverzeichnis über file://. Der Umweg über die
ausgelieferte Seite prüft den Deploy-Stand gleich mit: fehlt eine Datei, ist die
Cacheziffer nicht mitgezogen oder eine Schrift nicht erreichbar, fällt es hier
auf und nicht erst beim Besucher. Und die file://-Schriftfrage stellt sich gar
nicht erst.

Die Einbettseite trägt die CC-BY-Fußzeile IM Bild. Deshalb wird das ganze
Element #dashboard aufgenommen und nicht nur die Zeichenfläche — wer den
Screenshot weiterverbreitet, transportiert die Namensnennung zwangsläufig mit.

Aufruf einzeln:
    python social/rendern.py saison --ziel /tmp/saison.png
"""

from __future__ import annotations

import argparse
import io
import sys
from pathlib import Path

BREITE = 1200          # Viewport-Breite; die Höhe ergibt sich aus dem Abschnitt
SKALIERUNG = 2         # deviceScaleFactor — 2 ergibt ein doppelt aufgelöstes PNG
MAX_BYTES = 2_000_000  # Bluesky-Grenze je Bild
WARTEN_MS = 30_000     # Höchstwartezeit auf die fertige Grafik


class RenderFehler(RuntimeError):
    pass


def _verkleinern(png: bytes) -> tuple[bytes, str]:
    """Auf die Bluesky-Grenze von 2 MB bringen.

    Erst PNG belassen, dann JPEG in absteigender Qualität. Ein Balkendiagramm
    bleibt als PNG meist weit darunter; die Bezirks- und die EU-Karte sind die
    Kandidaten, bei denen es kippt (viele Flächen, viele Farbabstufungen).
    """
    if len(png) <= MAX_BYTES:
        return png, "image/png"

    try:
        from PIL import Image
    except ImportError as fehler:  # pragma: no cover
        raise RenderFehler(
            f"Bild ist {len(png):,} Bytes und damit über der 2-MB-Grenze von "
            f"Bluesky, aber Pillow fehlt zum Nachverdichten ({fehler})"
        ) from fehler

    bild = Image.open(io.BytesIO(png)).convert("RGB")
    for guete in (90, 82, 74, 66):
        puffer = io.BytesIO()
        bild.save(puffer, format="JPEG", quality=guete, optimize=True, progressive=True)
        if puffer.tell() <= MAX_BYTES:
            print(f"    nachverdichtet auf JPEG q{guete}: {puffer.tell():,} Bytes")
            return puffer.getvalue(), "image/jpeg"

    raise RenderFehler(
        f"Bild bleibt auch als JPEG q66 über 2 MB ({puffer.tell():,} Bytes). "
        f"Breite verringern oder den Abschnitt für Social ausschließen."
    )


def rendere(chart: str, pages_url: str, ziel: Path | None = None) -> dict:
    """Ein Bild erzeugen. Gibt Bytes, MIME-Typ und die echten Maße zurück."""
    from playwright.sync_api import sync_playwright

    adresse = f"{pages_url.rstrip('/')}/embed.html?chart={chart}"
    print(f"  rendere {chart} von {adresse}")

    with sync_playwright() as p:
        browser = p.chromium.launch(args=["--force-color-profile=srgb"])
        try:
            # colorScheme fest auf hell. Die Einbettseite folgt sonst
            # prefers-color-scheme, und die Farbigkeit des Social-Bilds haenge
            # dann am Standard des Runners statt an einer Entscheidung.
            kontext = browser.new_context(
                viewport={"width": BREITE, "height": 900},
                device_scale_factor=SKALIERUNG,
                color_scheme="light",
                locale="de-AT",
                timezone_id="Europe/Vienna",
            )
            seite = kontext.new_page()

            fehler_konsole: list[str] = []
            seite.on("pageerror", lambda e: fehler_konsole.append(str(e)))

            antwort = seite.goto(adresse, wait_until="networkidle", timeout=WARTEN_MS)
            if antwort is None or not antwort.ok:
                status = "keine Antwort" if antwort is None else antwort.status
                raise RenderFehler(f"{adresse} lieferte {status}")

            # Auf die fertig gezeichnete Grafik warten — drei Bedingungen, weil
            # keine einzelne allein traegt: der Container kann stehen, bevor
            # ECharts gezeichnet hat; der Untertitel kann gefuellt sein, bevor
            # die Signatur da ist.
            seite.wait_for_selector(f"#c-{chart} canvas, #c-{chart} svg", timeout=WARTEN_MS)
            seite.wait_for_function(
                """() => {
                    const u = document.getElementById('untertitel');
                    const s = document.getElementById('signatur');
                    return u && !u.textContent.includes('werden geladen')
                        && s && s.textContent.trim().length > 0;
                }""",
                timeout=WARTEN_MS,
            )
            seite.wait_for_timeout(1200)  # Nachlauf fuer Animation und Schrift

            if fehler_konsole:
                raise RenderFehler(
                    "JavaScript-Fehler auf der Einbettseite: " + " | ".join(fehler_konsole)
                )

            element = seite.query_selector("#dashboard")
            if element is None:
                raise RenderFehler("#dashboard nicht gefunden — Seitenaufbau geaendert?")

            kasten = element.bounding_box()
            if not kasten or kasten["height"] < 200:
                raise RenderFehler(
                    f"#dashboard ist {kasten and kasten['height']} px hoch — "
                    f"die Grafik ist vermutlich nicht gezeichnet"
                )

            png = element.screenshot(type="png")
        finally:
            browser.close()

    breite_px = int(kasten["width"] * SKALIERUNG)
    hoehe_px = int(kasten["height"] * SKALIERUNG)
    verhaeltnis = kasten["width"] / kasten["height"]
    print(
        f"    {breite_px} × {hoehe_px} px, {len(png):,} Bytes, "
        f"Seitenverhältnis {verhaeltnis:.2f}:1"
    )
    if verhaeltnis > 2.4:
        print("    Hinweis: sehr breit — Bluesky zeigt in der Vorschau nur einen Ausschnitt")

    daten, mime = _verkleinern(png)

    if ziel is not None:
        ziel.parent.mkdir(parents=True, exist_ok=True)
        ziel.write_bytes(daten)
        print(f"    geschrieben nach {ziel}")

    return {
        "bytes": daten,
        "mime": mime,
        "breite": breite_px,
        "hoehe": hoehe_px,
        "chart": chart,
    }


def main() -> int:
    zerleger = argparse.ArgumentParser(description=__doc__)
    zerleger.add_argument("chart", help="Name aus EINBETT_TITEL, z. B. saison")
    zerleger.add_argument(
        "--pages-url",
        default="https://tvhp6g7shv-art.github.io/arbeitsmarkt-at",
        help="Basis der ausgelieferten Seite",
    )
    zerleger.add_argument("--ziel", type=Path, help="Ausgabedatei")
    argumente = zerleger.parse_args()

    try:
        rendere(argumente.chart, argumente.pages_url, argumente.ziel)
    except RenderFehler as fehler:
        print(f"FEHLER: {fehler}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
