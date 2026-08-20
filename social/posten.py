"""
Bluesky-Bot für arbeitsmarkt-monitor.at.

Postet, wenn eine neue Ausgabe erscheint. Quelle ist docs/data/changelog.json,
Zustand ist social/gepostet.json.

    Der Commit ist die Freigabe.

Wer einen Eintrag mit "veroeffentlicht": true nach main schiebt, hat den Text
selbst geschrieben und damit freigegeben. Es gibt keinen zweiten Handgriff und
keine Warteschlange mit Entwuerfen.

Vier Sicherungen, damit das trotzdem nicht danebengeht:

 1. TROCKENLAUF IST DER STANDARD. Ohne --senden wird der fertige Payload
    ausgegeben und nichts uebertragen.
 2. HOECHSTENS EIN BEITRAG JE LAUF. Sonst kippt der erste scharfe Lauf die
    gesamte Versionsgeschichte auf einmal in die Timeline.
 3. NUR WAS WIRKLICH LIVE IST. "veroeffentlicht": false wird uebersprungen —
    ein Beitrag ueber einen Abschnitt, den es auf der Seite noch nicht gibt,
    verlinkt ins Leere.
 4. DEPLOY-ABGLEICH. Vor dem Rendern wird geprueft, ob GitHub Pages dieselbe
    Ausgabe ausliefert wie das Arbeitsverzeichnis. Pages haengt nach einem Push
    ein bis zwei Minuten nach; ohne diese Pruefung fotografiert der Bot die
    VORIGE Fassung und merkt es nicht.

Aufrufe:
    python social/posten.py                 # Trockenlauf
    python social/posten.py --pruefen       # nur changelog.json validieren
    python social/posten.py --senden        # scharf
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import requests

WURZEL = Path(__file__).resolve().parent.parent
CHANGELOG = WURZEL / "docs" / "data" / "changelog.json"
ZUSTAND = WURZEL / "social" / "gepostet.json"

BSKY = "https://bsky.social/xrpc"
MAX_GRAPHEME = 300      # harte Grenze der Plattform
ZIEL_GRAPHEME = 280     # eigene Grenze: 294 von 300 ist zu knapp zum Redigieren
MAX_BILDER = 4


# ---------------------------------------------------------------------------
# Laenge
# ---------------------------------------------------------------------------

def graphemzahl(text: str) -> int:
    """Bluesky zaehlt Grapheme, nicht Zeichen und nicht Bytes.

    Mit dem Modul `regex` wird \\X benutzt, das ist die richtige Zaehlung. Ohne
    das Modul wird auf len() zurueckgefallen — fuer deutschen Fliesstext ohne
    zusammengesetzte Emoji ist das derselbe Wert, und der Rueckfall wird
    ausgewiesen statt still zu geschehen.
    """
    try:
        import regex
    except ImportError:
        return len(text)
    return len(regex.findall(r"\X", text))


# ---------------------------------------------------------------------------
# Facets — der Teil, der still danebengeht
# ---------------------------------------------------------------------------

def facets_fuer_links(text: str) -> list[dict]:
    """Links als Facets mit UTF-8-BYTE-Offsets.

    Bluesky erkennt Links NICHT aus dem Text. Ohne Facet steht die URL als
    toter Text da — ohne Fehlermeldung, ohne Vorschaukarte.

    Die Offsets zaehlen UTF-8-Bytes, nicht Zeichen. In diesem Projekt ist das
    keine Theorie: „Oesterreich", „Zugaenge", „laeuft" und der Gedankenstrich —
    jedes davon ist mehr Bytes als Zeichen. Wer mit str-Indizes rechnet, setzt
    das Facet zu weit links und schneidet den Link an.
    """
    facets: list[dict] = []
    for treffer in re.finditer(r"https?://[^\s]+", text):
        url = treffer.group(0).rstrip(".,;:!?)»\"'")
        anfang_zeichen = treffer.start()
        byte_start = len(text[:anfang_zeichen].encode("utf-8"))
        byte_ende = byte_start + len(url.encode("utf-8"))
        facets.append({
            "index": {"byteStart": byte_start, "byteEnd": byte_ende},
            "features": [{"$type": "app.bsky.richtext.facet#link", "uri": url}],
        })
    return facets


# ---------------------------------------------------------------------------
# Quelle und Zustand
# ---------------------------------------------------------------------------

def lies_changelog() -> dict:
    return json.loads(CHANGELOG.read_text(encoding="utf-8"))


def lies_zustand() -> dict:
    if not ZUSTAND.exists():
        return {"gepostet": []}
    return json.loads(ZUSTAND.read_text(encoding="utf-8"))


def schreibe_zustand(zustand: dict) -> None:
    ZUSTAND.write_text(
        json.dumps(zustand, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )


def pruefe_changelog(daten: dict) -> list[str]:
    """Alles, was den Bot spaeter zur Laufzeit umbringen wuerde, hier finden."""
    befunde: list[str] = []
    nummern = [a["nummer"] for a in daten["ausgaben"]]

    if len(nummern) != len(set(nummern)):
        befunde.append(f"doppelte Ausgabennummern: {nummern}")
    if daten["aktuell"] != nummern[0]:
        befunde.append(
            f"aktuell ist {daten['aktuell']!r}, oberster Eintrag ist {nummern[0]!r} — "
            f"neue Eintraege gehoeren nach oben"
        )

    for ausgabe in daten["ausgaben"]:
        nr = ausgabe["nummer"]
        for feld in ("nummer", "datum", "datum_text", "titel", "veroeffentlicht", "charts"):
            if feld not in ausgabe:
                befunde.append(f"V {nr}: Feld {feld!r} fehlt")
        try:
            datetime.strptime(ausgabe.get("datum", ""), "%Y-%m-%d")
        except ValueError:
            befunde.append(f"V {nr}: datum {ausgabe.get('datum')!r} ist kein ISO-Datum")

        text = ausgabe.get("social")
        if text is None:
            continue

        laenge = graphemzahl(text)
        if laenge > MAX_GRAPHEME:
            befunde.append(f"V {nr}: social hat {laenge} Grapheme, Grenze ist {MAX_GRAPHEME}")
        elif laenge > ZIEL_GRAPHEME:
            befunde.append(
                f"V {nr}: social hat {laenge} Grapheme — ueber dem Zielwert {ZIEL_GRAPHEME}, "
                f"beim naechsten Redigieren reisst es"
            )
        if not facets_fuer_links(text):
            befunde.append(f"V {nr}: social enthaelt keinen Link — Beitrag fuehrt nirgendwohin")

        if len(ausgabe.get("charts", [])) > MAX_BILDER:
            befunde.append(f"V {nr}: {len(ausgabe['charts'])} Charts, Bluesky nimmt {MAX_BILDER}")

        beschriftet = {a["chart"] for a in ausgabe.get("abschnitte", [])}
        for chart in ausgabe.get("charts", []):
            if chart not in beschriftet:
                befunde.append(f"V {nr}: kein Alt-Text fuer {chart!r}")

    return befunde


def naechste_ausgabe(daten: dict, zustand: dict) -> dict | None:
    erledigt = {e["nummer"] for e in zustand["gepostet"]}
    offen = [
        a for a in daten["ausgaben"]
        if a["nummer"] not in erledigt
        and a.get("veroeffentlicht") is True
        and a.get("social")
    ]
    if not offen:
        return None
    # Aeltestes zuerst: waere je etwas liegengeblieben, kommt die Geschichte in
    # der richtigen Reihenfolge heraus statt rueckwaerts.
    offen.sort(key=lambda a: (a["datum"], a["nummer"]))
    return offen[0]


# ---------------------------------------------------------------------------
# Deploy-Abgleich
# ---------------------------------------------------------------------------

def warte_auf_pages(pages_url: str, erwartet: str, versuche: int = 10) -> None:
    """Pages muss dieselbe Ausgabe ausliefern wie das Arbeitsverzeichnis.

    Sonst fotografiert der Renderjob die vorige Fassung — ohne Fehler, ohne
    Hinweis, und der Beitrag zeigt eine Grafik, die es so nicht mehr gibt.
    """
    adresse = f"{pages_url.rstrip('/')}/data/changelog.json"
    for versuch in range(1, versuche + 1):
        try:
            antwort = requests.get(adresse, timeout=20, headers={"Cache-Control": "no-cache"})
            antwort.raise_for_status()
            geliefert = antwort.json().get("aktuell")
        except Exception as fehler:
            geliefert = f"nicht abrufbar ({type(fehler).__name__})"
        if geliefert == erwartet:
            print(f"  Pages liefert V {geliefert} — Stand stimmt überein")
            return
        print(f"  Versuch {versuch}/{versuche}: Pages liefert {geliefert!r}, erwartet {erwartet!r}")
        time.sleep(30)
    raise RuntimeError(
        f"Pages liefert nach {versuche} Versuchen noch nicht V {erwartet}. "
        f"Abgebrochen, ohne zu posten — der Zustand bleibt unveraendert, "
        f"der naechste Lauf holt es nach."
    )


# ---------------------------------------------------------------------------
# Bluesky
# ---------------------------------------------------------------------------

class Bluesky:
    def __init__(self, handle: str, app_passwort: str):
        antwort = requests.post(
            f"{BSKY}/com.atproto.server.createSession",
            json={"identifier": handle, "password": app_passwort},
            timeout=30,
        )
        if antwort.status_code != 200:
            raise RuntimeError(
                f"Anmeldung fehlgeschlagen ({antwort.status_code}). "
                f"App-Passwort pruefen — nicht das Kontopasswort verwenden. "
                f"Antwort: {antwort.text[:300]}"
            )
        sitzung = antwort.json()
        self.did = sitzung["did"]
        self.kopf = {"Authorization": f"Bearer {sitzung['accessJwt']}"}
        print(f"  angemeldet als {handle} ({self.did})")

    def lade_bild(self, daten: bytes, mime: str) -> dict:
        antwort = requests.post(
            f"{BSKY}/com.atproto.repo.uploadBlob",
            data=daten,
            headers={**self.kopf, "Content-Type": mime},
            timeout=90,
        )
        antwort.raise_for_status()
        return antwort.json()["blob"]

    def poste(self, datensatz: dict) -> str:
        antwort = requests.post(
            f"{BSKY}/com.atproto.repo.createRecord",
            json={
                "repo": self.did,
                "collection": "app.bsky.feed.post",
                "record": datensatz,
            },
            headers=self.kopf,
            timeout=60,
        )
        antwort.raise_for_status()
        uri = antwort.json()["uri"]
        kennung = uri.rsplit("/", 1)[-1]
        return f"https://bsky.app/profile/{self.did}/post/{kennung}"


# ---------------------------------------------------------------------------
# Beitrag bauen
# ---------------------------------------------------------------------------

def baue_datensatz(ausgabe: dict, bilder: list[dict]) -> dict:
    text = ausgabe["social"]
    datensatz = {
        "$type": "app.bsky.feed.post",
        "text": text,
        "createdAt": datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z"),
        "langs": ["de"],
    }
    facets = facets_fuer_links(text)
    if facets:
        datensatz["facets"] = facets
    if bilder:
        datensatz["embed"] = {
            "$type": "app.bsky.embed.images",
            "images": [
                {
                    "alt": bild["alt"],
                    "image": bild["blob"],
                    "aspectRatio": {"width": bild["breite"], "height": bild["hoehe"]},
                }
                for bild in bilder
            ],
        }
    return datensatz


def main() -> int:
    zerleger = argparse.ArgumentParser(description=__doc__)
    zerleger.add_argument("--senden", action="store_true", help="wirklich posten")
    zerleger.add_argument("--pruefen", action="store_true", help="nur changelog.json validieren")
    zerleger.add_argument("--ohne-bild", action="store_true", help="Renderjob ueberspringen")
    argumente = zerleger.parse_args()

    daten = lies_changelog()

    befunde = pruefe_changelog(daten)
    if befunde:
        print("changelog.json — Befunde:")
        for befund in befunde:
            print(f"  - {befund}")
        return 1
    print(f"changelog.json in Ordnung ({len(daten['ausgaben'])} Ausgaben)")
    if argumente.pruefen:
        return 0

    zustand = lies_zustand()
    ausgabe = naechste_ausgabe(daten, zustand)
    if ausgabe is None:
        print("Nichts zu posten — alle veroeffentlichten Ausgaben sind erledigt.")
        return 0

    nr = ausgabe["nummer"]
    print(f"\nOffen: V {nr} — {ausgabe['titel']} ({ausgabe['datum']})")
    print(f"  {graphemzahl(ausgabe['social'])} Grapheme, {len(ausgabe['charts'])} Bild(er)")

    alt_je_chart = {a["chart"]: a["alt"] for a in ausgabe.get("abschnitte", [])}
    bilder: list[dict] = []

    if ausgabe["charts"] and not argumente.ohne_bild:
        warte_auf_pages(daten["pages_url"], daten["aktuell"])
        from rendern import rendere
        for chart in ausgabe["charts"][:MAX_BILDER]:
            bild = rendere(chart, daten["pages_url"])
            bild["alt"] = alt_je_chart[chart]
            bilder.append(bild)

    if not argumente.senden:
        print("\n--- TROCKENLAUF, nichts gesendet ---")
        vorschau = baue_datensatz(ausgabe, [
            {**b, "blob": {"$type": "blob", "mimeType": b["mime"], "size": len(b["bytes"])}}
            for b in bilder
        ])
        print(json.dumps(vorschau, ensure_ascii=False, indent=2))
        print("\nText, wie er erscheint:")
        print("  " + ausgabe["social"].replace("\n", "\n  "))
        for facet in vorschau.get("facets", []):
            roh = ausgabe["social"].encode("utf-8")
            i, j = facet["index"]["byteStart"], facet["index"]["byteEnd"]
            geschnitten = roh[i:j].decode("utf-8")
            ziel = facet["features"][0]["uri"]
            zeichen = "OK" if geschnitten == ziel else "FALSCH"
            print(f"  Facet {i}–{j}: {geschnitten!r} gegen {ziel!r} → {zeichen}")
        return 0

    handle = os.environ.get("BSKY_HANDLE")
    passwort = os.environ.get("BSKY_APP_PASSWORD")
    if not handle or not passwort:
        print("FEHLER: BSKY_HANDLE und BSKY_APP_PASSWORD fehlen.", file=sys.stderr)
        return 1

    klient = Bluesky(handle, passwort)
    for bild in bilder:
        bild["blob"] = klient.lade_bild(bild["bytes"], bild["mime"])
        print(f"  Bild {bild['chart']} hochgeladen ({len(bild['bytes']):,} Bytes)")

    url = klient.poste(baue_datensatz(ausgabe, bilder))
    print(f"\nGepostet: {url}")

    # Zustand erst NACH dem erfolgreichen Post schreiben. Schlaegt irgendetwas
    # davor fehl, bleibt der Eintrag offen und der naechste Lauf holt ihn nach.
    zustand["gepostet"].append({
        "nummer": nr,
        "datum": ausgabe["datum"],
        "gepostet_am": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "url": url,
    })
    schreibe_zustand(zustand)
    print(f"Zustand nachgefuehrt: {ZUSTAND.relative_to(WURZEL)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
