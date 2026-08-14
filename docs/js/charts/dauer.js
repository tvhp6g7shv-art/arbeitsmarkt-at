/* ===========================================================================
   Arbeitsmarkt-Dashboard Österreich — Themenstrang: dauer
   ---------------------------------------------------------------------------
   Wird nach js/kern.js geladen; die Helfer kommen aus window.AMS.
   Der Diagrammcode selbst ist unverändert aus charts.js (v17) übernommen.
   =========================================================================== */
(function (AMS) {
"use strict";
const { stil, zahl, pz, monat, basis, achse, tabelle, setzeText, setzeHtml,
        deltaText, diagramme, schrift ,
        istSchmal, balkenGitter, kategorieLabel, legende, endLabelZeigen} = AMS;

/* --- 8 — Vormerkdauer und Langzeitbeschäftigungslosigkeit ------------
   Geordnete Kategorien, deshalb eine Farbe: die Balkenlänge trägt die
   Größe, der Farbton hätte nichts hinzuzufügen. */
/* Achsenbeschriftung ohne die Tagesangabe in der Klammer (v20, User-Wunsch):
   „2 Quartale (92 bis 183 Tage)" -> „2 Quartale". Die Klammer verdoppelte für
   jede Kategorie dieselbe Information und zwang die Beschriftung in zwei
   Zeilen. Sie bleibt in Tooltip und Tabelle stehen — dort ist Platz, und die
   genaue Abgrenzung soll nachlesbar sein. */
const ohneTage = (name) => String(name).replace(/\s*\([^)]*\)\s*$/, "").trim();

function baueDauer(daten) {
  const S = schrift();   /* Schriftgrößen aus den CSS-Variablen */
  if (!daten?.vormerkdauer?.gruppen?.length) return;
  const abschnitt = document.getElementById("s-dauer");
  if (abschnitt) abschnitt.style.display = "";

  const feld = document.getElementById("c-dauer");
  if (!feld) return;
  const d = echarts.getInstanceByDom(feld) || echarts.init(feld, null, { renderer: "svg" });
  if (!diagramme.includes(d)) diagramme.push(d);

  const gruppen = daten.vormerkdauer.gruppen;
  setzeText("u-dauer", `Wie lange die aktuell Vorgemerkten schon gemeldet sind · Stand ${monat(daten.vormerkdauer.stand)}`);
  setzeText("h-dauer", daten.langzeit?.hinweis ?? "");

  d.setOption({
    ...basis(),
    grid: balkenGitter(feld, { left: 150, right: 84 }),
    tooltip: { ...basis().tooltip, trigger: "item",
      formatter: (p) => `<strong>${p.name}</strong><br>${zahl(p.value)} Personen<br>` +
        `<span style="color:${stil("--viz-muted")}">${pz(gruppen[p.dataIndex].anteil_pct)} % aller Vorgemerkten</span>` },
    xAxis: { ...achse(), type: "value", axisLine: { show: false },
      axisLabel: { hideOverlap: true, color: stil("--viz-muted"), fontSize: S.achse, formatter: (v) => zahl(v) } },
    yAxis: { ...achse(), type: "category", inverse: true,
      data: gruppen.map((g) => ohneTage(g.name)), splitLine: { show: false },
      axisLabel: { color: stil("--viz-text-2"), fontSize: S.serie, width: 136,
                   overflow: "break", margin: 12,
                   ...kategorieLabel(feld) } },
    series: [{ type: "bar", data: gruppen.map((g) => g.bestand), barWidth: "58%",
      itemStyle: { color: stil("--viz-series-1"), borderRadius: [0, 4, 4, 0] },
      label: { show: true, position: "right", distance: 8,
               color: stil("--viz-text-2"), fontSize: S.label,
               formatter: (p) => zahl(p.value) } }],
  }, { replaceMerge: ["series", "yAxis"] });

  setzeHtml("t-dauer", tabelle(
    [{ titel: "Vormerkdauer", wert: (z) => z.name },
     { titel: "Personen", num: true, wert: (z) => zahl(z.bestand) },
     { titel: "Anteil", num: true, wert: (z) => pz(z.anteil_pct) + " %" }],
    gruppen
  ));
}

AMS.baueDauer = baueDauer;
})(window.AMS);
