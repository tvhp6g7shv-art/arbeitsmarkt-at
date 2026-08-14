"""
Gemeinsames Fundament der ETL-Pipeline: Logging, Download, Prüf- und
Umwandlungshelfer, geteilter Zustand (Warnungen, Schema-Report) und das
Schreiben der JSON-Ausgaben.

Seit v18 ist die Pipeline pro Themenstrang in Module zerlegt; dieses Modul
enthält alles, was mehrere Stränge brauchen. Der Code selbst ist unverändert
aus build.py (v17) übernommen.
"""

from __future__ import annotations

import io
import json
import sys
from pathlib import Path

import pandas as pd
import requests

import config

# --- Geteilter Zustand ------------------------------------------------------
# Diese Objekte werden von den Strang-Modulen befüllt (append / Schlüssel
# setzen), nie neu zugewiesen — sonst verlieren die Importe die Verbindung.

WARNUNGEN: list[str] = []
SCHEMA_REPORT: dict = {}
VORMERKDAUER: dict = {}
LZBL: dict = {}

# Das Repo-Wurzelverzeichnis (eine Ebene über etl/)
WURZEL = Path(__file__).resolve().parent.parent
AUSGABE = WURZEL / config.AUSGABE_ORDNER


def log(text: str) -> None:
    print(text, flush=True)


def warnen(text: str) -> None:
    WARNUNGEN.append(text)
    log(f"  ⚠  {text}")


def abbruch(text: str) -> None:
    """Harter Abbruch mit klarer Meldung — erscheint im GitHub-Actions-Log."""
    log("")
    log("=" * 70)
    log("ABBRUCH: " + text)
    log("=" * 70)
    sys.exit(1)


# --- Download ---------------------------------------------------------------

def lade_bytes(url: str, params: dict | None = None) -> bytes:
    log(f"  ↓ {url.split('/')[-1][:60]}")
    try:
        antwort = requests.get(
            url,
            params=params,
            timeout=config.TIMEOUT_SEKUNDEN,
            headers={"User-Agent": "arbeitsmarkt-at-dashboard/1.0"},
        )
    except requests.RequestException as fehler:
        abbruch(f"Download fehlgeschlagen: {url}\n         {fehler}")
    if antwort.status_code != 200:
        abbruch(
            f"Download lieferte HTTP {antwort.status_code}: {url}\n"
            f"         Prüfen, ob die Quelle noch unter dieser Adresse liegt."
        )
    return antwort.content


def lade_ams_csv(schluessel: str) -> pd.DataFrame:
    """Lädt eine AMS-CSV und gibt sie mit kleingeschriebenen Spalten zurück."""
    dateiname = config.AMS_DATEIEN[schluessel]
    rohdaten = lade_bytes(f"{config.AMS_BASIS_URL}/{dateiname}")

    tabelle = None
    for kodierung in ("utf-8-sig", "cp1252", "latin-1"):
        try:
            tabelle = pd.read_csv(
                io.BytesIO(rohdaten),
                sep=";",
                encoding=kodierung,
                dtype=str,
                keep_default_na=False,
            )
            break
        except UnicodeDecodeError:
            continue
    if tabelle is None:
        abbruch(f"{dateiname}: Keine passende Zeichenkodierung gefunden.")

    # Die Dateien enden mit einem Strichpunkt -> letzte Spalte ist leer
    tabelle = tabelle.loc[:, ~tabelle.columns.str.startswith("Unnamed")]
    tabelle.columns = [s.strip().lower() for s in tabelle.columns]

    SCHEMA_REPORT[dateiname] = {
        "spalten": list(tabelle.columns),
        "zeilen": int(len(tabelle)),
    }
    log(f"    {len(tabelle):,} Zeilen · Spalten: {', '.join(tabelle.columns)}")
    return tabelle


def lade_optional(schluessel: str) -> pd.DataFrame | None:
    """Wie lade_ams_csv, bricht aber nicht ab — für Zusatzquellen."""
    try:
        return lade_ams_csv(schluessel)
    except SystemExit:
        warnen(
            f"{config.AMS_DATEIEN[schluessel]} nicht abrufbar — "
            f"der zugehörige Abschnitt bleibt ausgeblendet"
        )
        return None


def pruefe_spalten(tabelle: pd.DataFrame, erwartet: list[str], quelle: str) -> None:
    fehlend = [s for s in erwartet if s not in tabelle.columns]
    if fehlend:
        abbruch(
            f"{quelle}: Erwartete Spalten fehlen: {', '.join(fehlend)}\n"
            f"         Tatsächlich vorhanden: {', '.join(tabelle.columns)}\n"
            f"         Die Quelle hat vermutlich ihr Format geändert."
        )


# --- Umwandlung -------------------------------------------------------------

def zu_zahl(serie: pd.Series) -> pd.Series:
    """Wandelt Textspalten in Zahlen um. Punkt als Tausender, Komma als Komma."""
    return pd.to_numeric(
        serie.astype(str)
        .str.replace(".", "", regex=False)
        .str.replace(",", ".", regex=False)
        .str.strip()
        .replace({"": None}),
        errors="coerce",
    ).fillna(0)


def spalte_finden(tabelle: pd.DataFrame, teil: str) -> str | None:
    for name in tabelle.columns:
        if teil in name:
            return name
    return None


def prozent(neu: float, alt: float) -> float | None:
    if not alt:
        return None
    return round((neu - alt) / alt * 100, 1)


def monats_iso(datum) -> str:
    """Datum als YYYY-MM-DD — das Format aller Monatsangaben in den JSONs."""
    return pd.Timestamp(datum).strftime("%Y-%m-%d")


def zeitkontext(daten: pd.DataFrame) -> dict:
    """
    Gemeinsamer Zeitrahmen für alle Aggregationen: aktueller Monat,
    Vorjahresmonat (falls vorhanden) und die zugehörigen Datenausschnitte.
    Wird einmal in build.py berechnet und an die Strang-Module gereicht.
    """
    monate = sorted(daten["datum"].unique())
    aktueller_monat = monate[-1]
    vorjahresmonat = aktueller_monat - pd.DateOffset(years=1)
    if vorjahresmonat not in monate:
        warnen("Kein exakter Vorjahresmonat vorhanden — Vergleiche entfallen teilweise")
        vorjahresmonat = None

    jetzt = daten[daten["datum"] == aktueller_monat]
    vorjahr = daten[daten["datum"] == vorjahresmonat] if vorjahresmonat is not None else None
    return {
        "monate": monate,
        "aktueller_monat": aktueller_monat,
        "vorjahresmonat": vorjahresmonat,
        "jetzt": jetzt,
        "vorjahr": vorjahr,
    }


# --- Schreiben --------------------------------------------------------------

def schreibe(name: str, inhalt) -> None:
    AUSGABE.mkdir(parents=True, exist_ok=True)
    ziel = AUSGABE / f"{name}.json"
    with ziel.open("w", encoding="utf-8") as datei:
        json.dump(inhalt, datei, ensure_ascii=False, separators=(",", ":"))
    groesse = ziel.stat().st_size / 1024
    log(f"    {name}.json  ({groesse:,.0f} KB)")
