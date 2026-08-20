"""Gibt die Grafiknamen der obersten Ausgabe aus, durch Leerzeichen getrennt.

Nur ein Helfer fuer die Renderprobe im Workflow. Bewusst eine eigene Datei
statt eines Heredocs im YAML: eingerueckte Heredocs brechen in bash still, und
ein Einzeiler mit Anfuehrungszeichen in YAML ist schwer lesbar. Hier laesst es
sich ausserdem einzeln aufrufen und pruefen.

    python social/charts_der_ausgabe.py
"""

from __future__ import annotations

import json
from pathlib import Path

CHANGELOG = Path(__file__).resolve().parent.parent / "docs" / "data" / "changelog.json"


def main() -> int:
    with CHANGELOG.open(encoding="utf-8") as datei:
        daten = json.load(datei)

    ausgaben = daten.get("ausgaben") or []
    if not ausgaben:
        return 0

    print(" ".join(ausgaben[0].get("charts") or []))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
