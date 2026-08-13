# Einbau in Oxygen 6

Grundgedanke: **Die Daten kommen von GitHub, das Design kommt von dir.**
Die Diagramme sind normale Elemente in deiner Seite — keine iframes. Du kannst
sie mit Oxygen positionieren, umranden, in Grids legen und responsiv machen wie
jedes andere Element.

---

## Der Trick: Charts lesen deine Oxygen-Variablen

Das Chart-JavaScript bringt **keine eigenen Farben** mit. Es liest die
CSS-Variablen aus, die du in Oxygen definierst:

```js
const stil = (name) => getComputedStyle(wurzel).getPropertyValue(name).trim();
lineStyle: { color: stil("--viz-series-1") }
```

Du änderst `--viz-series-1` in Oxygen → alle Diagramme ziehen nach.
Kein JavaScript anfassen.

---

## Schritt 1 — Variablen im globalen Stylesheet anlegen

In Oxygen: **Manage → Stylesheets → Add Stylesheet** (nenn es z.B. `dashboard`).
Dort hinein:

```css
:root {
  /* Flächen und Text — an dein Theme anpassen */
  --viz-surface:  #ffffff;
  --viz-text:     #111111;
  --viz-text-2:   #555555;
  --viz-muted:    #8a8a8a;
  --viz-grid:     #e6e6e6;
  --viz-axis:     #cccccc;
  --viz-border:   rgba(0,0,0,0.10);

  /* Deine Markenfarben für die Diagramme */
  --viz-series-1: #2a78d6;
  --viz-series-2: #eb6834;

  /* Skala der Karte: EINE Farbe, hell nach dunkel */
  --viz-seq-1: #cde2fb;
  --viz-seq-2: #86b6ef;
  --viz-seq-3: #3987e5;
  --viz-seq-4: #256abf;
  --viz-seq-5: #184f95;
  --viz-seq-6: #0d366b;

  /* Veränderungen — nur diese zwei, immer mit Pfeil und Text */
  --viz-gut:      #006300;
  --viz-kritisch: #d03b3b;

  --viz-font: var(--font-body, system-ui, sans-serif);
}
```

### Worauf du beim Farbwechsel achten musst

Die Voreinstellungen sind geprüft — auf Kontrast und auf Lesbarkeit bei
Farbfehlsichtigkeit. Wenn du eigene Farben einsetzt, gelten drei Regeln:

1. **Die Kartenskala braucht eine einzige Farbe, hell → dunkel.** Kein
   Regenbogen, keine zwei Farbtöne. Sonst liest man Größenunterschiede falsch.
2. **`--viz-series-1` und `--viz-series-2` müssen sich deutlich unterscheiden** —
   nicht nur im Farbton, sondern auch in der Helligkeit. Zwei gleich helle
   Farben sind für rot-grün-blinde Menschen (etwa 8 % der Männer) identisch.
3. **Grün und Rot nur für Veränderungen**, nie als Seriennfarbe. Sonst
   bedeutet dieselbe Farbe zweierlei.

---

## Schritt 2 — Diagramm einbauen

Für **jedes** Diagramm brauchst du zwei Dinge auf der Seite.

### a) ECharts und die Diagrammbausteine einmal pro Seite laden

Seit v7 stecken alle Diagramme in **einer** Datei, `charts.js`. Du musst
also nichts mehr aus `index.html` herauskopieren — nur einbinden und aufrufen.

In Oxygen: Seite auswählen → **Page Settings → Custom CSS/JS → JavaScript**
(oder ein Code Block ganz oben in der Seite):

```html
<script src="https://cdn.jsdelivr.net/npm/echarts@5.5.1/dist/echarts.min.js" defer></script>
<script src="https://DEIN-GITHUB-NAME.github.io/arbeitsmarkt-at/charts.js?v=16" defer></script>
```

### b) Pro Diagramm ein Code Block

**Add → Code Block**, dann in den HTML-Bereich:

```html
<div class="viz-root">
  <div id="chart-zeitreihe" style="width:100%;height:340px"></div>
</div>
```

Und in den **JavaScript**-Bereich desselben Code Blocks:

```js
(function () {
  const BASIS = "https://DEIN-GITHUB-NAME.github.io/arbeitsmarkt-at/data";
  const feld  = document.getElementById("chart-zeitreihe");
  const stil  = (n) => getComputedStyle(feld.closest(".viz-root")).getPropertyValue(n).trim();

  function los() {
    fetch(BASIS + "/zeitreihe.json").then(r => r.json()).then(daten => {
      const d = echarts.init(feld, null, { renderer: "svg" });
      d.setOption({
        textStyle: { fontFamily: stil("--viz-font"), color: stil("--viz-text-2") },
        grid: { left: 8, right: 70, top: 34, bottom: 8, containLabel: true },
        tooltip: { trigger: "axis",
          backgroundColor: stil("--viz-surface"), borderColor: stil("--viz-border"),
          textStyle: { color: stil("--viz-text") } },
        legend: { top: 0, left: 0, textStyle: { color: stil("--viz-text-2") } },
        xAxis: { type: "category", boundaryGap: false, data: daten.monate,
          axisLine: { lineStyle: { color: stil("--viz-axis") } }, axisTick: { show: false },
          axisLabel: { color: stil("--viz-muted"),
            formatter: v => new Date(v).getMonth() === 0 ? new Date(v).getFullYear() : "" },
          splitLine: { show: false } },
        yAxis: { type: "value", axisLine: { show: false }, axisTick: { show: false },
          axisLabel: { color: stil("--viz-muted"),
            formatter: v => v.toLocaleString("de-AT") },
          splitLine: { lineStyle: { color: stil("--viz-grid") } } },
        series: [
          { name: "Männer", type: "line", data: daten.nach_geschlecht.M, showSymbol: false,
            lineStyle: { width: 2, color: stil("--viz-series-1") },
            itemStyle: { color: stil("--viz-series-1") } },
          { name: "Frauen", type: "line", data: daten.nach_geschlecht.W, showSymbol: false,
            lineStyle: { width: 2, color: stil("--viz-series-2") },
            itemStyle: { color: stil("--viz-series-2") } },
        ],
      });
      window.addEventListener("resize", () => d.resize());
    });
  }
  window.echarts ? los()
    : document.querySelector('script[src*="echarts"]').addEventListener("load", los);
})();
```

Nur zwei Dinge anpassen: **`DEIN-GITHUB-NAME`** und die **id** des `<div>`.

> **`.viz-root` nicht vergessen.** Der Wrapper ist der Anker, an dem das Skript
> die Variablen abliest. Ohne ihn erscheinen die Diagramme farblos.

---

## Der schnellste Weg: fertige Funktionen aufrufen

`charts.js` stellt alles unter `window.AMS` bereit. Ein Code Block je Diagramm,
HTML-Teil:

```html
<div class="viz-root">
  <div class="viz-chart" id="c-fluss" style="height:340px"></div>
  <div id="u-fluss"></div><div id="h-fluss"></div><div id="t-fluss"></div>
</div>
```

JavaScript-Teil:

```js
(function () {
  const warte = () => (window.AMS && window.echarts) ? los() : setTimeout(warte, 60);
  function los() {
    AMS.setzeBasis("https://DEIN-GITHUB-NAME.github.io/arbeitsmarkt-at/data");
    AMS.setzeWurzel(document.querySelector(".viz-root"));
    AMS.hole("fluss").then((d) => AMS.baueFluss(d));
  }
  warte();
})();
```

Die Element-Kennungen sind fix: `c-<name>` für die Zeichenfläche, `u-<name>`
für die Unterzeile, `h-<name>` für den Hinweis, `t-<name>` für die Tabelle.

## Noch schneller: einbetten statt einbauen

Wenn dir das Standard-Aussehen reicht, nimm den Einbett-Code aus dem
Dashboard (Knopf „Einbetten" bei jeder Grafik). Der bringt die Quellenangabe
mit und braucht in Oxygen nur einen Code Block. Nachteil: die Grafik erbt
nicht deine Oxygen-Variablen, sie bringt ihr eigenes Farbschema mit.

## Alle verfügbaren Funktionen

| Diagramm | Funktion | Datei |
|---|---|---|
| KPI-Kacheln | `baueKpis()` | `kpi.json`, `zeitreihe.json` |
| Zeitreihe | `baueZeitreihe()` | `zeitreihe.json` |
| Ausbildungsstand | `baueAusbildung()` | `ausbildung.json` |
| Verlauf Ausbildungsgruppen | `baueVerlauf()` | `ausbildung.json` |
| Generationen | `baueGenerationen()` | `generationen.json` |
| Karte (Bundesländer) | `baueKarte()` | `bundeslaender.json`, `bundeslaender_geo.json` |
| Bundesländer-Tabelle | `baueLaender()` | `bundeslaender.json` |
| Bezirks-Tabelle | `baueBezirke()` | `bezirke.json`, `meta.json` |
| Zugänge/Abgänge | `baueFluss()` | `fluss.json` |
| Vormerkdauer | `baueDauer()` | `dauer.json` |
| Personen in Schulung | `baueSchulung()` | `schulung.json` |
| Offene Stellen | `baueStellen()` | `stellen.json` |
| Wirtschaftszweige | `baueBranche()` | `branche.json` |
| EU-Vergleich | `baueEu()` | `eu.json` |

Alle Hilfsfunktionen (`stil`, `zahl`, `pz`, `basis`, `achse`, `tabelle`)
stecken ebenfalls in `charts.js` und stehen unter `AMS` bereit.

---

## Was du nicht vergessen darfst

**Quellenangabe.** Die Daten stehen unter CC BY 4.0. Das heißt: Namensnennung
ist Pflicht, nicht Höflichkeit. Irgendwo sichtbar auf der Seite:

> Datenquellen: AMS Österreich (CC BY 4.0) · STATISTIK AUSTRIA (CC BY 4.0) ·
> Eurostat

**Der Definitionshinweis.** AMS-Absolutzahlen und EU-Quoten messen
Unterschiedliches. Wer sie nebeneinander sieht, hält sie sonst für vergleichbar.
Der Hinweiskasten aus `docs/index.html` gehört mit auf die Seite.

---

## Wenn etwas nicht erscheint

| Symptom | Ursache |
|---|---|
| Diagrammfläche bleibt leer | ECharts nicht geladen, oder `id` stimmt nicht mit dem `<div>` überein |
| Diagramm da, aber grau/farblos | `.viz-root`-Wrapper fehlt oder die Variablen sind nicht im Stylesheet |
| Nichts passiert, Konsole zeigt CORS-Fehler | Adresse in `BASIS` falsch — muss `https://…github.io/…/data` sein |
| Diagramm ist 0 Pixel hoch | Der Container braucht eine feste Höhe (`height:340px`), ECharts kann sie nicht erraten |
| Beim Umschalten auf Mobil verrutscht alles | `window.addEventListener("resize", () => d.resize())` fehlt |
