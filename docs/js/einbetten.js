/* ===========================================================================
   Arbeitsmarkt-Dashboard Österreich — Themenstrang: einbetten
   ---------------------------------------------------------------------------
   Einbetten-Dialog und iframe-Schnipsel. Wird nach js/kern.js geladen.
   Der Code ist unverändert aus charts.js (v17) übernommen.
   =========================================================================== */
(function (AMS) {
"use strict";

/* --- Einbetten: Schnipsel bauen und anzeigen -------------------------
   Die Quellenangabe steckt in der eingebetteten Grafik selbst. Wer sie
   weiterverbreitet, transportiert die Namensnennung damit zwangsläufig mit —
   das ist die Bedingung der CC-BY-Lizenz der Datenquellen. */
const EINBETT_HOEHEN = {
  zeitreihe: 460, ausbildung: 540, verlauf: 540, generationen: 460,
  karte: 680, fluss: 460, dauer: 440, verfestigung: 520, schulung: 420,
  saison: 620, selbstaendige: 470, festspiele: 420,
  stellen: 440, branche: 560, eukarte: 680, eurang: 440,
};
const EINBETT_TITEL = {
  zeitreihe: "Arbeitslosigkeit in Österreich, Monatsverlauf",
  ausbildung: "Arbeitslosigkeit nach höchster abgeschlossener Ausbildung",
  verlauf: "Verlauf der Arbeitslosigkeit in den größten Ausbildungsgruppen",
  generationen: "Darstellung der Arbeitslosigkeit nach Generationen",
  karte: "Entwicklung der Arbeitslosigkeit nach Bezirken gegenüber dem Vorjahr",
  fluss: "Zugänge und Abgänge in die Arbeitslosigkeit",
  dauer: "Dauer der bestehenden Arbeitslosigkeit",
  verfestigung: "Wie lange Arbeitslosigkeit dauert — nach Alter",
  saison: "Zwei Österreichs: Wann das Jahr schlecht läuft",
  festspiele: "Wann sich die Kulturbranche arbeitslos meldet",
  selbstaendige: "Selbständig und arbeitslos — die Zahl, die niemand erhebt",
  schulung: "Personen in Schulung — nicht in der Arbeitslosigkeit enthalten",
  stellen: "Offene Stellen und Arbeitslose je offener Stelle",
  branche: "Arbeitslosigkeit nach Wirtschaftszweig",
  eukarte: "Entwicklung der Arbeitslosigkeit in der EU gegenüber dem Vorjahr",
  eurang: "Arbeitslosenquote: Wo Österreich in der EU steht",
};

/* --- Wohin der Schnipsel zeigt -------------------------------------------
   Bis v25 wurde die Basis aus location.href abgeleitet. Auf GitHub Pages war
   das richtig, auf der WordPress-Seite ergab es .../dashboard/embed.html —
   eine Adresse, die es dort nicht gibt. Deshalb steht die Referenzadresse
   ab v26 fest: der Dialog liefert überall denselben, funktionierenden Code,
   egal auf welcher Seite er geöffnet wird. Liegt das Dashboard einmal
   woanders, setzt AMS.setzeEinbettBasis("https://…") den Wert um — vor
   AMS.start() aufrufen. */
const PAGES_BASIS = "https://tvhp6g7shv-art.github.io/arbeitsmarkt-at";
let BASIS = PAGES_BASIS;

function setzeEinbettBasis(url) {
  if (typeof url === "string" && url.trim()) BASIS = url.trim().replace(/\/$/, "");
}

function einbettBasis() {
  return BASIS;
}

function einbettCode(chart) {
  const hoehe = EINBETT_HOEHEN[chart] ?? 480;
  const titel = EINBETT_TITEL[chart] ?? "Arbeitsmarkt Österreich";
  return `<iframe title="${titel}"
        src="${einbettBasis()}/embed.html?chart=${chart}"
        width="100%" height="${hoehe}" style="border:0" loading="lazy"
        scrolling="no"></iframe>
<script>
/* passt die Höhe automatisch an — optional, ohne greift die Höhe oben */
addEventListener("message", function (e) {
  if (!e.data || e.data.typ !== "ams-hoehe") return;
  document.querySelectorAll('iframe[src*="embed.html"]').forEach(function (f) {
    if (f.contentWindow === e.source) f.style.height = e.data.hoehe + "px";
  });
});
<\/script>`;
}

function verdrahteEinbetten(meta) {
  const dialog = document.getElementById("einbett-dialog");
  if (!dialog) return;
  const feld = document.getElementById("einbett-code");
  const credit = document.getElementById("einbett-credit");
  const angaben = meta?.einbettung ?? {};

  document.addEventListener("click", (e) => {
    const knopf = e.target.closest(".viz-einbetten");
    if (!knopf) return;
    feld.value = einbettCode(knopf.dataset.chart);
    credit.textContent =
      `Datenquelle: AMS Österreich, STATISTIK AUSTRIA, Eurostat (CC BY 4.0) · ` +
      `Grafik: ${angaben.grafik_von ?? "—"}`;
    dialog.showModal();
  });

  document.getElementById("einbett-schliessen")?.addEventListener(
    "click", () => dialog.close());
  document.getElementById("einbett-kopieren")?.addEventListener("click", async (e) => {
    feld.select();
    try {
      await navigator.clipboard.writeText(feld.value);
      e.target.textContent = "Kopiert";
      setTimeout(() => (e.target.textContent = "Code kopieren"), 1600);
    } catch {
      document.execCommand("copy");        /* ältere Browser */
    }
  });
}

AMS.setzeEinbettBasis = setzeEinbettBasis;
AMS.EINBETT_HOEHEN = EINBETT_HOEHEN;
AMS.EINBETT_TITEL = EINBETT_TITEL;
AMS.einbettCode = einbettCode;
AMS.verdrahteEinbetten = verdrahteEinbetten;
})(window.AMS);
