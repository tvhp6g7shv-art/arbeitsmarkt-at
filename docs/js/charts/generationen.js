/* ===========================================================================
   Arbeitsmarkt-Dashboard Österreich — Themenstrang: generationen
   ---------------------------------------------------------------------------
   Wird nach js/kern.js geladen; die Helfer kommen aus window.AMS.
   Der Diagrammcode selbst ist unverändert aus charts.js (v17) übernommen.
   =========================================================================== */
(function (AMS) {
"use strict";
const { stil, zahl, pz, monat, basis, achse, tabelle, setzeText, setzeHtml,
        deltaText, diagramme, schrift } = AMS;

/* --- 3b — Generationen: eine Farbe, Geburtsjahre als Zweitzeile ------
   Die Zuordnung Altersgruppe → Generation ist eine Näherung; der Hinweis
   dazu steht unter dem Diagramm, die exakten Altersgruppen in der Tabelle. */
function baueGenerationen(daten, region) {
  const S = schrift();   /* Schriftgrößen aus den CSS-Variablen */
  if (!daten || !daten.generationen?.length) return;
  document.getElementById("s-generationen").style.display = "";

  const feld = document.getElementById("c-generationen");
  const d = echarts.getInstanceByDom(feld) || echarts.init(feld, null, { renderer: "svg" });
  if (!diagramme.includes(d)) diagramme.push(d);

  const je = daten.je_bundesland || {};
  const werte = daten.generationen.map((g) =>
    region === "AT" ? g.bestand : (je[region]?.[g.schluessel] ?? 0)
  );
  const namen = daten.generationen.map((g) => `${g.name}\n${g.geburtsjahre}`);
  const summe = werte.reduce((a, b) => a + b, 0);

  document.getElementById("u-generationen").textContent =
    `${region === "AT" ? "Österreich gesamt" : region} · Stand ${monat(daten.stand)}`;
  document.getElementById("h-generationen").textContent = daten.hinweis ?? "";

  d.setOption({
    ...basis(),
    grid: { left: 172, right: 72, top: 10, bottom: 34 },
    tooltip: {
      ...basis().tooltip, trigger: "item",
      formatter: (p) => {
        const g = daten.generationen[p.dataIndex];
        return `<strong>${g.name}</strong><br>` +
          `<span style="color:${stil("--viz-muted")}">geboren ${g.geburtsjahre} · ` +
          `heute ${g.alter_von}–${g.alter_bis} Jahre</span><br>` +
          `${zahl(p.value)} Personen` +
          (summe ? `<br><span style="color:${stil("--viz-muted")}">` +
            `${pz(p.value / summe * 100)} % aller Arbeitslosen</span>` : "") +
          (g.altersgruppen?.length ? `<br><span style="color:${stil("--viz-muted")}">` +
            `Altersgruppen: ${g.altersgruppen.join(", ")}</span>` : "");
      },
    },
    xAxis: { ...achse(), type: "value", axisLine: { show: false },
             axisLabel: { color: stil("--viz-muted"), fontSize: S.achse, formatter: (v) => zahl(v) } },
    yAxis: { ...achse(), type: "category", data: namen, inverse: true,
             splitLine: { show: false },
             axisLabel: { color: stil("--viz-text-2"), fontSize: S.serie, lineHeight: 15,
                          width: 158, overflow: "break", margin: 12 } },
    series: [{
      type: "bar", data: werte, barWidth: "58%",
      itemStyle: { color: stil("--viz-series-1"), borderRadius: [0, 4, 4, 0] },
      label: { show: true, position: "right", distance: 8,
               color: stil("--viz-text-2"), fontSize: S.label,
               formatter: (p) => zahl(p.value) },
    }],
  }, { replaceMerge: ["series", "yAxis"] });

  // Tabelle zeigt die unverfälschte Ebene: die AMS-Altersgruppen selbst
  const nachSchluessel = Object.fromEntries(daten.generationen.map((g) => [g.schluessel, g.name]));
  document.getElementById("t-generationen").innerHTML = tabelle(
    [{ titel: "Altersgruppe", wert: (z) => z.beschriftung },
     { titel: "Zugeordnete Generation", wert: (z) => nachSchluessel[z.generation] ?? z.generation },
     { titel: "Personen", num: true, wert: (z) => zahl(z.bestand) }],
    daten.altersgruppen ?? []
  );
}

AMS.baueGenerationen = baueGenerationen;
})(window.AMS);
