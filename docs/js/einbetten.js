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
  karte: 590, fluss: 460, dauer: 440, schulung: 420,
  stellen: 440, branche: 560, eu: 460, eurang: 440,
};
const EINBETT_TITEL = {
  zeitreihe: "Arbeitslosigkeit in Österreich, Monatsverlauf",
  ausbildung: "Arbeitslosigkeit nach höchster abgeschlossener Ausbildung",
  verlauf: "Verlauf der Arbeitslosigkeit in den größten Ausbildungsgruppen",
  generationen: "Darstellung der Arbeitslosigkeit nach Generationen",
  karte: "Entwicklung der Arbeitslosigkeit nach Bezirken gegenüber dem Vorjahr",
  fluss: "Zugänge und Abgänge in die Arbeitslosigkeit",
  dauer: "Dauer der bestehenden Arbeitslosigkeit",
  schulung: "Personen in Schulung — nicht in der Arbeitslosigkeit enthalten",
  stellen: "Offene Stellen und Arbeitslose je offener Stelle",
  branche: "Arbeitslosigkeit nach Wirtschaftszweig",
  eu: "Arbeitslosenquote im Vergleich mit EU-27 und Deutschland",
  eurang: "Arbeitslosenquote: Wo Österreich in der EU steht",
};

function einbettBasis() {
  const pfad = location.href.replace(/[^/]*$/, "");
  return pfad.replace(/\/$/, "");
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

AMS.EINBETT_HOEHEN = EINBETT_HOEHEN;
AMS.EINBETT_TITEL = EINBETT_TITEL;
AMS.einbettCode = einbettCode;
AMS.verdrahteEinbetten = verdrahteEinbetten;
})(window.AMS);
