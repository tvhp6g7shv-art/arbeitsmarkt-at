/* ===========================================================================
   Arbeitsmarkt-Dashboard Österreich — Themenstrang: eukarte
   ---------------------------------------------------------------------------
   Wird nach js/kern.js geladen; die Helfer kommen aus window.AMS.
   Neu in v20. Ersetzt den früheren Linienvergleich AT / EU-27 / Deutschland
   (docs/js/charts/eu.js, bis v19).
   =========================================================================== */
(function (AMS) {
"use strict";
const { stil, pz, basis, tabelle, setzeText, setzeHtml, diagramme, schrift } = AMS;

/* --- 10 — EU-Länderkarte: Veränderung der Quote ggü. Vorjahr ----------
   Bewusst dieselbe Bildsprache wie die Bezirkskarte — divergierend, Grün für
   Rückgang, Rot für Anstieg —, aber eine ANDERE Größe:

     Bezirkskarte:  Veränderung des AMS-Bestands in PROZENT (Personenzahlen,
                    nationale Definition, monatlich)
     diese Karte:   Differenz zweier QUOTEN in PROZENTPUNKTEN (ILO-Definition,
                    jährlich)

   Deshalb steht überall „%-Punkte" und nirgends „%" bei der Veränderung. Von 4,0
   auf 4,4 sind +0,4 Prozentpunkte; als „+10 %" wäre dasselbe formal richtig,
   aber irreführend — kleine Ausgangsquoten erzeugen große Prozentwerte. */
/* Kartenrahmen [[West, Süd], [Ost, Nord]].
   Bewusst ENGER als der Zuschnitt im ETL (config.EU_KARTE_AUSSCHNITT geht bis
   -25°): Madeira liegt bei -17,3° und zog den Rahmen rund acht Längengrade
   nach Westen — Europa saß rechts der Mitte, links stand leerer Atlantik.
   Die Fläche bleibt in der Geometrie, sie wird nur nicht ins Bild gefasst.
   Grenzen: Portugal -9,5°, Zypern 34,6°, Kreta 34,8° Nord, Lappland 70,1°. */
const RAHMEN_EU = [[-10.5, 34.0], [34.9, 70.9]];

function baueEuKarte(daten, geo) {
  const S = schrift();   /* Schriftgrößen aus den CSS-Variablen */
  const feld = document.getElementById("c-eukarte");
  if (!feld) return;

  const abschnitt = document.getElementById("s-eukarte");

  if (!daten?.laender?.length || !geo) {
    /* Höhe zurücknehmen, sonst bleibt ein leerer Kasten stehen. */
    feld.className = "";
    feld.style.height = "auto";
    feld.innerHTML = `<p class="viz-unterzeile" style="padding:4px 0 0">
      Die EU-Karte ist gerade nicht verfügbar.</p>`;
    const knopf = document.querySelector('[data-ziel="t-eukarte"]');
    if (knopf) knopf.style.display = "none";
    if (abschnitt && !daten?.laender?.length) abschnitt.style.display = "none";
    return;
  }
  if (abschnitt) abschnitt.style.display = "";

  const mitWert = daten.laender.filter(
    (l) => l.veraenderung_pp !== null && l.veraenderung_pp !== undefined);
  const ohneWert = daten.laender.length - mitWert.length;

  /* Symmetrisch um null runden, sonst wirkt eine Seite stärker als sie ist.
     Auf 0,1 %-Punkte gerundet — bei Quoten sind die Ausschläge klein, eine
     Rundung auf halbe Punkte wie bei der Bezirkskarte würde die Skala
     unnötig weit aufziehen. */
  const spanne = Math.max(0.5, ...mitWert.map((l) => Math.abs(l.veraenderung_pp)));
  const grenze = Math.ceil(spanne * 10) / 10;

  const sortiert = [...mitWert].sort((a, b) => a.veraenderung_pp - b.veraenderung_pp);
  const bester = sortiert[0];
  const schlechtester = sortiert[sortiert.length - 1];
  const at = daten.laender.find((l) => l.code === "AT");

  setzeText("u-eukarte",
    `Veränderung ${daten.vorjahr} → ${daten.jahr} in Prozentpunkten · ` +
    `Grün = Rückgang, Rot = Anstieg · ${daten.laender.length} Mitgliedstaaten` +
    (ohneWert ? ` · ${ohneWert} ohne Vergleichswert` : ""));

  setzeText("h-eukarte",
    (bester && schlechtester
      ? `Stärkster Rückgang: ${bester.name} (${vz(bester.veraenderung_pp)}). ` +
        `Stärkster Anstieg: ${schlechtester.name} (${vz(schlechtester.veraenderung_pp)}). `
      : "") +
    (at && at.veraenderung_pp !== null && at.veraenderung_pp !== undefined
      ? `Österreich: ${vz(at.veraenderung_pp)} auf ${pz(at.quote)} %. `
      : "") +
    "Prozentpunkte, nicht Prozent: von 4,0 auf 4,4 sind +0,4 %-Punkte. Diese Quoten " +
    "folgen der EU-Definition und sind nicht mit den absoluten AMS-Zahlen weiter " +
    "oben verrechenbar. Eurostat liefert die Reihe jährlich — die Karte ist " +
    "deshalb weniger aktuell als die Monatszahlen. Überseegebiete sind aus " +
    "Darstellungsgründen nicht gezeichnet, ihre Werte stecken im Landeswert.");

  const normalisieren = AMS.flaechenNormalisieren ?? ((g) => g);
  echarts.registerMap("eu-laender", normalisieren(geo));

  const d = echarts.getInstanceByDom(feld) || echarts.init(feld, null, { renderer: "canvas" });
  if (!diagramme.includes(d)) diagramme.push(d);

  const nachName = Object.fromEntries(daten.laender.map((l) => [l.name, l]));
  const werte = daten.laender.map((l) => ({
    name: l.name,
    value: l.veraenderung_pp === null || l.veraenderung_pp === undefined
      ? "-" : l.veraenderung_pp,
  }));

  d.setOption({
    ...basis(),
    tooltip: {
      ...basis().tooltip, trigger: "item",
      formatter: (p) => {
        const l = nachName[p.name];
        if (!l) return `${p.name}<br><span style="color:${stil("--viz-muted")}">keine Daten</span>`;
        const v = l.veraenderung_pp;
        return `<strong>${l.name}</strong><br>` +
          (v === null || v === undefined
            ? `<span style="color:${stil("--viz-muted")}">keine Vergleichszahl</span><br>`
            : `<span style="color:${v > 0 ? stil("--viz-kritisch") : stil("--viz-gut")}">` +
              `${v > 0 ? "▲ Anstieg" : v < 0 ? "▼ Rückgang" : "unverändert"} ` +
              `${pz(Math.abs(v))} %-Punkte</span><br>`) +
          `<span style="color:${stil("--viz-muted")}">` +
          `${daten.jahr}: ${pz(l.quote)} %` +
          (l.quote_vorjahr === null || l.quote_vorjahr === undefined
            ? "" : ` · ${daten.vorjahr}: ${pz(l.quote_vorjahr)} %`) +
          `</span>`;
      },
    },
    visualMap: {
      type: "continuous",
      min: -grenze, max: grenze, left: 12, bottom: 14, orient: "vertical",
      itemWidth: 12, itemHeight: 150, calculable: true,
      text: ["Anstieg", "Rückgang"],
      formatter: (v) => (v > 0 ? "+" : "") + pz(v) + " %-Punkte",
      textStyle: { color: stil("--viz-muted"), fontSize: S.achse },
      inRange: { color: [
        stil("--viz-div-gut-4"), stil("--viz-div-gut-3"), stil("--viz-div-gut-2"),
        stil("--viz-div-gut-1"), stil("--viz-div-neutral"),
        stil("--viz-div-schlecht-1"), stil("--viz-div-schlecht-2"),
        stil("--viz-div-schlecht-3"), stil("--viz-div-schlecht-4"),
      ] },
    },
    series: [{
      type: "map", map: "eu-laender", data: werte,
      roam: true,
      /* Layout und Rahmen aus AMS.kartenLayout — dort steht die Begründung. */
      ...AMS.kartenLayout(feld, RAHMEN_EU, 0.625),
      itemStyle: { areaColor: stil("--viz-grid"), borderColor: stil("--viz-surface"), borderWidth: 0.8 },
      emphasis: { label: { show: false },
                  itemStyle: { borderColor: stil("--viz-text"), borderWidth: 1.5 } },
      select: { disabled: true },
    }],
  }, { replaceMerge: ["series"] });

  /* layoutSize ist eine Pixelzahl und überlebt kein resize — Nachrechnung,
     die kern.js beim resize aufruft. */
  d.__neuLayouten = () => d.setOption({
    series: [AMS.kartenLayout(feld, RAHMEN_EU, 0.625)],
  });

  /* Tabelle nach Veränderung sortiert — stärkster Rückgang zuerst. Dieselbe
     Frage wie die Karte, nur in Zahlen. */
  setzeHtml("t-eukarte", tabelle(
    [{ titel: "Land", wert: (z) => z.name },
     { titel: `Quote ${daten.jahr}`, num: true, wert: (z) => pz(z.quote) + " %" },
     { titel: `Quote ${daten.vorjahr}`, num: true,
       wert: (z) => z.quote_vorjahr === null || z.quote_vorjahr === undefined
         ? "–" : pz(z.quote_vorjahr) + " %" },
     { titel: "Veränderung", num: true,
       wert: (z) => z.veraenderung_pp === null || z.veraenderung_pp === undefined
         ? "–" : vz(z.veraenderung_pp) }],
    [...daten.laender].sort((x, y) => {
      const a = x.veraenderung_pp, b = y.veraenderung_pp;
      if (a === null || a === undefined) return 1;
      if (b === null || b === undefined) return -1;
      return a - b;
    })
  ));
}

/* Vorzeichenbehaftete Angabe: „+0,4 %-Punkte", „−0,3 %-Punkte", „0,0 %-Punkte".
   Ausgeschrieben statt „Pp": die Abkuerzung ist Fachjargon und wurde als
   Prozentzeichen missverstanden. Prozentpunkte sind NICHT Prozent —
   Oesterreich ging von 5,2 auf 5,7 Prozent, das sind +0,5 %-Punkte, aber
   +9,6 Prozent relativ. */
function vz(wert) {
  if (wert === null || wert === undefined) return "–";
  return `${wert > 0 ? "+" : ""}${pz(wert)} %-Punkte`;
}

AMS.baueEuKarte = baueEuKarte;
})(window.AMS);
