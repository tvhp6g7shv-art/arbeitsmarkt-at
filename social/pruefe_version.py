"""
Haelt VERSION in docs/js/kern.js gegen den obersten Eintrag in
docs/data/changelog.json.

Warum das noetig ist: Das Projekt fuehrt drei Zaehlungen, die schon einmal
auseinandergelaufen sind (siehe doku/changelog.md, Abschnitt 1). Mit
changelog.json kommt eine vierte Stelle dazu, an der eine Versionsnummer steht.

Der saubere Weg waere, kern.js die Nummer aus changelog.json lesen zu lassen.
Das geht hier nicht ohne Umbau: signaturHtml() laeuft synchron beim Seitenaufbau,
changelog.json kaeme erst nach einem fetch an — die Signaturzeile waere dann
kurz leer oder muesste nachgereicht werden. Solange kern.js unangetastet bleibt,
ersetzt diese Pruefung den Umbau: sie faellt im Workflow durch, bevor gepostet
wird, statt dass eine falsche Nummer still in die Timeline geht.

    python social/pruefe_version.py
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

WURZEL = Path(__file__).resolve().parent.parent
KERN = WURZEL / "docs" / "js" / "kern.js"
CHANGELOG = WURZEL / "docs" / "data" / "changelog.json"


def lies_version_aus_kern() -> dict[str, str]:
    quelle = KERN.read_text(encoding="utf-8")
    block = re.search(r"const VERSION\s*=\s*\{(.*?)\}\s*;", quelle, re.S)
    if not block:
        raise SystemExit(f"FEHLER: const VERSION in {KERN.name} nicht gefunden")

    felder: dict[str, str] = {}
    for feld in ("nummer", "datum", "datum_text", "changelog"):
        treffer = re.search(rf'{feld}\s*:\s*"([^"]*)"', block.group(1))
        if treffer:
            felder[feld] = treffer.group(1)
    return felder


def main() -> int:
    kern = lies_version_aus_kern()
    daten = json.loads(CHANGELOG.read_text(encoding="utf-8"))
    oben = daten["ausgaben"][0]

    befunde: list[str] = []

    if kern.get("nummer") != oben["nummer"]:
        befunde.append(
            f"Nummer: kern.js sagt {kern.get('nummer')!r}, "
            f"changelog.json sagt {oben['nummer']!r}"
        )
    if kern.get("datum") != oben["datum"]:
        befunde.append(
            f"Datum: kern.js sagt {kern.get('datum')!r}, "
            f"changelog.json sagt {oben['datum']!r}"
        )
    if kern.get("datum_text") != oben["datum_text"]:
        befunde.append(
            f"Datumstext: kern.js sagt {kern.get('datum_text')!r}, "
            f"changelog.json sagt {oben['datum_text']!r}"
        )
    if daten["aktuell"] != oben["nummer"]:
        befunde.append(
            f"aktuell: {daten['aktuell']!r}, oberster Eintrag {oben['nummer']!r}"
        )
    if kern.get("changelog") != daten["changelog_url"]:
        befunde.append(
            f"Changelog-Adresse: kern.js {kern.get('changelog')!r}, "
            f"changelog.json {daten['changelog_url']!r}"
        )

    if befunde:
        print("Versionsstaende laufen auseinander:")
        for befund in befunde:
            print(f"  - {befund}")
        print("\nBeim Hochzaehlen ziehen beide Stellen mit — siehe doku/changelog.md § 3.")
        return 1

    print(
        f"Versionsstaende stimmen ueberein: V {kern['nummer']}, "
        f"{kern['datum']} ({kern['datum_text']})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
