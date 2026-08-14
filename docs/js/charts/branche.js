/* ===========================================================================
   Arbeitsmarkt-Dashboard Österreich — Themenstrang: branche
   ---------------------------------------------------------------------------
   Wird nach js/kern.js geladen; die Helfer kommen aus window.AMS.
   Der Diagrammcode selbst ist unverändert aus charts.js (v17) übernommen.
   =========================================================================== */
(function (AMS) {
"use strict";
const { stil, zahl, pz, monat, basis, achse, tabelle, setzeText, setzeHtml,
        deltaText, diagramme, schrift } = AMS;

/* --- 12 — Nach Wirtschaftszweig -------------------------------------- */
function baueBranche(daten) {
  const S = schrift();   /* Schriftgrößen aus den CSS-Variablen */
  if (!daten?.branchen?.length) return;
  const abschnitt = document.getElementById("s-branche");
  if (abschnitt) abschnitt.style.display = "";

  const feld = document.getElementById("c-branche");
  if (!feld) return;
  const d = echarts.getInstanceByDom(feld) || echarts.init(feld, null, { renderer: "svg" });
  if (!diagramme.includes(d)) diagramme.push(d);

  /* Der ÖNACE-Schlüssel („O78200 - …") gehört nicht auf die Achse. Das ETL
     trennt ihn seit v15 selbst ab; hier passiert dasselbe noch einmal, damit
     auch ein älterer Datenstand saubere Beschriftungen zeigt. */
  const ohneCode = (b) => {
    if (b.code !== undefined) return b;
    const treffer = /^([A-Z]?\d{3,6})\s*-\s*(.+)$/.exec(b.name ?? "");
    if (!treffer) return b;
    const klar = /^k\.?\s?a\.?$/i.test(treffer[2].trim()) ? "Ohne Angabe" : treffer[2].trim();
    return { ...b, name: klar, code: treffer[1] };
  };
  daten = { ...daten, branchen: daten.branchen.map(ohneCode) };

  const top = daten.branchen.slice(0, 10);
  setzeText("u-branche", `Zehn größte Wirtschaftszweige · Stand ${monat(daten.stand)}`);
  setzeText("h-branche", daten.hinweis);

  d.setOption({
    ...basis(),
    grid: { left: 210, right: 84, top: 10, bottom: 34 },
    tooltip: { ...basis().tooltip, trigger: "item",
      formatter: (p) => {
        const b = top[p.dataIndex];
        const v = b.veraenderung_pct;
        return `<strong>${b.name}</strong><br>${zahl(b.bestand)} Arbeitslose` +
          (v === null || v === undefined ? "" :
            `<br><span style="color:${v > 0 ? stil("--viz-kritisch") : stil("--viz-gut")}">` +
            `${v > 0 ? "▲" : "▼"} ${pz(Math.abs(v))} % ggü. Vorjahr</span>`);
      } },
    xAxis: { ...achse(), type: "value", axisLine: { show: false },
      axisLabel: { color: stil("--viz-muted"), fontSize: S.achse, formatter: (v) => zahl(v) } },
    yAxis: { ...achse(), type: "category", inverse: true,
      data: top.map((b) => b.name), splitLine: { show: false },
      axisLabel: { color: stil("--viz-text-2"), fontSize: S.serie, width: 196,
                   overflow: "break", margin: 12 } },
    series: [{ type: "bar", data: top.map((b) => b.bestand), barWidth: "58%",
      itemStyle: { color: stil("--viz-series-1"), borderRadius: [0, 4, 4, 0] },
      label: { show: true, position: "right", distance: 8,
               color: stil("--viz-text-2"), fontSize: S.label,
               formatter: (p) => zahl(p.value) } }],
  }, { replaceMerge: ["series", "yAxis"] });

  setzeHtml("t-branche", tabelle(
    [{ titel: "Wirtschaftszweig", wert: (z) => z.name },
     { titel: "ÖNACE", wert: (z) => z.code || "–" },
     { titel: "Arbeitslose", num: true, wert: (z) => zahl(z.bestand) },
     { titel: "ggü. Vorjahr", num: true,
       wert: (z) => z.veraenderung_pct === null || z.veraenderung_pct === undefined ? "–"
         : `${z.veraenderung_pct > 0 ? "+" : ""}${pz(z.veraenderung_pct)} %` }],
    daten.branchen
  ));
}

AMS.baueBranche = baueBranche;
})(window.AMS);
