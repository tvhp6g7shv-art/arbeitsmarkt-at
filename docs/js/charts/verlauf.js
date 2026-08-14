/* ===========================================================================
   Arbeitsmarkt-Dashboard Österreich — Themenstrang: verlauf
   ---------------------------------------------------------------------------
   Wird nach js/kern.js geladen; die Helfer kommen aus window.AMS.
   Der Diagrammcode selbst ist unverändert aus charts.js (v17) übernommen.
   =========================================================================== */
(function (AMS) {
"use strict";
const { stil, zahl, pz, monat, basis, achse, tabelle, setzeText, setzeHtml,
        deltaText, diagramme, schrift } = AMS;

/* --- 3a — Verlauf der Ausbildungsgruppen ----------------------------
   Sechs Linien über die letzten 18 Monate. Feste Farbzuordnung je Gruppe:
   die Farbe folgt der Sache, nicht dem Rang. „Ungeklärt" bleibt draußen —
   die Kategorie sagt nichts aus und kostet nur eine Farbe. */
/* Anzeigereihenfolge im Verlaufsdiagramm. „akademie" ist seit v16 in
   „hoch" aufgegangen — bleibt hier als Rückfall stehen, damit ein noch
   nicht neu gerechneter Datenstand nicht plötzlich eine Linie verliert. */
const VERLAUF_GRUPPEN = ["pflicht", "lehre", "mittel", "matura", "hoch", "akademie"];

function baueVerlauf(daten, modus = "absolut") {
  const S = schrift();   /* Schriftgrößen aus den CSS-Variablen */
  const quelle = daten?.zeitreihe_gruppen;
  if (!quelle?.serien) return;
  document.getElementById("s-verlauf").style.display = "";

  const monate = quelle.monate;
  const namen = Object.fromEntries(daten.gruppen.map((g) => [g.schluessel, g.name]));
  const vorhanden = VERLAUF_GRUPPEN.filter((k) => quelle.serien[k]);

  const feld = document.getElementById("c-verlauf");
  const d = echarts.getInstanceByDom(feld) || echarts.init(feld, null, { renderer: "svg" });
  if (!diagramme.includes(d)) diagramme.push(d);

  const farben = [stil("--viz-series-1"), stil("--viz-series-2"), stil("--viz-series-3"),
                  stil("--viz-series-4"), stil("--viz-series-5"), stil("--viz-series-6")];
  const istIndex = modus === "index";
  const startMonat = monat(monate[0]);

  const hatHochschule = vorhanden.includes("hoch");
  document.getElementById("u-verlauf").textContent = (istIndex
    ? `Entwicklung seit ${startMonat}, Ausgangswert = 100 · Österreich gesamt`
    : `Bestand am Monatsende, Österreich gesamt · letzte ${monate.length} Monate`)
    + (hatHochschule
        ? " · „Hochschule“ umfasst Akademie, Bachelor, Master, Diplom und Doktorat"
        : "");

  const serien = vorhanden.map((schluessel, i) => {
    const roh = quelle.serien[schluessel];
    const start = roh.find((v) => v > 0) || 1;
    return {
      name: namen[schluessel] ?? schluessel,
      type: "line",
      data: istIndex ? roh.map((v) => Math.round(v / start * 1000) / 10) : roh,
      showSymbol: false, symbol: "circle", symbolSize: 8,
      lineStyle: { width: 2, color: farben[i] },
      itemStyle: { color: farben[i] },
      emphasis: { focus: "series" },
      endLabel: { show: true, formatter: (p) => p.seriesName,
                  color: stil("--viz-text-2"), fontSize: S.achse, distance: 6 },
      labelLayout: { moveOverlap: "shiftY" },
    };
  });

  d.setOption({
    ...basis(),
    grid: { left: 8, right: 200, top: 34, bottom: 8, containLabel: true },
    legend: { top: 0, left: 0, itemWidth: 11, itemHeight: 11, itemGap: 14,
              textStyle: { color: stil("--viz-text-2"), fontSize: S.serie } },
    tooltip: {
      ...basis().tooltip, trigger: "axis",
      axisPointer: { type: "line", lineStyle: { color: stil("--viz-axis"), width: 1 } },
      formatter: (p) => `<strong>${monat(monate[p[0].dataIndex])}</strong><br>` +
        p.map((r) => `${r.marker} ${r.seriesName}&nbsp;&nbsp;<strong>` +
          `${istIndex ? pz(r.value) : zahl(r.value)}</strong>`).join("<br>"),
    },
    xAxis: {
      ...achse(), type: "category", boundaryGap: false, data: monate,
      splitLine: { show: false },
      axisLabel: { color: stil("--viz-muted"), fontSize: S.achse,
        formatter: (v) => new Date(v).toLocaleDateString("de-AT",
          { month: "short", year: "2-digit" }) },
    },
    yAxis: {
      ...achse(), type: "value", axisLine: { show: false },
      axisLabel: { color: stil("--viz-muted"), fontSize: S.achse,
                   formatter: (v) => istIndex ? v : zahl(v) },
    },
    series: serien,
  }, { replaceMerge: ["series"] });

  document.getElementById("t-verlauf").innerHTML = tabelle(
    [{ titel: "Monat", wert: (z) => monat(z.m) },
     ...vorhanden.map((k) => ({ titel: namen[k] ?? k, num: true,
                                wert: (z) => zahl(quelle.serien[k][z.i]) }))],
    monate.map((m, i) => ({ m, i })).reverse()
  );
}

AMS.VERLAUF_GRUPPEN = VERLAUF_GRUPPEN;
AMS.baueVerlauf = baueVerlauf;
})(window.AMS);
