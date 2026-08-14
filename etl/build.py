#!/usr/bin/env python3
"""
Datenpipeline für das Arbeitsmarkt-Dashboard Österreich — Orchestrator.

Was die Pipeline tut:
  1. Lädt die offenen AMS-CSV-Dateien und die Eurostat-Quoten herunter
  2. Prüft, ob die Spalten noch so aussehen wie erwartet
  3. Aggregiert die Daten zu kleinen JSON-Dateien für das Dashboard
  4. Schreibt alles nach docs/data/

Aufruf:  python etl/build.py

Seit v18 ist der Code pro Themenstrang in Module zerlegt; diese Datei
enthält nur noch den Ablauf. Wer an einer einzelnen Auswertung arbeitet,
öffnet das jeweilige Modul:

    gemeinsam.py     Logging, Download, Prüf-/Umwandlungshelfer, Schreiben
    regionen.py      Bezirks-Mapping, bezirke.json, bundeslaender.json
    ausbildung.py    Kerndatei laden, ausbildung.json
    uebersicht.py    kpi.json, zeitreihe.json
    generationen.py  Altersgruppen -> Generationen, generationen.json
    eurostat.py      Quoten, EU-Vergleich/Rangliste, Inflation (eu.json)
    fluss.py         Zugänge/Abgänge (fluss.json)
    dauer.py         Vormerkdauer, Langzeit (dauer.json)
    schulung.py      Personen in Schulung (schulung.json)
    stellen.py       Offene Stellen, Andrang (stellen.json)
    branche.py       Wirtschaftszweige (branche.json)
    karte.py         Bezirksgeometrien (karte.json, karte_geo.json)

Die Pipeline ist absichtlich gesprächig: sie schreibt mit, was sie tut, und
sammelt alle Auffälligkeiten in docs/data/meta.json unter "warnungen".
Wenn eine Quelle ihre Struktur ändert, bricht sie mit einer verständlichen
Meldung ab, statt stillschweigend falsche Zahlen zu erzeugen.
"""

from __future__ import annotations

import datetime as dt

import pandas as pd

import config
from gemeinsam import (LZBL, SCHEMA_REPORT, WARNUNGEN, log, schreibe, warnen,
                       zeitkontext)
import uebersicht
import regionen
import ausbildung
import generationen
import eurostat
from fluss import baue_fluss
from dauer import baue_dauer
from schulung import baue_schulung
from stellen import baue_stellen
from branche import baue_branche
from karte import baue_kartenregionen


def main() -> None:
    start = dt.datetime.now(dt.timezone.utc)
    log("=" * 70)
    log("Arbeitsmarkt-Dashboard Österreich — Datenaktualisierung")
    log(f"Start: {start:%Y-%m-%d %H:%M} UTC")
    log("=" * 70)

    # --- Laden -------------------------------------------------------------
    mapping = regionen.baue_bezirks_mapping()
    daten = ausbildung.lade_ausbildungsdaten(mapping)
    alter = generationen.lade_altersdaten(mapping)
    quoten = eurostat.hole_eurostat()

    # --- Aggregieren -------------------------------------------------------
    log("\n[5/6] Dashboard-Dateien aggregieren")
    ctx = zeitkontext(daten)
    gesamt_jetzt = float(ctx["jetzt"]["bestand"].sum())

    ausgaben: dict[str, dict] = {}
    ausgaben["kpi"] = uebersicht.baue_kpi(ctx, quoten)
    ausgaben["zeitreihe"] = uebersicht.baue_zeitreihe(daten)
    ausgaben["ausbildung"] = ausbildung.baue_ausbildung(daten, ctx)
    ausgaben["bezirke"] = regionen.baue_bezirke(ctx, mapping)
    ausgaben["bundeslaender"] = regionen.baue_bundeslaender(daten, ctx, quoten)

    if alter is not None and not alter.empty:
        ausgaben["generationen"] = generationen.baue_generationen(
            alter, ctx["aktueller_monat"], ctx["vorjahresmonat"]
        )
        summe_gen = sum(g["bestand"] for g in ausgaben["generationen"]["generationen"])
        abweichung = abs(summe_gen - gesamt_jetzt) / gesamt_jetzt * 100 if gesamt_jetzt else 0
        if abweichung > 1:
            warnen(
                f"Generationen-Summe ({summe_gen:,}) weicht um {abweichung:.1f} % von der "
                f"Gesamtzahl aus der Ausbildungsdatei ({int(gesamt_jetzt):,}) ab — "
                f"die beiden AMS-Dateien zählen offenbar unterschiedlich"
            )
        else:
            log(f"    Gegenprobe Generationen: {summe_gen:,} vs. {int(gesamt_jetzt):,} "
                f"({abweichung:.1f} % Abweichung)")

    if quoten:
        ausgaben["quoten"] = quoten

    for name in ausgaben:
        log(f"    ✓ {name}.json")

    # --- Zusatzauswertungen ------------------------------------------------
    log("\n[5b/6] Zusatzauswertungen")
    for name, wert in [
        ("fluss",     baue_fluss(daten)),
        ("dauer",     baue_dauer(LZBL.get("tabelle"))),
        ("schulung",  baue_schulung(mapping)),
        ("eu",        eurostat.hole_eurostat_vergleich()),
        ("stellen",   baue_stellen(daten, mapping)),
        ("branche",   baue_branche()),
    ]:
        if wert:
            ausgaben[name] = wert
            log(f"    ✓ {name}.json")

    # Gegenprobe: Arbeitslose + Schulungen = vorgemerkte Personen
    if "schulung" in ausgaben:
        vorgemerkt = ausgaben["kpi"]["arbeitslose_gesamt"] + ausgaben["schulung"]["bestand"]
        ausgaben["kpi"]["schulung"] = ausgaben["schulung"]["bestand"]
        ausgaben["kpi"]["vorgemerkt_gesamt"] = vorgemerkt
        log(f"    Vorgemerkte Personen gesamt: {vorgemerkt:,}")

    # --- Karte -------------------------------------------------------------
    monate = ctx["monate"]
    letzter, vorjahr = monate[-1], monate[-1] - pd.DateOffset(years=1)
    jetzt_rgs = daten[daten["datum"] == letzter].groupby("rgscode")["bestand"].sum()
    vorjahr_rgs = (
        daten[daten["datum"] == vorjahr].groupby("rgscode")["bestand"].sum()
        if vorjahr in monate else None
    )
    try:
        geo, karte = baue_kartenregionen(
            jetzt_rgs, vorjahr_rgs, mapping, pd.Timestamp(letzter).strftime("%Y-%m-%d")
        )
    except Exception as fehler:
        warnen(
            f"Karte konnte nicht erzeugt werden ({type(fehler).__name__}: {fehler}) — "
            f"alle Werte stehen weiterhin in den Tabellen"
        )
        geo, karte = None, None

    # --- Schreiben ---------------------------------------------------------
    log("\nSchreiben")
    for name, inhalt in ausgaben.items():
        schreibe(name, inhalt)
    if geo:
        schreibe("karte_geo", geo)
        schreibe("karte", karte)

    schreibe("meta", {
        "generiert_am": start.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "stand_daten": ausgaben["kpi"]["stand"],
        "quellen": [
            {
                "name": "AMS Österreich — Arbeitsmarktdaten (Open Data)",
                "url": "https://www.data.gv.at/datasets?publisher=AMS+%C3%96sterreich",
                "lizenz": "CC BY 4.0",
            },
            {
                "name": "Eurostat — lfst_r_lfu3rt",
                "url": "https://ec.europa.eu/eurostat/databrowser/view/lfst_r_lfu3rt",
                "lizenz": "Eurostat-Nutzungsbedingungen",
            },
            {
                "name": "STATISTIK AUSTRIA — Bezirksgrenzen",
                "url": "https://data.statistik.gv.at/web/catalog.jsp",
                "lizenz": "CC BY 4.0",
            },
        ],
        "hinweis_definitionen": (
            "AMS-Zahlen sind beim AMS registrierte Arbeitslose (nationale "
            "Definition, monatlich, ohne Schulungsteilnehmer:innen). Die Quoten "
            "stammen aus der EU-weiten Arbeitskräfteerhebung (ILO-Definition, "
            "jährlich) und sind mit den AMS-Absolutzahlen nicht direkt "
            "verrechenbar."
        ),
        "hinweis_bezirke": (
            "Die Bezirksangaben sind AMS-Geschäftsstellenbezirke (RGS), nicht "
            "politische Bezirke. Die beiden Nummernsysteme unterscheiden sich: "
            "RGSCode 102 ist Mattersburg, Bezirkskennziffer 102 ist Rust. Wien "
            "ist beim AMS in rund 15 Geschäftsstellen aufgeteilt. Die Karte "
            "zeigt daher Bundesländer; Bezirkswerte stehen in der Tabelle."
        ),
        "einbettung": config.EINBETTUNG,
        "schema": SCHEMA_REPORT,
        "warnungen": WARNUNGEN,
    })

    dauer = (dt.datetime.now(dt.timezone.utc) - start).total_seconds()
    log("\n" + "=" * 70)
    if WARNUNGEN:
        log(f"Fertig in {dauer:.0f}s — mit {len(WARNUNGEN)} Hinweis(en):")
        for eintrag in WARNUNGEN:
            log(f"  · {eintrag}")
    else:
        log(f"Fertig in {dauer:.0f}s — keine Auffälligkeiten.")
    log("=" * 70)


if __name__ == "__main__":
    main()
