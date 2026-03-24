export const maxDuration = 90;

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  WidthType, AlignmentType, BorderStyle, ImageRun, TabStopType, TabStopPosition,
  ShadingType, TableLayoutType, Header, Footer, PageNumber,
} from "docx";

// ─── Charts (graceful if canvas unavailable) ─────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let CJN: any = null;
try { CJN = require("chartjs-node-canvas").ChartJSNodeCanvas; } catch { /* no canvas */ } // eslint-disable-line

// ─── Supabase ────────────────────────────────────────────────
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

// ─── Helpers ─────────────────────────────────────────────────
type R = Record<string, unknown>;
const $ = (v: unknown) => Number(v ?? 0);
const f1 = (v: number) => v.toLocaleString("it-IT", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const f2 = (v: number) => v.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const f3 = (v: number) => v.toLocaleString("it-IT", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const f6 = (v: number) => v.toLocaleString("it-IT", { minimumFractionDigits: 6, maximumFractionDigits: 6 });
const pc = (v: number, t: number) => t > 0 ? ((v / t) * 100).toLocaleString("it-IT", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "%" : "—";
const tr = (s: string, n: number) => s.length > n ? s.slice(0, n) + "…" : s;

// Colors
const VD = "1C4A3C", VA = "27AE60", AM = "B45309";
const PALETTE = [`#${VD}`, `#${VA}`, `#${AM}`, "#4A9B7F", "#D4845A", "#7BC8A4", "#2E8B57", "#66CDAA"];

// Gas IPCC AR6 ratios
function gas(name: string) {
  const s = (name || "").toLowerCase();
  if (/gas\b|metano|natural|caldaia|stazion/.test(s)) return { co2: 0.992, ch4: 0.006, n2o: 0.002, hfc: 0 };
  if (/gasolio|diesel/.test(s)) return { co2: 0.975, ch4: 0.015, n2o: 0.010, hfc: 0 };
  if (/benzina/.test(s)) return { co2: 0.970, ch4: 0.015, n2o: 0.015, hfc: 0 };
  if (/refriger|hfc|r-\d|fuggit/.test(s)) return { co2: 0, ch4: 0, n2o: 0, hfc: 1 };
  return { co2: 0.98, ch4: 0.01, n2o: 0.01, hfc: 0 };
}
function unc(uA: number | null, uF: number | null) { const a = $(uA ?? 3), f = $(uF ?? 2.5); return Math.sqrt(a * a + f * f); }

const purposeMap: Record<string, string> = {
  rendicontazione_volontaria: "Rendicontazione volontaria – gestione interna carbon footprint",
  supply_chain: "Risposta a richiesta supply chain", accesso_credito: "Accesso al credito / rating ESG",
  vsme: "Bilancio di sostenibilità VSME", vsme_reporting: "Rendicontazione VSME/ESG",
  bando_finanziamento: "Bando o finanziamento", verifica_terza_parte: "Preparazione verifica terza parte",
};

// ─── Doc style constants ─────────────────────────────────────
const BT = { style: BorderStyle.SINGLE, size: 4, color: "CCCCCC" };
const BA = { top: BT, bottom: BT, left: BT, right: BT };
const NB = { top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" } };
const CP = { top: 80, bottom: 80, left: 140, right: 140 }; // cell padding as margins

function hc(text: string, w?: number): TableCell {
  return new TableCell({
    children: [new Paragraph({ children: [new TextRun({ text, bold: true, color: "FFFFFF", size: 20, font: "Calibri" })], alignment: AlignmentType.CENTER, spacing: { before: 40, after: 40 } })],
    shading: { type: ShadingType.SOLID, color: VD }, borders: BA,
    margins: CP,
    ...(w ? { width: { size: w, type: WidthType.PERCENTAGE } } : {}),
  });
}
function dc(text: string, o?: { bold?: boolean; align?: (typeof AlignmentType)[keyof typeof AlignmentType]; color?: string; shade?: string; span?: number; italic?: boolean; sz?: number }): TableCell {
  return new TableCell({
    children: [new Paragraph({ children: [new TextRun({ text, bold: o?.bold, size: o?.sz || 20, font: "Calibri", color: o?.color || "1A1A1A", italics: o?.italic })], alignment: o?.align || AlignmentType.LEFT })],
    borders: BA, margins: CP,
    ...(o?.shade ? { shading: { type: ShadingType.SOLID, color: o.shade } } : {}),
    ...(o?.span ? { columnSpan: o.span } : {}),
  });
}
// KPI dark cell
function kc(line1: string, line2: string): TableCell {
  return new TableCell({
    children: [
      new Paragraph({ children: [new TextRun({ text: line1, bold: true, size: 36, font: "Calibri", color: "FFFFFF" })], alignment: AlignmentType.CENTER, spacing: { after: 60 } }),
      new Paragraph({ children: [new TextRun({ text: line2, size: 18, font: "Calibri", color: "CCCCCC" })], alignment: AlignmentType.CENTER }),
    ],
    shading: { type: ShadingType.SOLID, color: VD },
    borders: { top: BT, bottom: BT, left: { style: BorderStyle.SINGLE, size: 4, color: "2D6B5A" }, right: { style: BorderStyle.SINGLE, size: 4, color: "2D6B5A" } },
    margins: { top: 160, bottom: 160, left: 120, right: 120 },
  });
}
function h1(text: string, pageBreak = false): Paragraph {
  return new Paragraph({ children: [new TextRun({ text, bold: true, size: 28, font: "Calibri", color: VD })], spacing: { before: 480, after: 240 }, ...(pageBreak ? { pageBreakBefore: true } : {}) });
}
function h2(text: string): Paragraph {
  return new Paragraph({ children: [new TextRun({ text, bold: true, size: 24, font: "Calibri", color: "2C2C2C" })], spacing: { before: 360, after: 160 } });
}
function p(text: string, o?: { bold?: boolean; italic?: boolean; sz?: number; color?: string; indent?: number; before?: number; after?: number }): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text, size: o?.sz || 22, font: "Calibri", bold: o?.bold, italics: o?.italic, color: o?.color || "1A1A1A" })],
    spacing: { before: o?.before || 120, after: o?.after || 120, line: 276 },
    ...(o?.indent ? { indent: { left: o.indent } } : {}),
  });
}
function lv(label: string, value: string, alt: boolean): TableRow {
  return new TableRow({ children: [dc(label, { bold: true, shade: alt ? "F5F5F5" : undefined }), dc(value, { shade: alt ? "F5F5F5" : undefined })] });
}
function gap(n = 80): Paragraph { return new Paragraph({ text: "", spacing: { after: n } }); }
function tbl(rows: TableRow[]): Table { return new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE }, layout: TableLayoutType.FIXED }); }
function greenSep(): Paragraph {
  return new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: VD, space: 4 } }, children: [new TextRun("")], spacing: { after: 200 } });
}
function quote(text: string): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text, size: 20, font: "Calibri", italics: true, color: "555555" })],
    border: { left: { style: BorderStyle.SINGLE, size: 16, color: VA, space: 8 } },
    indent: { left: 720 }, spacing: { before: 200, after: 200 },
  });
}
function img(buf: Buffer, w: number, h: number): Paragraph {
  return new Paragraph({ children: [new ImageRun({ data: buf, transformation: { width: w, height: h }, type: "png" })], spacing: { before: 200, after: 200 }, alignment: AlignmentType.CENTER });
}
function priorityBox(title: string, body: string[], borderColor: string): Paragraph[] {
  return [
    new Paragraph({
      children: [new TextRun({ text: title, bold: true, size: 22, font: "Calibri", color: "1A1A1A" })],
      border: { left: { style: BorderStyle.SINGLE, size: 20, color: borderColor, space: 8 } },
      shading: { type: ShadingType.SOLID, color: "FAFAFA" },
      indent: { left: 560 }, spacing: { before: 160, after: 80 },
    }),
    ...body.map((t) => new Paragraph({
      children: [new TextRun({ text: `• ${t}`, size: 20, font: "Calibri", color: "333333" })],
      indent: { left: 920 }, spacing: { after: 60 },
    })),
    gap(160),
  ];
}

// ─── Chart renderers ─────────────────────────────────────────
async function rc(w: number, h: number, cfg: object): Promise<Buffer | null> {
  if (!CJN) return null;
  try { return await new CJN({ width: w, height: h, backgroundColour: "white" }).renderToBuffer(cfg); } catch (e) { console.error("[chart]", e); return null; }
}

async function mkChart1(s1: number, s2: number) {
  const labels = ["Cat.1\nDirette", "Cat.2\nEnergia", "Cat.3\nTrasporti", "Cat.4\nProdotti", "Cat.5\nUso prod.", "Cat.6\nAltro"];
  const data = [s1, s2, 0.3, 0.3, 0.3, 0.3]; // tiny bar for NR labels
  const bg = [`#${VD}`, `#${VA}`, "#E0E0E0", "#E0E0E0", "#E0E0E0", "#E0E0E0"];
  return rc(1200, 580, {
    type: "bar",
    data: { labels, datasets: [{ data, backgroundColor: bg, borderRadius: 6 }] },
    options: {
      layout: { padding: { bottom: 40 } },
      plugins: {
        legend: { display: false },
        title: { display: true, text: "Emissioni per categoria ISO 14064-1 (tCO₂e)", font: { size: 14, weight: "bold" as const }, color: "#0A1A13" },
        subtitle: { display: true, text: "N.R. = Non Rendicontato in questa fase", font: { size: 11 }, color: `#${VA}`, padding: { bottom: 10 } },
      },
      scales: { y: { beginAtZero: true, grid: { color: "#F0F0F0" } }, x: { grid: { display: false }, ticks: { font: { size: 11 } } } },
    },
    plugins: [{
      id: "barLabels",
      afterDatasetsDraw(chart: { ctx: CanvasRenderingContext2D; data: { datasets: { data: number[] }[] }; getDatasetMeta: (i: number) => { data: { x: number; y: number }[] } }) {
        const { ctx } = chart;
        const meta = chart.getDatasetMeta(0);
        chart.data.datasets[0].data.forEach((val: number, i: number) => {
          const { x, y } = meta.data[i];
          ctx.save();
          ctx.textAlign = "center";
          if (i < 2 && val > 0) {
            ctx.font = "bold 13px sans-serif";
            ctx.fillStyle = i === 0 ? `#${VD}` : `#${VA}`;
            ctx.fillText(f1(val), x, y - 8);
          } else if (i >= 2) {
            ctx.font = "11px sans-serif";
            ctx.fillStyle = "#AAB8C0";
            ctx.fillText("N.R.", x, y - 8);
          }
          ctx.restore();
        });
      },
    }],
  });
}

async function mkChart2(sources: R[], s1Tot: number) {
  const labels = sources.map((s) => `${tr((s.source_label as string) || "—", 22)}  ${f3($(s.emissions_tco2e))} t`);
  const vals = sources.map((s) => $(s.emissions_tco2e));
  return rc(800, 600, {
    type: "doughnut",
    data: { labels, datasets: [{ data: vals, backgroundColor: PALETTE.slice(0, labels.length), borderWidth: 2, hoverOffset: 8 }] },
    options: {
      cutout: "55%",
      plugins: {
        title: { display: true, text: "Ripartizione Scope 1 per sottocategoria", font: { size: 14, weight: "bold" as const }, color: "#0A1A13" },
        legend: { position: "right" as const, labels: { font: { size: 12 } } },
      },
    },
    plugins: [{
      id: "centerText",
      afterDraw(chart: { ctx: CanvasRenderingContext2D; chartArea: { width: number; height: number; left: number; top: number } }) {
        const { ctx, chartArea: { width, height, left, top } } = chart;
        const cx = left + width / 2, cy = top + height / 2;
        ctx.save();
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.font = "bold 22px sans-serif"; ctx.fillStyle = `#${VD}`;
        ctx.fillText(f2(s1Tot), cx, cy - 16);
        ctx.font = "13px sans-serif"; ctx.fillStyle = "#666666";
        ctx.fillText("tCO₂e", cx, cy + 8);
        ctx.font = "11px sans-serif"; ctx.fillStyle = "#888888";
        ctx.fillText("Scope 1", cx, cy + 26);
        ctx.restore();
      },
    }],
  });
}

async function mkChart3(lb: number, mb: number) {
  return rc(720, 580, {
    type: "bar",
    data: { labels: ["Location-based\n(LB)", "Market-based\n(MB)"], datasets: [{ data: [lb, mb], backgroundColor: [`#${VD}`, `#${VA}`], borderRadius: 6 }] },
    options: {
      plugins: {
        legend: { display: false },
        title: { display: true, text: "Scope 2: LB vs MB (tCO₂e)", font: { size: 14, weight: "bold" as const }, color: "#0A1A13" },
        subtitle: { display: true, text: `Δ ${f2(lb - mb)} tCO₂e`, font: { size: 13 }, color: `#${AM}` },
      },
      scales: { y: { beginAtZero: true, grid: { color: "#F0F0F0" } }, x: { grid: { display: false } } },
    },
  });
}

async function mkChart4(sources: R[]) {
  const sorted = [...sources].sort((a, b) => $(b.emissions_tco2e) - $(a.emissions_tco2e));
  const total = sorted.reduce((s, x) => s + $(x.emissions_tco2e), 0);
  const colors = sorted.map((s, i) => {
    if (i === 0) return `#${VD}`;
    if ($(s.emissions_tco2e) < total * 0.05) return `#${AM}`;
    return `#${VA}`;
  });
  return rc(1120, 480, {
    type: "bar",
    data: { labels: sorted.map((s) => tr((s.source_label as string) || "—", 22)), datasets: [{ data: sorted.map((s) => $(s.emissions_tco2e)), backgroundColor: colors, borderRadius: 6 }] },
    options: {
      indexAxis: "y" as const,
      plugins: { legend: { display: false }, title: { display: true, text: "Emissioni Scope 1 per sorgente (tCO₂e)", font: { size: 14, weight: "bold" as const }, color: "#0A1A13" } },
      scales: { x: { grid: { display: false } }, y: { grid: { display: false } } },
    },
  });
}

async function mkChart5(sources: R[], s2U: number) {
  const labels = [...sources.map((s) => tr((s.source_label as string) || "—", 18)), "Scope 2 – Energia"];
  const data = [...sources.map((s) => unc(s.uncertainty_activity_pct as number | null, s.uncertainty_fe_pct as number | null)), s2U];
  return rc(1120, 380, {
    type: "bar",
    data: { labels, datasets: [{ data, backgroundColor: `#${VA}`, borderRadius: 6 }] },
    options: {
      indexAxis: "y" as const,
      plugins: { legend: { display: false }, title: { display: true, text: "Profilo incertezza per sorgente (%)", font: { size: 16, weight: "bold" as const } } },
      scales: { x: { min: 0, max: 15, title: { display: true, text: "%" }, grid: { color: "#F0F0F0" } }, y: { grid: { display: false } } },
    },
  });
}

async function mkChart6(sources: R[], s2lb: number, grand: number) {
  const labels = ["Inventario"];
  const allVals = [...sources.map((s) => $(s.emissions_tco2e)), s2lb];
  const allLabels = [...sources.map((s) => tr((s.source_label as string) || "—", 20)), "Scope 2 (LB)"];
  const datasets = allLabels.map((lbl, i) => ({
    label: lbl,
    data: [allVals[i]],
    backgroundColor: i < sources.length ? PALETTE[i % PALETTE.length] : `#${VA}`,
  }));
  return rc(1160, 200, {
    type: "bar",
    data: { labels, datasets },
    options: {
      indexAxis: "y" as const,
      plugins: {
        title: { display: true, text: `Composizione inventario totale — ${f2(grand)} tCO₂e`, font: { size: 14, weight: "bold" as const } },
        legend: { position: "bottom" as const, labels: { font: { size: 11 } } },
      },
      scales: { x: { stacked: true, display: false }, y: { stacked: true, display: false } },
    },
    plugins: [{
      id: "segPct",
      afterDatasetsDraw(chart: { ctx: CanvasRenderingContext2D; getDatasetMeta: (i: number) => { data: { x: number; y: number; width: number; height: number; base: number }[] } }) {
        const { ctx } = chart;
        allVals.forEach((val, di) => {
          const pctVal = grand > 0 ? (val / grand) * 100 : 0;
          if (pctVal < 8) return;
          const meta = chart.getDatasetMeta(di);
          if (!meta.data[0]) return;
          const bar = meta.data[0];
          const bx = typeof bar.base === "number" ? (bar.base + bar.x) / 2 : bar.x;
          ctx.save();
          ctx.font = "bold 13px sans-serif";
          ctx.fillStyle = "white"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
          ctx.fillText(`${pctVal.toLocaleString("it-IT", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`, bx, bar.y);
          ctx.restore();
        });
      },
    }],
  });
}

// ─── AI Narrative texts ──────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type NData = { companyName: string; companySector: string; referenceYear: number; employees: number; scope1Total: number; scope2LB: number; scope2MB: number; grandTotal: number; scope1Pct: string; scope2Pct: string; totalUncertainty: string; scope1Sources: { source_name: string; emission_value: number }[] };
type Narr = { executiveSummary: string; executiveSummaryContext: string; consolidationApproach: string; materialityNote: string; quantificationIntro: string; uncertaintyConclusion: string; interventionIntro: string; intervention_0: string; intervention_1: string; intervention_2: string; complianceStatement: string };

function getDefaultTexts(d: NData): Narr {
  return {
    executiveSummary: `${d.companyName} ha rendicontato per l'anno ${d.referenceYear} un totale di ${f2(d.grandTotal)} tCO₂e di emissioni di gas ad effetto serra, in conformità alla norma UNI EN ISO 14064-1:2019. L'inventario copre le emissioni dirette (Scope 1) e le emissioni indirette da energia importata (Scope 2).`,
    executiveSummaryContext: `Le emissioni dirette (Scope 1) ammontano a ${f2(d.scope1Total)} tCO₂e (${d.scope1Pct}% del totale). Le emissioni indirette da energia elettrica importata (Scope 2, approccio location-based) ammontano a ${f2(d.scope2LB)} tCO₂e (${d.scope2Pct}% del totale). L'incertezza combinata è classificata come "Buona" (±${d.totalUncertainty}%).`,
    consolidationApproach: `L'organizzazione ha adottato l'approccio del "Controllo operativo": vengono rendicontate tutte le emissioni delle installazioni su cui l'organizzazione detiene piena autorità operativa. Questo approccio è coerente con la struttura organizzativa di ${d.companyName} e conforme al §5.1.1 della norma.`,
    materialityNote: `Le categorie 3-6 sono state valutate come non significative per ${d.companyName} nel periodo di rendicontazione, secondo i criteri di materialità del §5.2.3 della norma.`,
    quantificationIntro: `Le emissioni GHG sono state quantificate applicando il metodo dei fattori di emissione (Tier 1/2 IPCC), il metodo più comune per PMI del settore ${d.companySector || "manifatturiero"} ed esplicitamente previsto dal §6.2.3. I fattori di emissione provengono da ISPRA e IPCC AR6.`,
    uncertaintyConclusion: `La valutazione complessiva dell'inventario è "Buona" (±${d.totalUncertainty}%), in linea con i requisiti del §8.3. Tutti i dati di attività derivano da misurazioni dirette (fatture, bollette, contatori), classificati come tipo B.`,
    interventionIntro: `Sulla base dell'analisi dell'inventario di ${d.companyName}, si identificano le seguenti aree di intervento prioritarie, ordinate per impatto decrescente sul totale delle emissioni:`,
    intervention_0: `Questa fonte rappresenta la principale leva di riduzione dell'impronta carbonica dell'organizzazione. Si raccomanda un'analisi di fattibilità tecnico-economica.`,
    intervention_1: `Intervento a priorità media con significativo potenziale di riduzione nel medio termine (2-5 anni).`,
    intervention_2: `Intervento a priorità bassa da pianificare nel lungo periodo con approccio progressivo.`,
    complianceStatement: `Il presente inventario delle emissioni di gas serra di ${d.companyName} per l'anno ${d.referenceYear} è stato redatto in conformità alla norma UNI EN ISO 14064-1:2019. Sono rendicontate le categorie 1 e 2. L'inventario non è stato sottoposto a verifica indipendente di terza parte.`,
  };
}

async function generateNarrativeTexts(d: NData): Promise<Narr> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  console.log("=== AI NARRATIVES: starting ===", apiKey ? `key present (${apiKey.substring(0, 12)}...)` : "NO API KEY");
  if (!apiKey) { console.warn("=== AI NARRATIVES: No ANTHROPIC_API_KEY in env, using defaults ==="); return getDefaultTexts(d); }

  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), 45000);
  try {
    const srcList = d.scope1Sources.map((s) => `${s.source_name} ${f3(s.emission_value)} tCO₂e (${((s.emission_value / (d.scope1Total || 1) * 100)).toLocaleString("it-IT", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%)`).join(", ");
    const driver = parseFloat(d.scope2Pct) > 50 ? `Scope 2 energia elettrica (${d.scope2Pct}%)` : `Scope 1 ${d.scope1Sources[0]?.source_name || "emissioni dirette"} (${d.scope1Pct}%)`;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST", signal: controller.signal,
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514", max_tokens: 3000,
        system: `Sei Claudio Moneda, Lead Auditor ISO 14064/14067 e GHG Specialist di CO₂e Srl. Redigi testi per un inventario GHG professionale italiano. Stile: tecnico ma comprensibile, contestualizzato sul settore specifico. Italiano formale. Paragrafi 3-5 righe. NON usare: "i dati mostrano", "si evince". USA: "L'organizzazione ha rendicontato", "L'inventario evidenzia", "Il profilo emissivo di [azienda]".`,
        messages: [{ role: "user", content: `Genera testi per inventario GHG. Rispondi SOLO con JSON valido.
DATI: Azienda: ${d.companyName}, Settore: ${d.companySector || "manifatturiero"}, Anno: ${d.referenceYear}, Dipendenti: ${d.employees || "n.d."}, Scope 1: ${f3(d.scope1Total)} tCO₂e (${d.scope1Pct}%), Scope 2 LB: ${f3(d.scope2LB)} tCO₂e (${d.scope2Pct}%), Scope 2 MB: ${f3(d.scope2MB)} tCO₂e, Totale: ${f3(d.grandTotal)} tCO₂e, Incertezza: ±${d.totalUncertainty}%, Sorgenti: ${srcList}, Driver: ${driver}
JSON con chiavi: executiveSummary, executiveSummaryContext, consolidationApproach, materialityNote, quantificationIntro, uncertaintyConclusion, interventionIntro, intervention_0, intervention_1, intervention_2, complianceStatement` }],
      }),
    });
    clearTimeout(tid);
    console.log("=== AI NARRATIVES: HTTP status ===", res.status);

    if (!res.ok) {
      const errBody = await res.text();
      console.error("=== AI NARRATIVES: API error ===", errBody.substring(0, 300));
      return getDefaultTexts(d);
    }

    const result = await res.json();
    if (result.error) { console.error("=== AI NARRATIVES: result.error ===", result.error); return getDefaultTexts(d); }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = result.content?.filter((b: any) => b.type === "text")?.map((b: any) => b.text)?.join("") || "";
    console.log("=== AI NARRATIVES: raw preview ===", raw.substring(0, 150));

    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) { console.error("=== AI NARRATIVES: no JSON found ==="); return getDefaultTexts(d); }
    const parsed = JSON.parse(m[0]) as Narr;
    console.log("=== AI NARRATIVES: SUCCESS, keys ===", Object.keys(parsed).join(", "));
    return parsed;
  } catch (err: unknown) {
    clearTimeout(tid);
    const msg = err instanceof Error ? err.message : "unknown";
    console.error(`=== AI NARRATIVES: EXCEPTION === ${msg}`);
    return getDefaultTexts(d);
  }
}

// ═════════════════════════════════════════════════════════════
// ROUTE
// ═════════════════════════════════════════════════════════════
export async function GET(_req: NextRequest, { params }: { params: Promise<{ reportId: string }> }) {
  try {
    const { reportId } = await params;

    const [{ data: report, error: rErr }, { data: s1raw }, { data: s2raw }] = await Promise.all([
      sb.from("ghg_reports").select("*, companies(*)").eq("id", reportId).single(),
      sb.from("scope1_sources").select("*").eq("ghg_report_id", reportId).order("emissions_tco2e", { ascending: false }),
      sb.from("scope2_sources").select("*").eq("ghg_report_id", reportId),
    ]);
    if (!report || rErr) return NextResponse.json({ error: "Report non trovato" }, { status: 404 });

    const co = (report.companies as R) || {};
    const fd = (report.form_data as R) || {};
    const s1 = (s1raw || []) as R[];
    const s2 = (s2raw || []) as R[];

    const CN = (co.company_name as string) || "—";
    const CA = (fd.company_address as string) || (co.registered_address as string) || "Italia";
    const CS = ((co.nace_code as string) || "") + (co.nace_description ? " – " + co.nace_description : "");
    const Y = $(report.reference_year) || $(report.year) || new Date(report.created_at as string).getFullYear();
    const RC = (report.report_code as string) || `GHG-${Y}-001`;
    const RS = (co.responsible_name as string) || (fd.responsible_name as string) || "Claudio Moneda";
    const EMP = $(co.number_of_employees);
    const rawPurpose = Array.isArray(fd.inventory_purpose) ? (fd.inventory_purpose as string[]) : [(fd.inventory_purpose as string) || "rendicontazione_volontaria"];
    const RP = rawPurpose.map((v) => purposeMap[v] || v).join("; ");

    const S1T = $(report.scope1_total);
    const S2LB = $(report.scope2_lb_total);
    const S2MB = $(report.scope2_mb_total);
    const GT = $(report.total_co2eq) || S1T + S2LB;

    // Gas totals
    let tCo2 = 0, tCh4 = 0, tN2o = 0, tHfc = 0;
    s1.forEach((s) => { const e = $(s.emissions_tco2e), g = gas((s.source_label as string) || ""); tCo2 += e * g.co2; tCh4 += e * g.ch4; tN2o += e * g.n2o; tHfc += e * g.hfc; });

    // Uncertainty
    const s1U = s1.map((s) => unc(s.uncertainty_activity_pct as number | null, s.uncertainty_fe_pct as number | null));
    const s2U = unc(3, 4.1);
    const s1UW = s1.length > 0 ? s1.reduce((a, s, i) => a + $(s.emissions_tco2e) * s1U[i], 0) / (S1T || 1) : 3;
    const TU = GT > 0 ? Math.sqrt(Math.pow(S1T * s1UW / 100, 2) + Math.pow(S2LB * s2U / 100, 2)) / GT * 100 : 3.1;

    // Intensity (same method as view/page.tsx §9.3.2g)
    const FUEL_MWH: Record<string, number> = {
      natural_gas: 0.01, lpg: 0.007, diesel: 0.01, gasolio: 0.01,
      benzina: 0.009, fuel_oil: 0.011, coal: 0.008, wood_pellet: 0.0047,
      wood: 0.004, hydrogen: 0.033,
    };
    const mwhScope1 = s1.reduce((sum, src) => {
      const qty = $(src.activity_value);
      const fuel = (src.activity_data_type as string) || "";
      const factor = FUEL_MWH[fuel] || 0.01;
      return sum + qty * factor;
    }, 0);
    const kwhS2 = s2.reduce((a, s) => a + $(s.activity_value_kwh), 0);
    const totalMWh = mwhScope1 + kwhS2 / 1000;
    const intMWh = totalMWh > 0 ? f2(GT / totalMWh) : "N.D.";
    const intEmp = EMP > 0 ? f1(GT / EMP) : "N.D.";
    const turnover = $(co.turnover_eur);
    const intRev = turnover > 0 ? f1((GT / turnover) * 1_000_000) : "N.D.";

    const TODAY = new Date().toLocaleDateString("it-IT", { day: "2-digit", month: "long", year: "numeric" });
    console.log("[report] Generating for:", CN, Y);

    // ── Narratives + Charts (parallel) ───────────────
    const nData: NData = {
      companyName: CN, companySector: CS, referenceYear: Y, employees: EMP,
      scope1Total: S1T, scope2LB: S2LB, scope2MB: S2MB, grandTotal: GT,
      scope1Pct: pc(S1T, GT).replace("%", ""), scope2Pct: pc(S2LB, GT).replace("%", ""),
      totalUncertainty: f1(TU),
      scope1Sources: s1.map((s) => ({ source_name: (s.source_label as string) || "—", emission_value: $(s.emissions_tco2e) })),
    };
    const [narratives, c1, c2, c3, c4, c5, c6] = await Promise.all([
      generateNarrativeTexts(nData),
      mkChart1(S1T, S2LB), s1.length > 0 ? mkChart2(s1, S1T) : null,
      mkChart3(S2LB, S2MB), s1.length > 0 ? mkChart4(s1) : null,
      s1.length > 0 ? mkChart5(s1, s2U) : null, s1.length > 0 ? mkChart6(s1, S2LB, GT) : null,
    ]);
    console.log("[report] Narratives keys:", Object.keys(narratives));
    console.log("[report] Exec summary preview:", narratives.executiveSummary?.substring(0, 80));

    // ── Build document ───────────────────────────────
    const D: (Paragraph | Table)[] = [];

    // ══════ COPERTINA ══════════════════════════════
    D.push(
      gap(800),
      new Paragraph({ children: [new TextRun({ text: "CO₂e Srl", bold: true, size: 40, font: "Calibri", color: VD })], spacing: { after: 40 } }),
      p("Carbon to Value", { italic: true, sz: 22, color: "666666" }),
      p("Carbon Management · GHG Accounting · ESG Reporting", { sz: 20, color: "888888", after: 400 }),
      greenSep(), gap(200),
      new Paragraph({ children: [new TextRun({ text: "RAPPORTO INVENTARIO GHG", bold: true, size: 36, font: "Calibri", color: VD })], alignment: AlignmentType.CENTER }),
      new Paragraph({ children: [new TextRun({ text: `Emissioni di Gas ad Effetto Serra – Anno ${Y}`, size: 26, font: "Calibri", color: "444444" })], alignment: AlignmentType.CENTER, spacing: { after: 80 } }),
      new Paragraph({ children: [new TextRun({ text: "UNI EN ISO 14064-1:2019", bold: true, size: 22, font: "Calibri", color: "666666" })], alignment: AlignmentType.CENTER, spacing: { after: 300 } }),
      greenSep(), gap(100),
      new Paragraph({ children: [new TextRun({ text: CN, bold: true, size: 30, font: "Calibri", color: VD })], alignment: AlignmentType.CENTER }),
      new Paragraph({ children: [new TextRun({ text: CA, size: 22, font: "Calibri" })], alignment: AlignmentType.CENTER }),
      CS ? new Paragraph({ children: [new TextRun({ text: CS, size: 20, font: "Calibri", color: "888888" })], alignment: AlignmentType.CENTER }) : gap(),
      gap(300),
      tbl([
        lv("Periodo di rendicontazione", `01 gennaio ${Y} – 31 dicembre ${Y}`, true),
        lv("Anno di riferimento", `${Y} – primo anno di inventario (baseline)`, false),
        lv("Codice rapporto", RC, true),
        lv("Data di emissione", TODAY, false),
        lv("Approccio consolidamento", "Controllo operativo (§5.1)", true),
        lv("Stato verifica", "Non verificato", false),
      ]),
      gap(300),
      p("Preparato da:", { sz: 20, color: "888888" }),
      p(RS, { bold: true, sz: 26 }),
      p("Auditor / Lead Auditor ISO 14064 · ISO 14067", { sz: 20 }),
      p("GHG & Carbon Footprint Specialist", { italic: true, sz: 20 }),
      p("CO₂e Srl | co2e.it", { sz: 20, color: VD }),
    );

    // ══════ INDICE ═════════════════════════════════
    const tocEntries: [string, string][] = [
      ["1. Executive Summary", "3"],
      ["2. Descrizione organizzazione e confini", "4"],
      ["3. Gas ad effetto serra considerati", "5"],
      ["4. Inventario GHG quantificato", "6"],
      ["5. Approccio di quantificazione", "8"],
      ["6. Valutazione dell'incertezza", "9"],
      ["7. Indicatori di intensità GHG", "10"],
      ["8. Aree di intervento e potenziale di riduzione", "11"],
      ["9. Dichiarazioni obbligatorie ISO 14064-1:2019", "12"],
    ];
    D.push(
      new Paragraph({ pageBreakBefore: true, children: [new TextRun({ text: "INDICE", bold: true, size: 28, font: "Calibri", color: VD })], spacing: { after: 480 } }),
      tbl(tocEntries.map(([title, pg], i) => new TableRow({
        children: [
          new TableCell({
            children: [new Paragraph({
              tabStops: [{ type: TabStopType.RIGHT, position: 8500 }],
              children: [
                new TextRun({ text: title, size: 22, font: "Calibri", color: "1A1A1A" }),
                new TextRun({ text: "\t", size: 22 }),
              ],
            })],
            borders: i % 2 === 1 ? { ...NB, bottom: { style: BorderStyle.SINGLE, size: 2, color: "EEEEEE" } } : NB,
            width: { size: 90, type: WidthType.PERCENTAGE },
          }),
          new TableCell({
            children: [new Paragraph({ children: [new TextRun({ text: pg, bold: true, size: 22, font: "Calibri", color: VD })], alignment: AlignmentType.RIGHT })],
            borders: i % 2 === 1 ? { ...NB, bottom: { style: BorderStyle.SINGLE, size: 2, color: "EEEEEE" } } : NB,
            width: { size: 10, type: WidthType.PERCENTAGE },
          }),
        ],
      }))),
    );
    // Page break after index
    D.push(new Paragraph({ children: [], pageBreakBefore: true }));

    // ══════ 1. EXECUTIVE SUMMARY ═══════════════════
    D.push(
      h1("1. Executive Summary"),
      tbl([new TableRow({ children: [kc(`${f2(GT)} tCO₂e`, "Emissioni totali inventario GHG"), kc(pc(S2LB, GT), "Scope 2 sul totale → area intervento"), kc(`±${f1(TU)}%`, `Incertezza combinata ● ${TU < 10 ? "Buona" : "Media"}`)] })]),
      gap(200),
    );
    if (c6) D.push(img(c6, 580, 100));
    D.push(
      p(narratives.executiveSummary, { before: 200, after: 160 }),
      p(narratives.executiveSummaryContext, { italic: true, before: 0, after: 200 }),
      quote("§ ISO 14064-1:2019 – Il presente rapporto è stato preparato in conformità alla norma UNI EN ISO 14064-1:2019 (Gas ad effetto serra — Parte 1: Specifiche e guida, al livello dell'organizzazione, per la quantificazione e la rendicontazione delle emissioni di gas ad effetto serra e della loro rimozione)."),
    );

    // ══════ 2. ORGANIZZAZIONE ══════════════════════
    D.push(
      h1("2. Descrizione organizzazione e confini  §5.1 · §9.3.1", true),
      h2("2.1 Organizzazione rendicontante"),
      tbl([
        lv("Ragione sociale", CN, true), lv("Indirizzo sede", CA, false),
        lv("Settore ATECO", CS || "—", true), lv("Responsabile inventario GHG", RS, false),
        lv("Numero dipendenti", EMP > 0 ? `${EMP}` : "—", true),
        lv("Anno di riferimento", `${Y} – primo anno di inventario`, false),
        lv("Approccio di consolidamento", "Controllo operativo (§5.1)", true),
        lv("Uso previsto dell'inventario", RP, false),
      ]),
      h2("2.2 Approccio di consolidamento (§5.1)"),
      p(narratives.consolidationApproach),
      h2("2.3 Categorie di emissione rendicontate (§5.2)"),
      tbl([
        new TableRow({ children: [hc("#", 5), hc("Categoria ISO 14064-1", 35), hc("Stato", 14), hc("tCO₂e", 21), hc("Note", 25)] }),
        new TableRow({ children: [dc("1"), dc("Emissioni e rimozioni dirette (Scope 1)"), dc("SIGNIFICATIVO", { color: VA, bold: true }), dc(f2(S1T), { align: AlignmentType.RIGHT, bold: true }), dc("Rendicontato – vedere §4")] }),
        new TableRow({ children: [dc("2"), dc("Emissioni indirette da energia (Scope 2)"), dc("SIGNIFICATIVO", { color: VA, bold: true }), dc(`LB: ${f2(S2LB)} MB: ${f2(S2MB)}`, { align: AlignmentType.RIGHT, bold: true }), dc("Rendicontato LB e MB")] }),
        ...[["3", "Emissioni indirette dal trasporto", "Cat. valutata non significativa"], ["4", "Emissioni indirette da prodotti utilizzati", "Dati non disponibili"], ["5", "Emissioni indirette associate all'uso di prodotti", "Non applicabile"], ["6", "Emissioni indirette da altre fonti", "Non identificate fonti significative"]].map(([n, l, note]) =>
          new TableRow({ children: [dc(n, { italic: true, color: "999999" }), dc(l, { italic: true, color: "999999" }), dc("Non rendicontato", { italic: true, color: "999999" }), dc("—", { color: "999999", align: AlignmentType.RIGHT }), dc(note, { italic: true, color: "999999" })] })
        ),
      ]),
      p(narratives.materialityNote, { italic: true, sz: 18, color: "888888" }),
    );

    // ══════ 3. GAS GHG ═════════════════════════════
    D.push(
      h1("3. Gas ad effetto serra considerati  §6.2 · §9.3.1f", true),
      p("I seguenti gas ad effetto serra sono stati considerati nell'inventario, con i relativi valori GWP dal Sesto Rapporto di Valutazione IPCC (AR6):"),
      tbl([
        new TableRow({ children: [hc("Gas", 17), hc("Formula", 9), hc("GWP AR6", 11), hc("Sorgenti Cat.1", 24), hc("tCO₂e", 14), hc("Stato", 15)] }),
        new TableRow({ children: [dc("Anidride carbonica"), dc("CO₂"), dc("1", { align: AlignmentType.RIGHT }), dc("Combustione fossile (1.1, 1.2)"), dc(f3(tCo2), { align: AlignmentType.RIGHT }), dc("Rendicontato")] }),
        new TableRow({ children: [dc("Metano"), dc("CH₄"), dc("29,8", { align: AlignmentType.RIGHT }), dc("Combustione fossile (tracce)"), dc(f3(tCh4), { align: AlignmentType.RIGHT }), dc("Incluso in tCO₂e")] }),
        new TableRow({ children: [dc("Ossido di diazoto"), dc("N₂O"), dc("273", { align: AlignmentType.RIGHT }), dc("Combustione fossile (tracce)"), dc(f3(tN2o), { align: AlignmentType.RIGHT }), dc("Incluso in tCO₂e")] }),
        new TableRow({ children: [dc("HFC"), dc("HFC"), dc("Var."), dc("Emissioni fuggitive (1.4)"), dc(tHfc > 0 ? f3(tHfc) : "—", { align: AlignmentType.RIGHT }), dc(tHfc > 0 ? "Rendicontato" : "N/A", { color: "999999" })] }),
        new TableRow({ children: [dc("PFC"), dc("PFC"), dc("—"), dc("Non presenti"), dc("—"), dc("N/A", { color: "999999" })] }),
        new TableRow({ children: [dc("SF₆"), dc("SF₆"), dc("25.200"), dc("Non presenti"), dc("—"), dc("N/A", { color: "999999" })] }),
        new TableRow({ children: [dc("NF₃"), dc("NF₃"), dc("17.400"), dc("Non presenti"), dc("—"), dc("N/A", { color: "999999" })] }),
        new TableRow({ children: [dc("CO₂ biogenica"), dc("CO₂-bio"), dc("0"), dc("Non applicabile"), dc("0"), dc("N/A", { color: "999999" })] }),
        new TableRow({ children: [dc("Scope 2 – CO₂", { shade: "F8FAF9" }), dc("CO₂", { shade: "F8FAF9" }), dc("—", { shade: "F8FAF9" }), dc("Energia elettrica importata", { shade: "F8FAF9" }), dc(f2(S2LB), { align: AlignmentType.RIGHT, shade: "F8FAF9" }), dc("Rendicontato", { shade: "F8FAF9" })] }),
      ]),
      p("I valori CH₄ e N₂O sono espressi in tCO₂e (già comprensivi di GWP). La disaggregazione per singolo gas è calcolata con rapporti IPCC AR6 specifici per tipo di combustibile.", { italic: true, sz: 18, color: "888888" }),
    );

    // ══════ 4. INVENTARIO ══════════════════════════
    D.push(
      h1("4. Inventario GHG quantificato  §6 · §9.3.1 · Fig. F.1", true),
      h2("4.1 Tabella consolidata (Figura F.1 – ISO 14064-1:2019)"),
      p("La tabella seguente riporta l'inventario consolidato conforme alla struttura della Figura F.1 dell'Appendice F della norma."),
    );
    const cR: TableRow[] = [new TableRow({ children: [hc("#", 4), hc("Categoria / Sorgente", 27), hc("tCO₂e", 11), hc("CO₂ t", 10), hc("CH₄ tCO₂e", 10), hc("N₂O tCO₂e", 10), hc("HFC tCO₂e", 10), hc("Inc.%", 9), hc("Q.", 9)] })];
    // Cat 1
    cR.push(new TableRow({ children: [dc("1", { bold: true, shade: "E8F4EF" }), dc("Cat. 1 – Emissioni dirette di GHG (Scope 1)", { bold: true, shade: "E8F4EF" }), dc(f2(S1T), { bold: true, align: AlignmentType.RIGHT, shade: "E8F4EF" }), dc(f2(tCo2), { align: AlignmentType.RIGHT, shade: "E8F4EF" }), dc(f3(tCh4), { align: AlignmentType.RIGHT, shade: "E8F4EF" }), dc(f3(tN2o), { align: AlignmentType.RIGHT, shade: "E8F4EF" }), dc(tHfc > 0 ? f3(tHfc) : "—", { align: AlignmentType.RIGHT, shade: "E8F4EF" }), dc(`±${f1(s1UW)}%`, { align: AlignmentType.RIGHT, shade: "E8F4EF" }), dc("—", { align: AlignmentType.CENTER, shade: "E8F4EF" })] }));
    s1.forEach((s, i) => {
      const e = $(s.emissions_tco2e), g = gas((s.source_label as string) || "");
      cR.push(new TableRow({ children: [dc(`1.${i + 1}`), dc((s.source_label as string) || "—"), dc(f3(e), { align: AlignmentType.RIGHT }), dc(f3(e * g.co2), { align: AlignmentType.RIGHT, color: "666666" }), dc(f3(e * g.ch4), { align: AlignmentType.RIGHT, color: "666666" }), dc(f3(e * g.n2o), { align: AlignmentType.RIGHT, color: "666666" }), dc(g.hfc > 0 ? f3(e * g.hfc) : "—", { align: AlignmentType.RIGHT, color: "666666" }), dc(`±${f1(s1U[i])}%`, { align: AlignmentType.RIGHT, color: "999999" }), dc("B", { align: AlignmentType.CENTER, color: "999999" })] }));
    });
    cR.push(new TableRow({ children: [dc("—", { italic: true, color: "999999" }), dc("di cui: CO₂ biogeniche (§App.D)", { italic: true, color: "999999" }), dc("0", { italic: true, color: "999999", align: AlignmentType.RIGHT }), dc("", { span: 4, color: "999999" }), dc("N/A", { color: "999999" }), dc("", { color: "999999" })] }));
    // Cat 2
    cR.push(new TableRow({ children: [dc("2", { bold: true, shade: "E8F4EF" }), dc("Cat. 2 – Emissioni indirette da energia importata (Scope 2)", { bold: true, shade: "E8F4EF" }), dc(`LB: ${f2(S2LB)}`, { bold: true, align: AlignmentType.RIGHT, shade: "E8F4EF" }), dc("— solo tCO₂e (§App.E)", { italic: true, color: "999999", shade: "E8F4EF", span: 4 }), dc(`±${f1(s2U)}%`, { align: AlignmentType.RIGHT, shade: "E8F4EF" }), dc("B", { align: AlignmentType.CENTER, shade: "E8F4EF" })] }));
    s2.forEach((s) => {
      const lbl = (s.source_label as string) || "SEDE PRINCIPALE";
      cR.push(new TableRow({ children: [dc("2.1 LB"), dc(`${lbl} – Elettricità – Location-based`), dc(f3($(s.emissions_location_tco2e)), { align: AlignmentType.RIGHT }), dc("— solo tCO₂e", { color: "999999", italic: true, span: 4 }), dc(`±${f1(s2U)}%`, { align: AlignmentType.RIGHT, color: "999999" }), dc("B", { align: AlignmentType.CENTER, color: "999999" })] }));
      cR.push(new TableRow({ children: [dc("2.1 MB"), dc(`${lbl} – Elettricità – Market-based`), dc(f3($(s.emissions_market_tco2e)), { align: AlignmentType.RIGHT }), dc("— solo tCO₂e", { color: "999999", italic: true, span: 4 }), dc(`±${f1(s2U)}%`, { align: AlignmentType.RIGHT, color: "999999" }), dc("B", { align: AlignmentType.CENTER, color: "999999" })] }));
    });
    for (const [n, l] of [["3", "Cat. 3 – Trasporti"], ["4", "Cat. 4 – Prodotti"], ["5", "Cat. 5 – Uso prodotti"], ["6", "Cat. 6 – Altre fonti"]]) {
      cR.push(new TableRow({ children: [dc(n, { italic: true, color: "AAAAAA" }), dc(l, { italic: true, color: "AAAAAA" }), dc("N.R.", { italic: true, color: "AAAAAA", align: AlignmentType.RIGHT }), dc("", { span: 4, color: "AAAAAA" }), dc("—", { color: "AAAAAA", align: AlignmentType.RIGHT }), dc("—", { color: "AAAAAA", align: AlignmentType.CENTER })] }));
    }
    cR.push(new TableRow({ children: [dc("", { shade: VD }), dc("TOTALE INVENTARIO GHG", { bold: true, color: "FFFFFF", shade: VD }), dc(`${f2(GT)} tCO₂e`, { bold: true, color: "FFFFFF", shade: VD, align: AlignmentType.RIGHT }), dc(f2(tCo2 + S2LB), { color: "FFFFFF", shade: VD, align: AlignmentType.RIGHT }), dc(f3(tCh4), { color: "FFFFFF", shade: VD, align: AlignmentType.RIGHT }), dc(f3(tN2o), { color: "FFFFFF", shade: VD, align: AlignmentType.RIGHT }), dc(tHfc > 0 ? f3(tHfc) : "—", { color: "FFFFFF", shade: VD, align: AlignmentType.RIGHT }), dc(`±${f1(TU)}%`, { color: "FFFFFF", shade: VD, align: AlignmentType.RIGHT }), dc("—", { color: "FFFFFF", shade: VD, align: AlignmentType.CENTER })] }));
    D.push(tbl(cR));
    D.push(p("† Per Cat. 2 i FE ISPRA/AIB sono già in tCO₂e aggregati. Disaggregazione per gas solo per Cat. 1.", { italic: true, sz: 16, color: "888888", before: 200 }));

    D.push(h2("4.2 Rappresentazione grafica dell'inventario"));
    if (c1) {
      D.push(gap(300), img(c1, 580, 280), gap(300));
      D.push(p("Il grafico mostra la ripartizione delle emissioni per categoria ISO 14064-1. Le categorie 1 e 2 rappresentano il 100% delle emissioni rendicontate.", { italic: true, sz: 20, color: "4A5568" }));
    }
    if (c2) {
      D.push(gap(300), img(c2, 400, 300), gap(300));
      D.push(p("Ripartizione delle sorgenti dirette (Scope 1): la caldaia rappresenta la quota prevalente delle emissioni dirette.", { italic: true, sz: 20, color: "4A5568" }));
    }
    if (c3) {
      D.push(gap(300), img(c3, 360, 290), gap(300));
      D.push(p("Confronto tra approccio location-based e market-based per le emissioni Scope 2.", { italic: true, sz: 20, color: "4A5568" }));
    }
    if (c4) {
      D.push(gap(300), img(c4, 560, 240), gap(300));
      D.push(p("Dettaglio delle sorgenti emissive per fonte. I dati di attività sono archiviati presso l'organizzazione e disponibili su richiesta per eventuali verifiche.", { italic: true, sz: 20, color: "4A5568" }));
    }

    // ══════ 5. QUANTIFICAZIONE ═════════════════════
    D.push(
      h1("5. Approccio di quantificazione  §6.2 · §6.3 · §9.3.1m,n,o", true),
      h2("5.1 Modello di calcolo"),
      p(narratives.quantificationIntro),
      p("La formula generale applicata è:"),
      new Paragraph({ children: [new TextRun({ text: "Emissioni (tCO₂e) = Dato attività × Fattore di emissione × GWP ÷ 1000", bold: true, size: 22, font: "Calibri" })], alignment: AlignmentType.CENTER, spacing: { before: 200, after: 200 } }),
      h2("5.2 Fattori di emissione e GWP utilizzati"),
    );
    const feR: TableRow[] = [new TableRow({ children: [hc("Sorgente", 28), hc("Fattore emissione", 15), hc("Unità", 15), hc("Anno FE", 10), hc("Fonte", 32)] })];
    s1.forEach((s) => {
      feR.push(new TableRow({ children: [dc((s.source_label as string) || "—"), dc(f6($(s.fe_value)), { align: AlignmentType.RIGHT }), dc(`tCO₂e/${(s.activity_unit as string) || "unità"}`), dc(`${$(s.fe_year) || 2024}`, { align: AlignmentType.CENTER }), dc((s.ef_reference as string) || (s.fe_source_ref as string) || "IPCC AR6 · ISPRA 2024")] }));
    });
    s2.forEach((s) => {
      const feC = s.fe_custom_value != null ? $(s.fe_custom_value) : null;
      const fl = feC ?? $(s.fe_location_value);
      const fm = $(s.fe_market_value);
      feR.push(new TableRow({ children: [dc(`${(s.source_label as string) || "Sede"} – Elettricità`), dc(`${f6(fl)} (LB) / ${f6(fm)} (MB)`, { align: AlignmentType.RIGHT }), dc("tCO₂e/kWh"), dc("2024", { align: AlignmentType.CENTER }), dc("LB: ISPRA 2024 | MB: contratto")] }));
    });
    D.push(tbl(feR));
    D.push(
      h2("5.3 Scope 2 – Approccio duale LB/MB (§App.E)"),
      p("In conformità all'Appendice E della norma, le emissioni Scope 2 sono state calcolate con entrambi gli approcci: Location-based (fattore medio rete nazionale ISPRA) e Market-based (tipologia contrattuale). Il valore rendicontato come principale è il location-based (LB) in conformità al §E.2.1."),
    );

    // ══════ 6. INCERTEZZA ══════════════════════════
    D.push(
      h1("6. Valutazione dell'incertezza  §8.3 · ISO/IEC Guide 98-3", true),
      p("La valutazione è stata condotta applicando la propagazione delle incertezze per componenti:"),
      new Paragraph({ children: [new TextRun({ text: "U_combinata = √(U_attività² + U_FE²)", bold: true, size: 22, font: "Calibri" })], alignment: AlignmentType.CENTER, spacing: { before: 150, after: 150 } }),
    );
    const uR: TableRow[] = [new TableRow({ children: [hc("Sorgente", 26), hc("U_att %", 12), hc("U_FE %", 12), hc("U_comb %", 13), hc("Qualità dato", 20), hc("Valutazione", 17)] })];
    s1.forEach((s, i) => {
      const ua = $(s.uncertainty_activity_pct ?? 3), uf = $(s.uncertainty_fe_pct ?? 2.5);
      uR.push(new TableRow({ children: [dc((s.source_label as string) || "—"), dc(`±${f1(ua)}%`, { align: AlignmentType.RIGHT }), dc(`±${f1(uf)}%`, { align: AlignmentType.RIGHT }), dc(`±${f1(s1U[i])}%`, { align: AlignmentType.RIGHT, bold: true }), dc("B – Primario verificato"), dc(s1U[i] < 10 ? "● Buona (<10%)" : "◑ Media", { color: s1U[i] < 10 ? VA : AM })] }));
    });
    s2.forEach((s) => {
      uR.push(new TableRow({ children: [dc(`${(s.source_label as string) || "Sede"} – Elettricità`), dc("±3,0%", { align: AlignmentType.RIGHT }), dc("±4,1%", { align: AlignmentType.RIGHT }), dc(`±${f1(s2U)}%`, { align: AlignmentType.RIGHT, bold: true }), dc("B – Primario verificato"), dc("● Buona (<10%)", { color: VA })] }));
    });
    uR.push(new TableRow({ children: [dc("CAT. 1 – TOTALE", { bold: true, shade: "F8FAF9" }), dc("—", { shade: "F8FAF9" }), dc("—", { shade: "F8FAF9" }), dc(`±${f1(s1UW)}%`, { bold: true, shade: "F8FAF9", align: AlignmentType.RIGHT }), dc("Media ponderata", { shade: "F8FAF9" }), dc("● Buona", { shade: "F8FAF9", color: VA })] }));
    uR.push(new TableRow({ children: [dc("CAT. 2 – TOTALE", { bold: true, shade: "F8FAF9" }), dc("—", { shade: "F8FAF9" }), dc("—", { shade: "F8FAF9" }), dc(`±${f1(s2U)}%`, { bold: true, shade: "F8FAF9", align: AlignmentType.RIGHT }), dc("Media ponderata", { shade: "F8FAF9" }), dc("● Buona", { shade: "F8FAF9", color: VA })] }));
    uR.push(new TableRow({ children: [dc("TOTALE INVENTARIO", { bold: true, shade: "E8F4EF" }), dc("—", { shade: "E8F4EF" }), dc("—", { shade: "E8F4EF" }), dc(`±${f1(TU)}%`, { bold: true, shade: "E8F4EF", align: AlignmentType.RIGHT }), dc("Combinazione quadratica", { shade: "E8F4EF" }), dc(`● ${TU < 10 ? "Buona" : "Media"} (<10%)`, { shade: "E8F4EF", color: VA })] }));
    D.push(tbl(uR));
    if (c5) D.push(img(c5, 560, 190));

    D.push(
      h2("6.2 Classificazione qualità del dato"),
      tbl([
        new TableRow({ children: [hc("Classe", 10), hc("Tipo dato", 22), hc("Descrizione", 45), hc("Incertezza", 23)] }),
        new TableRow({ children: [dc("A", { bold: true, color: VA }), dc("Primario specifico sito"), dc("Misurazione diretta con strumento tarato (contatore, bilancia)"), dc("1–5%")] }),
        new TableRow({ children: [dc("B", { bold: true, color: VA }), dc("Primario verificato"), dc("Calcolo da dati fattura/bolletta verificata"), dc("5–10%")] }),
        new TableRow({ children: [dc("C", { bold: true, color: AM }), dc("Secondario"), dc("Dato da database o letteratura, non specifico del sito"), dc("10–30%")] }),
        new TableRow({ children: [dc("D", { bold: true, color: "CC0000" }), dc("Default / Stima"), dc("Valore predefinito IPCC o stima ingegneristica"), dc(">30%")] }),
      ]),
      p(narratives.uncertaintyConclusion, { italic: true, sz: 18 }),
    );

    // ══════ 7. INTENSITÀ ═══════════════════════════
    D.push(
      h1("7. Indicatori di intensità GHG  §9.3.2g", true),
      tbl([new TableRow({ children: [kc(`${intRev} tCO₂e/M€`, "Intensità economica"), kc(`${intEmp} tCO₂e/dip.`, "Intensità occupazionale"), kc(`${intMWh} tCO₂e/MWh`, "Intensità energetica")] })]),
      p("Gli indicatori di intensità sono calcolati in conformità al §9.3.2g della norma UNI EN ISO 14064-1:2019. Consentono il confronto delle prestazioni climatiche indipendentemente dalle variazioni dimensionali dell'organizzazione nel tempo.", { italic: true, sz: 18 }),
    );

    // ══════ 8. INTERVENTO ══════════════════════════
    D.push(
      h1("8. Aree di intervento e potenziale di riduzione  §7.1 · §9.3.2b", true),
      p(narratives.interventionIntro),
    );
    const allSrc = [...s1.map((s) => ({ label: (s.source_label as string) || "—", em: $(s.emissions_tco2e) })), ...s2.map((s) => ({ label: ((s.source_label as string) || "Sede") + " – Energia elettrica", em: $(s.emissions_location_tco2e) }))].sort((a, b) => b.em - a.em);
    const prioColors = [AM, VA, "AAAAAA"];
    const prioLabels = ["● PRIORITÀ ALTA", "◑ PRIORITÀ MEDIA", "○ PRIORITÀ BASSA"];
    allSrc.slice(0, 3).forEach((s, i) => {
      const narrKey = `intervention_${i}` as keyof Narr;
      const aiText = narratives[narrKey] || "";
      // Split AI narrative into bullet points (by sentence or period)
      const bullets = aiText.split(/(?<=\.)\s+/).filter((t) => t.length > 10).slice(0, 4);
      if (bullets.length === 0) bullets.push(aiText || "Valutare opzioni di riduzione specifiche.");
      D.push(...priorityBox(`${s.label}  ${pc(s.em, GT)} del totale  ${prioLabels[i]}`, bullets, prioColors[i]));
    });

    D.push(h2("8.2 Riepilogo potenziale di riduzione"));
    const aR: TableRow[] = [new TableRow({ children: [hc("Area", 27), hc("Attuali tCO₂e", 14), hc("Riduz. %", 11), hc("Riduz. tCO₂e", 14), hc("Orizzonte", 14), hc("Priorità", 20)] })];
    let totRed = 0;
    allSrc.slice(0, 3).forEach((s, i) => {
      const rp = [40, 30, 20][i], red = s.em * rp / 100;
      totRed += red;
      aR.push(new TableRow({ children: [dc(tr(s.label, 28)), dc(f2(s.em), { align: AlignmentType.RIGHT }), dc(`${rp}%`, { align: AlignmentType.RIGHT }), dc(f2(red), { align: AlignmentType.RIGHT, bold: true }), dc(["1-3 anni", "2-5 anni", "3-7 anni"][i]), dc(prioLabels[i])] }));
    });
    aR.push(new TableRow({ children: [dc("TOTALE POTENZIALE", { bold: true, shade: "E8F4EF" }), dc(f2(GT), { align: AlignmentType.RIGHT, shade: "E8F4EF" }), dc(GT > 0 ? `${(totRed / GT * 100).toLocaleString("it-IT", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}%` : "—", { align: AlignmentType.RIGHT, shade: "E8F4EF" }), dc(f2(totRed), { align: AlignmentType.RIGHT, bold: true, shade: "E8F4EF", color: VD }), dc("", { shade: "E8F4EF" }), dc("", { shade: "E8F4EF" })] }));
    D.push(tbl(aR));
    D.push(p("Le stime sono indicative e basate su benchmark di settore. Non costituiscono impegni formali ai sensi del §7.3.", { italic: true, sz: 16, color: "888888" }));

    // ══════ 9. DICHIARAZIONI ═══════════════════════
    D.push(
      h1("9. Dichiarazioni obbligatorie ISO 14064-1:2019  §9.3.1", true),
      tbl([
        new TableRow({ children: [dc("§9.3.1r – Conformità norma", { bold: true, shade: "F5F5F5" }), dc(narratives.complianceStatement)] }),
        new TableRow({ children: [dc("§9.3.1s – Stato verifica", { bold: true, shade: "F5F5F5" }), dc("L'inventario GHG non è stato sottoposto a verifica indipendente di terza parte per il presente periodo di rendicontazione.")] }),
        new TableRow({ children: [dc("§9.3.1t – Valori GWP", { bold: true, shade: "F5F5F5" }), dc("Valori GWP: IPCC Sixth Assessment Report (AR6). Orizzonte temporale: 100 anni. In assenza di fattori specifici, applicati valori predefiniti IPCC.")] }),
        new TableRow({ children: [dc("§9.3.1k – Anno riferimento", { bold: true, shade: "F5F5F5" }), dc(`${Y} – primo anno di inventario, utilizzato come baseline per confronti futuri ai sensi del §6.4.1.`)] }),
        new TableRow({ children: [dc("§9.3.1a,b – Organizzazione", { bold: true, shade: "F5F5F5" }), dc(`${CN} – ${CA}. Approccio di consolidamento: controllo operativo (§5.1).`)] }),
        new TableRow({ children: [dc("§9.3.1 – Disponibilità dati", { bold: true, shade: "F5F5F5" }), dc(`I dati di attività, i fattori di emissione applicati e la documentazione di supporto sono archiviati presso ${CN} e disponibili su richiesta per attività di verifica di terza parte, in conformità ai requisiti di tracciabilità della norma UNI EN ISO 14064-1:2019.`)] }),
      ]),
      gap(300),
      tbl([new TableRow({ children: [
        dc(`Data di emissione: ${TODAY}  |  Codice: ${RC}`, { sz: 18 }),
        dc(`${RS}  |  Lead Auditor ISO 14064 · CO₂e Srl`, { align: AlignmentType.RIGHT, sz: 18 }),
      ] })]),
      gap(200), greenSep(), gap(100),
      // Brand footer box
      tbl([new TableRow({ children: [new TableCell({
        children: [
          new Paragraph({ children: [new TextRun({ text: "CO₂e Srl – Carbon to Value", bold: true, size: 22, font: "Calibri", color: "FFFFFF" })], alignment: AlignmentType.CENTER, spacing: { after: 40 } }),
          new Paragraph({ children: [new TextRun({ text: "Carbon Management · GHG Accounting · ESG Reporting | co2e.it", size: 18, font: "Calibri", color: "CCCCCC" })], alignment: AlignmentType.CENTER, spacing: { after: 40 } }),
          new Paragraph({ children: [new TextRun({ text: `${RS} – Auditor / Lead Auditor ISO 14064 / ISO 14067 – GHG & Carbon Footprint Specialist`, size: 16, font: "Calibri", color: "AAAAAA" })], alignment: AlignmentType.CENTER }),
        ],
        shading: { type: ShadingType.SOLID, color: VD }, borders: NB,
        margins: { top: 200, bottom: 200, left: 200, right: 200 },
      })] })]),
    );

    // ── Assemble ─────────────────────────────────────
    const document = new Document({
      creator: "CO₂e Srl", title: `Report GHG ${Y} – ${CN}`,
      description: "Inventario emissioni GHG conforme a ISO 14064-1:2019",
      sections: [{
        properties: {
          page: { size: { width: 11906, height: 16838 }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } },
          titlePage: true,
        },
        headers: {
          default: new Header({ children: [new Paragraph({
            children: [new TextRun({ text: `${CN}  |  Inventario GHG ${Y}  |  CO₂e Srl`, size: 16, font: "Calibri", color: "888888" })],
            alignment: AlignmentType.RIGHT,
            border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: "DDDDDD", space: 4 } },
          })] }),
        },
        footers: {
          default: new Footer({ children: [new Paragraph({
            tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
            children: [
              new TextRun({ text: "Rapporto riservato – uso interno", size: 16, font: "Calibri", color: "888888" }),
              new TextRun({ text: "\tPagina " }),
              new TextRun({ children: [PageNumber.CURRENT], size: 16, font: "Calibri", color: "888888" }),
            ],
            border: { top: { style: BorderStyle.SINGLE, size: 4, color: "DDDDDD", space: 4 } },
          })] }),
        },
        children: D,
      }],
    });

    const buffer = await Packer.toBuffer(document);
    const slug = CN.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9\s]/g, "").trim().replace(/\s+/g, "_").toUpperCase();
    const fname = `Report_GHG_${Y}_${slug}.docx`;
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${fname}"; filename*=UTF-8''${encodeURIComponent(fname)}`,
      },
    });
  } catch (err) {
    console.error("[generate-report]", err);
    return NextResponse.json({ error: `Errore: ${err instanceof Error ? err.message : "sconosciuto"}` }, { status: 500 });
  }
}
