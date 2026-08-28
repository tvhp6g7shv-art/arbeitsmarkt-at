"""
Themenstrang: Saisonfigur der Kultur- und Veranstaltungsbranche (festspiele.json)

Zweite Auswertung derselben Datei, die `branche.py` ohnehin lädt
(`AL_NACE_RGS.csv`, rund 470 MB). Deshalb bekommt dieses Modul die Tabelle
übergeben statt sie erneut zu holen — `lade_optional` hat keinen Zwischenspeicher,
ein eigener Aufruf würde den Download verdoppeln.

Gegenstand: Wann meldet sich die Kulturbranche arbeitslos? In Salzburg im
September, im übrigen Österreich im Juli. Dazwischen liegen die Festspiele.

ZWEI FALLEN, die still danebengehen — beide in der Quelle begründet:

1. Die AMS-Buchstaben sind NICHT die ÖNACE-Abschnitte. `O78200` steht für
   78.20 (ÖNACE-Abschnitt N), `R88990` für 88.99 (ÖNACE Q), `S9020` für
   90.20 (ÖNACE R). Gefiltert wird deshalb über den numerischen Teil.

2. Die Geschäftsstelle `Salzburg` wurde 06/2022 in `Salzburg-Stadt` und
   `Salzburg-Umgebung` geteilt. Ein Filter auf einen der Namen erzeugt an
   dieser Stelle eine Stufe nach unten, die wie ein Rückgang aussieht.
   Deshalb werden alle drei Namen zusammengefasst.
"""

from __future__ import annotations

import pandas as pd

from gemeinsam import log, spalte_finden, warnen, zu_zahl

# Die drei Namen derselben Region über die Zeit hinweg (siehe Falle 2).
REGION = ("Salzburg", "Salzburg-Stadt", "Salzburg-Umgebung")

# ÖNACE-Gruppe 90: darstellende Kunst und alles, was sie ermöglicht.
# Gefiltert über die Ziffern, nicht über den Buchstaben (siehe Falle 1).
NACE_PRAEFIX = "90"

MONATSNAMEN = ["Jän", "Feb", "Mär", "Apr", "Mai", "Jun",
               "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"]
MONATE_LANG = ["Jänner", "Februar", "März", "April", "Mai", "Juni", "Juli",
               "August", "September", "Oktober", "November", "Dezember"]

# Pandemiejahre bleiben draußen: 2020 verschiebt die Spitze in den März,
# 2021 lief die Saison unter Auflagen. Beide würden die Figur verwischen,
# ohne etwas über den Normalbetrieb zu sagen.
JAHRE_AUSGENOMMEN = {2020, 2021}


def _saisonfigur(nach_jahr: dict[int, list[float]], jahre: list[int]) -> list[float]:
    """
    Mittlere prozentuale Abweichung vom jeweiligen Jahresdurchschnitt.

    Warum je Jahr normiert und nicht über die ganze Reihe: Das Niveau
    schwankt zwischen den Jahren (2020 liegt doppelt so hoch wie 2022).
    Ohne Normierung je Jahr trüge die Figur diesen Niveauunterschied statt
    der Saisonalität. Gleiches Verfahren wie in `saison.js`.
    """
    summe = [0.0] * 12
    for jahr in jahre:
        werte = nach_jahr[jahr]
        mittel = sum(werte) / 12
        if mittel == 0:
            continue
        for i, wert in enumerate(werte):
            summe[i] += (wert - mittel) / mittel * 100
    return [round(x / len(jahre), 1) for x in summe]


def baue_festspiele(tabelle: pd.DataFrame | None) -> dict | None:
    """Saisonfigur der Kulturbranche, Salzburg gegen das übrige Österreich."""
    if tabelle is None:
        return None

    spalte_rgs = spalte_finden(tabelle, "rgsname")
    spalte_nace = spalte_finden(tabelle, "nace_4") or spalte_finden(tabelle, "nace")
    if spalte_rgs is None or spalte_nace is None or "datum" not in tabelle.columns:
        warnen(
            "Festspiele: erwartete Spalten (rgsname, nace_4, datum) fehlen "
            f"— vorhanden: {', '.join(tabelle.columns)}. Abschnitt entfällt"
        )
        return None

    t = tabelle.copy()
    t["datum"] = pd.to_datetime(t["datum"], errors="coerce")
    t = t.dropna(subset=["datum"])
    t["bestand"] = zu_zahl(t["bestand"])
    t["zugang"] = zu_zahl(t["zugang"])

    ziffern = t[spalte_nace].astype(str).str.replace(r"\D", "", regex=True)
    ist_kultur = ziffern.str.startswith(NACE_PRAEFIX)
    ist_salzburg = t[spalte_rgs].isin(REGION)

    if not ist_kultur.any():
        warnen("Festspiele: keine Zeile mit ÖNACE-Präfix 90 gefunden — "
               "hat die Quelle ihre Systematik geändert? Abschnitt entfällt")
        return None
    if not ist_salzburg.any():
        warnen("Festspiele: keine Zeile mit einem der Salzburger "
               f"Geschäftsstellennamen ({', '.join(REGION)}) — Abschnitt entfällt")
        return None

    def reihe(maske, spalte: str) -> pd.Series:
        return t[maske].groupby(t.loc[maske, "datum"])[spalte].sum()

    sbg_bestand = reihe(ist_kultur & ist_salzburg, "bestand")
    sbg_zugang = reihe(ist_kultur & ist_salzburg, "zugang")
    at_zugang = reihe(ist_kultur, "zugang")
    alle_zugang = reihe(ist_salzburg, "zugang")

    monate = sorted(at_zugang.index)
    hole = lambda s, m: float(s.get(m, 0))

    # Vergleichsgröße ist Österreich OHNE Salzburg. Der Landeswert enthält
    # Salzburg mit rund einem Zehntel der Septemberzugänge und zöge die
    # Vergleichslinie zum eigenen Befund hin.
    rest_zugang = {m: hole(at_zugang, m) - hole(sbg_zugang, m) for m in monate}

    def nach_jahr(werte) -> dict[int, list[float]]:
        gruppen: dict[int, list[float]] = {}
        for m in monate:
            gruppen.setdefault(m.year, []).append(
                werte[m] if isinstance(werte, dict) else hole(werte, m)
            )
        return gruppen

    j_sbg_z, j_sbg_b = nach_jahr(sbg_zugang), nach_jahr(sbg_bestand)
    j_rest, j_alle = nach_jahr(rest_zugang), nach_jahr(alle_zugang)

    # Nur vollständige Kalenderjahre ohne Pandemie. Ein angebrochenes Jahr
    # hätte einen Jahresdurchschnitt, der die fehlenden Monate nicht kennt.
    voll = [j for j, w in j_sbg_z.items() if len(w) == 12]
    jahre = sorted(j for j in voll if j not in JAHRE_AUSGENOMMEN)
    if len(jahre) < 2:
        warnen(f"Festspiele: nur {len(jahre)} auswertbare Jahre — Abschnitt entfällt")
        return None

    fig_sbg = _saisonfigur(j_sbg_z, jahre)
    fig_rest = _saisonfigur(j_rest, jahre)
    fig_alle = _saisonfigur(j_alle, jahre)

    # Jahrestabelle: alle vollständigen Jahre, auch die Pandemiejahre.
    # Sie gehören nicht in die Figur, aber sie gehören gezeigt — sonst sieht
    # es aus, als hätte jemand die unbequemen Jahre weggelassen.
    zeilen = []
    for jahr in sorted(voll):
        z, b = j_sbg_z[jahr], j_sbg_b[jahr]
        summe = sum(z)
        spitze = z.index(max(z))
        zeilen.append({
            "jahr": jahr,
            "sep_zugang": int(z[8]),
            "anteil": round(z[8] / summe * 100, 1) if summe else None,
            "mai_bestand": int(b[4]),
            "sep_bestand": int(b[8]),
            "veraenderung": round((b[8] / b[4] - 1) * 100) if b[4] else None,
            "spitzenmonat": MONATE_LANG[spitze],
            "pandemie": jahr in JAHRE_AUSGENOMMEN,
        })

    sep_spitze = sum(1 for z in zeilen if z["spitzenmonat"] == "September")
    faktoren = [z["sep_bestand"] / z["mai_bestand"] for z in zeilen
                if z["jahr"] in jahre and z["mai_bestand"]]

    log(f"    Salzburg September {fig_sbg[8]:+.1f} %, "
        f"übriges Österreich Juli {fig_rest[6]:+.1f} % "
        f"({len(jahre)} Jahre: {', '.join(map(str, jahre))})")

    return {
        "stand": pd.Timestamp(monate[-1]).strftime("%Y-%m-%d"),
        "region": "AMS-Geschäftsstellen Salzburg-Stadt und Salzburg-Umgebung",
        "monatsnamen": MONATSNAMEN,
        "jahre_verwendet": jahre,
        "saison": {
            "salzburg": fig_sbg,
            "rest": fig_rest,
            "alle": fig_alle,
        },
        "reihen": {
            "monate": [pd.Timestamp(m).strftime("%Y-%m-%d") for m in monate],
            "bestand": [int(hole(sbg_bestand, m)) for m in monate],
            "zugang": [int(hole(sbg_zugang, m)) for m in monate],
        },
        "jahre": zeilen,
        "kennzahlen": {
            "sep_salzburg": fig_sbg[8],
            "jul_rest": fig_rest[6],
            "jaenner_alle": fig_alle[0],
            "sep_spitze_von": len(zeilen),
            "sep_spitze_anzahl": sep_spitze,
            "faktor_mai_sep": round(sum(faktoren) / len(faktoren), 2) if faktoren else None,
        },
        # Hinweiszeilen liegen im Dashboard zwischen 150 und 234 Zeichen.
        "hinweis": (
            "Gezählt werden Personen, die sich arbeitslos melden und zuletzt in "
            "dieser Branche gearbeitet haben — keine Beschäftigten. Freie "
            "Dienstverträge und Gastkünstler aus dem Ausland kommen darin nicht "
            "vor. Die Zahlen sind klein."
        ),
    }
