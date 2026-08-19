"""
Themenstrang: Verfestigung — wie lange Arbeitslosigkeit je Altersgruppe dauert
(verfestigung.json)

Nutzt die Kreuztabelle, die generationen.py unter gemeinsam.VORMERKDAUER
["kreuz"] ablegt. Kein eigener Download: die Altersdatei wird ohnehin geladen,
sie enthaelt Alter und Vormerkdauer gemeinsam. Fuer die Generationen-Auswertung
wird die Dauer weggruppiert — hier bleibt sie erhalten.

WAS DIE AUSWERTUNG ZEIGT
Je Altersgruppe die Verteilung auf drei Dauerklassen, auf 100 % normiert. Der
Anteil laenger als ein Jahr Vorgemerkter steigt streng monoton mit dem Alter.

ZWEI VERDICHTUNGEN, BEIDE BEGRUENDET

1. Sechs Dauerklassen auf drei. Die AMS-Klassen sind vier Quartalsschritte
   plus zwei Jahresschritte. Zusammengefasst zu „bis 6 Monate", „6 bis 12
   Monate" und „ueber 1 Jahr". Die Feinstruktur traegt fuer die Aussage
   nichts bei und macht den Balken unlesbar.

2. Die oberste Altersgruppe mit der darunter. „65 Jahre und aelter" umfasst
   838 Personen (Stand 31.07.2026) — 0,28 % aller Arbeitslosen — und traegt
   zugleich den hoechsten Langzeitanteil der ganzen Tabelle. Als eigener
   Balken waere das die Zahl, die zitiert wird: eine Schlagzeile auf 838
   Faellen. Zusammengelegt ergibt „60 +" rund 26.800 Personen.

   ACHTUNG, ABWEICHUNG VON DER HAUSREGEL: Die uebrigen Abschnitte fassen
   AMS-Gruppen nicht zusammen. Die Begruendung gehoert deshalb sichtbar in
   den Einordnungssatz, nicht nur in diesen Kommentar. Die Schwelle steht in
   config.VERFESTIGUNG_AB.

Beide Verdichtungen arbeiten NICHT mit festen Beschriftungen, sondern lesen
Grenzen aus den Namen (Tage bei der Dauer, Jahre beim Alter). Aendert das AMS
seine Schreibweise, faellt das auf, statt still falsch zu rechnen.
"""

from __future__ import annotations

import re

import pandas as pd

import config
from gemeinsam import VORMERKDAUER, log, warnen
from generationen import alter_grenzen


def anteil(teil: float, ganzes: float) -> float:
    """
    Anteil in Prozent, auf eine Nachkommastelle.

    Bewusst NICHT `gemeinsam.prozent` — die Funktion rechnet eine
    Veraenderung (neu - alt) / alt und liefert hier Unsinn.
    """
    return round(teil / ganzes * 100, 1) if ganzes else 0.0

# Obergrenze der Dauerklassen in Tagen -> Zielklasse.
# Die Klammer im AMS-Namen traegt die verlaessliche Angabe:
#   "1 Quartal (bis 91 Tage)"        -> 91
#   "2 Quartale (92 bis 183 Tage)"   -> 183
#   "ab 3 Jahre (mehr als 731 Tage)" -> 731, offenes Ende
KLASSEN = [
    ("kurz",   "bis 6 Monate",    183),
    ("mittel", "6 bis 12 Monate", 365),
    ("lang",   "über 1 Jahr",     None),   # alles darueber
]


def dauer_obergrenze(bezeichnung: str) -> tuple[int, int]:
    """
    Obergrenze einer Dauerklasse in Tagen, plus Kennzeichen fuer offenes Ende.

    Gleiche Logik wie `sortierung()` in dauer.py: die hoechste Zahl im Namen
    ist die Obergrenze. „mehr als 731" und „366 bis 731" ergeben beide 731 —
    das zweite Tupelglied schiebt das offene Ende dahinter.
    """
    zahlen = [int(z) for z in re.findall(r"\d+", str(bezeichnung))]
    obergrenze = max(zahlen) if zahlen else 99999
    offen = 1 if re.search(r"\bab\b|mehr als", str(bezeichnung), re.I) else 0
    return (obergrenze, offen)


def klasse_fuer(bezeichnung: str) -> str:
    """Dauerklasse einer AMS-Bezeichnung zuordnen."""
    tage, offen = dauer_obergrenze(bezeichnung)
    if offen:
        return "lang"
    for schluessel, _, grenze in KLASSEN:
        if grenze is not None and tage <= grenze:
            return schluessel
    return "lang"


def baue_verfestigung(aktueller_monat) -> dict | None:
    """Verteilung der Vormerkdauer je Altersgruppe, drei Klassen."""
    kreuz = VORMERKDAUER.get("kreuz")
    if kreuz is None or kreuz.empty:
        warnen("Keine Kreuztabelle Alter x Vormerkdauer — "
               "Verfestigungs-Auswertung entfällt")
        return None

    jetzt = kreuz[kreuz["datum"] == aktueller_monat]
    if jetzt.empty:
        warnen("Kreuztabelle Alter x Vormerkdauer enthält den aktuellen "
               "Monat nicht — Verfestigungs-Auswertung entfällt")
        return None

    # --- Altersgruppen ordnen und die obersten zusammenlegen ---------------
    grenzen = {a: alter_grenzen(a) for a in jetzt["altersgruppe"].unique()}
    unlesbar = sorted(a for a, g in grenzen.items() if g is None)
    if unlesbar:
        warnen(f"Altersgruppen ohne erkennbare Grenzen: {unlesbar} — "
               f"fließen nicht in die Verfestigung ein")
    lesbar = {a: g for a, g in grenzen.items() if g is not None}
    if not lesbar:
        warnen("Keine verwertbaren Altersgruppen — "
               "Verfestigungs-Auswertung entfällt")
        return None

    schwelle = config.VERFESTIGUNG_AB

    def anzeigename(gruppe: str) -> str:
        von, bis = lesbar[gruppe]
        if von >= schwelle:
            return f"{schwelle} +"
        return f"unter {bis + 1}" if von <= config.ALTER_UNTERGRENZE \
            else f"{von}–{bis}"

    def sortierschluessel(gruppe: str) -> int:
        return min(schwelle, lesbar[gruppe][0])

    jetzt = jetzt[jetzt["altersgruppe"].isin(lesbar)].copy()
    jetzt["anzeige"] = jetzt["altersgruppe"].map(anzeigename)
    jetzt["ordnung"] = jetzt["altersgruppe"].map(sortierschluessel)
    jetzt["klasse"] = jetzt["dauer"].map(klasse_fuer)

    verschmolzen = sorted({anzeigename(a) for a in lesbar
                           if lesbar[a][0] >= schwelle})
    if len(verschmolzen) == 1:
        beteiligt = sorted(a for a in lesbar if lesbar[a][0] >= schwelle)
        log(f"    Altersgruppen ab {schwelle} zusammengelegt: "
            f"{', '.join(beteiligt)}")

    tabelle = (jetzt.groupby(["ordnung", "anzeige", "klasse"], as_index=False)
               ["bestand"].sum())

    # --- Ausgabe bauen -----------------------------------------------------
    schluessel = [s for s, _, _ in KLASSEN]
    gruppen = []
    for ordnung, anzeige in sorted({(o, a) for o, a in
                                    zip(tabelle["ordnung"], tabelle["anzeige"])}):
        zeile = tabelle[tabelle["anzeige"] == anzeige]
        werte = {k: int(zeile.loc[zeile["klasse"] == k, "bestand"].sum())
                 for k in schluessel}
        summe = sum(werte.values())
        if summe <= 0:
            continue
        gruppen.append({
            "alter": anzeige,
            "bestand": summe,
            "werte": [werte[k] for k in schluessel],
            "anteile": [anteil(werte[k], summe) for k in schluessel],
            "lang_pct": anteil(werte["lang"], summe),
        })

    if len(gruppen) < 3:
        warnen(f"Nur {len(gruppen)} Altersgruppen mit Bestand — "
               f"Verfestigungs-Auswertung entfällt")
        return None

    gesamt = sum(g["bestand"] for g in gruppen)
    lang_reihe = [g["lang_pct"] for g in gruppen]
    monoton = all(a < b for a, b in zip(lang_reihe, lang_reihe[1:]))
    if not monoton:
        # Kein Abbruch: die Grafik bleibt richtig, nur der Einordnungssatz
        # darf dann nicht mehr von „ohne Rückschritt" sprechen.
        warnen("Anteil über 1 Jahr steigt nicht mehr streng monoton mit dem "
               "Alter — Einordnungssatz in index.html prüfen")

    log(f"    {len(gruppen)} Altersgruppen · "
        f"{lang_reihe[0]:.1f} % → {lang_reihe[-1]:.1f} % über ein Jahr · "
        f"monoton: {'ja' if monoton else 'NEIN'}")

    return {
        "stand": pd.Timestamp(aktueller_monat).strftime("%Y-%m-%d"),
        "gesamt": gesamt,
        "klassen": [{"schluessel": s, "name": n} for s, n, _ in KLASSEN],
        "gruppen": gruppen,
        "monoton": monoton,
        "schwelle": schwelle,
        # Erster Entwurf hatte 399 Zeichen und wollte drei Dinge zugleich
        # sagen. Die bestehenden elf Hinweiszeilen liegen bei 150-234.
        # Die Zusammenlegung ab 60 steht jetzt in der Unterzeile.
        "hinweis": (
            "Vormerkdauer ist nicht Arbeitslosigkeitsdauer: Schulungen setzen "
            "die Zählung zurück. Die Grafik zeigt, dass es länger dauert — "
            "nicht warum."
        ),
    }
