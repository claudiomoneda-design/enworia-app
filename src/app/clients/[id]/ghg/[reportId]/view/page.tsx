"use client";

import { Fragment, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { CONSOLIDATION_APPROACH_OPTIONS, STATIONARY_FUEL_OPTIONS, FUEL_TYPE_OPTIONS } from "@/data/ghg-constants";
import { Tooltip as InfoTooltip } from "@/components/ui/Tooltip";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, ErrorBar,
} from "recharts";

/* ═══════════════════════════════════════════════════════════════
   ISO 14064-1:2019 — GHG Inventory Report View
   Conforme ai requisiti di rendicontazione §9.3
   ═══════════════════════════════════════════════════════════════ */

// Enworia palette
const C = {
  darkBase: "#1C2B28",
  darkSurface: "#2A3D39",
  darkHover: "#3A5249",
  accent: "#27AE60",
  accentDark: "#1A8A47",
  accentLight: "#E8F9EE",
  lightBg: "#F4F8F7",
  lightBorder: "#E2EAE8",
  ghg1: "#27AE60",
  ghg2: "#4DC47A",
  ghg3: "#7DD4A0",
  ghg4: "#A8E0BF",
  ghgNs: "#3A5249",
  warning: "#E8A020",
  danger: "#E85A4F",
  textMuted: "#A8C5BE",
  textMutedDark: "#6FCF97",
};
const GHG_DARK = C.darkBase;

type Row = Record<string, unknown>;

// ─── Fuel label map ────────────────────────────────────────────
const FUEL_LABELS: Record<string, string> = {};
STATIONARY_FUEL_OPTIONS.forEach((f) => { FUEL_LABELS[f.value] = f.label; });
FUEL_TYPE_OPTIONS.forEach((f) => { FUEL_LABELS[f.value] = f.label; });
function fuelLabel(key: string): string { return FUEL_LABELS[key] || key; }

// ─── Approach definitions ──────────────────────────────────────
const APPROACH_DEFINITIONS: Record<string, string> = {
  operational: "L'organizzazione rendiconta il 100% delle emissioni GHG delle installazioni sulle quali esercita il controllo operativo, ovvero ha piena autorità nell'introdurre e implementare le proprie politiche operative.",
  financial: "L'organizzazione rendiconta il 100% delle emissioni GHG delle installazioni sulle quali esercita il controllo finanziario, ovvero che sono consolidate integralmente nel proprio bilancio ai sensi dei principi contabili applicabili (IFRS / ITA GAAP).",
  equity_share: "L'organizzazione rendiconta le emissioni GHG in proporzione alla propria quota di partecipazione azionaria nelle installazioni incluse nell'inventario.",
};

// ─── Data quality mapping → ISO classes ────────────────────────
function mapDataQuality(dq: string): { cls: string; label: string; desc: string } {
  switch (dq) {
    case "dato_misurato": case "A": case "primario_sito":
      return { cls: "A", label: "A — Misurazione diretta", desc: "Dato misurato con strumento certificato" };
    case "bolletta": case "contatore": case "B": case "primario":
      return { cls: "B", label: "B — Calcolo verificato", desc: "Bolletta, fattura o lettura contatore" };
    case "stima_storici": case "C": case "secondario":
      return { cls: "C", label: "C — Stima dati secondari", desc: "Stima basata su storici o dati secondari" };
    case "stima_ragionata": case "stima_benchmark": case "D": case "default":
    default:
      return { cls: "D", label: "D — Valore predefinito", desc: "Stima ragionata, benchmark o letteratura" };
  }
}

// ─── Uncertainty semaphore ─────────────────────────────────────
function sem(unc: number): { emoji: string; color: string; text: string } {
  if (unc < 10) return { emoji: "🟢", color: "text-green-700 bg-green-100", text: "Buona" };
  if (unc <= 30) return { emoji: "🟡", color: "text-yellow-700 bg-yellow-100", text: "Media" };
  return { emoji: "🔴", color: "text-red-700 bg-red-100", text: "Bassa" };
}

// ─── Mode (most frequent value) ───────────────────────────────
function mode(arr: string[]): string {
  if (arr.length === 0) return "";
  const counts: Record<string, number> = {};
  arr.forEach((v) => { counts[v] = (counts[v] || 0) + 1; });
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
}

// ─── Number formatting (max 2 decimals) ──────────────────────
const fmt = (v: number | null | undefined) =>
  v == null ? "—" : Number(v).toLocaleString("it-IT", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const fmtLocale = fmt;
const fmtFe = (v: number | null | undefined) =>
  v == null ? "—" : Number(v).toLocaleString("it-IT", { minimumFractionDigits: 6, maximumFractionDigits: 6 });
const fmtPct = (v: number | null | undefined) =>
  v == null ? "—" : `±${Number(v).toLocaleString("it-IT", { minimumFractionDigits: 0, maximumFractionDigits: 1 })}%`;

// ─── Classify fugitive gas into HFC/PFC/SF₆ ──────────────────
function classifyGas(src: Row): "hfc" | "pfc" | "sf6" {
  const label = ((src.source_label as string) || "").toLowerCase();
  const fuel = ((src.activity_data_type as string) || "").toLowerCase();
  const combined = `${label} ${fuel}`;
  if (/sf6|sf₆|esafluoruro/i.test(combined)) return "sf6";
  if (/pfc|perfluoro|c2f6|c3f8|cf4/i.test(combined)) return "pfc";
  return "hfc";
}

// ─── Gas breakdown (IPCC AR6 ratios for fossil combustion) ────
const GAS_TOOLTIP = "Calcolato tramite rapporti fissi IPCC AR6 per combustione fossile. Valore esatto disponibile se inserita ripartizione per gas nel form.";
type GasBreak = { co2: number; ch4: number; n2o: number; hfc: number; pfc: number; sf6: number };

function calcGasBreakdown(src: Row): GasBreak {
  const em = Number(src.emissions_tco2e ?? 0);
  const iso = classifySource(src);
  if (iso === "1.4") {
    const gt = classifyGas(src);
    return { co2: 0, ch4: 0, n2o: 0, hfc: gt === "hfc" ? em : 0, pfc: gt === "pfc" ? em : 0, sf6: gt === "sf6" ? em : 0 };
  }
  // Fossil combustion: CO₂ dominant, trace CH₄ and N₂O
  return { co2: em * 0.9985, ch4: em * 0.0009, n2o: em * 0.0006, hfc: 0, pfc: 0, sf6: 0 };
}

function fmtGas(v: number): string {
  if (v === 0) return "—";
  if (v < 0.001) return "< 0,001";
  return v.toLocaleString("it-IT", { minimumFractionDigits: 0, maximumFractionDigits: 3 });
}

// ─── Section / Chapter component ──────────────────────────────
function Chapter({
  number,
  title,
  isoRef,
  children,
  id,
}: {
  number?: number;
  title: string;
  isoRef: string;
  children: React.ReactNode;
  id?: string;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div id={id} className="bg-white rounded-lg border border-gray-200 overflow-hidden print:break-inside-avoid">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-3 print:py-2 text-left"
        style={{ backgroundColor: C.darkBase }}
      >
        <h2 className="text-white font-semibold text-sm">
          {number !== undefined ? `Capitolo ${number} — ` : ""}{title}
        </h2>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#2A3D39] text-[#A8C5BE]">
            ISO 14064-1:2019 {isoRef}
          </span>
          <span className="text-white/70 text-xs print:hidden">{open ? "▲" : "▼"}</span>
        </div>
      </button>
      {open && <div className="px-5 py-4 print:py-3">{children}</div>}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-2 py-0.5">
      <span className="text-gray-500 min-w-[200px] text-sm">{label}:</span>
      <span className="font-medium text-sm">{value ?? "—"}</span>
    </div>
  );
}

function Badge({ children, variant = "green" }: { children: React.ReactNode; variant?: "green" | "gray" | "yellow" | "red" }) {
  const colors = {
    green: "bg-[#E8F9EE] text-[#1A8A47] border border-[#27AE60]",
    gray: "bg-[#2A3D39] text-[#6FCF97]",
    yellow: "bg-yellow-100 text-yellow-800",
    red: "bg-red-100 text-red-800",
  };
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${colors[variant]}`}>{children}</span>;
}

// ─── ISO 14064-1 subcategory classification ───────────────────
type IsoSubcategory = "1.1" | "1.2" | "1.3" | "1.4";

const KEYWORD_RULES: { iso: IsoSubcategory; patterns: RegExp }[] = [
  { iso: "1.4", patterns: /hfc|refrigerant|fuggitiv|perdita|leak|r-?\d{2,4}|sf6|nf3|pfc/i },
  { iso: "1.2", patterns: /mobile|veicol|auto|furgon|camion|trasport|flotta|automezzo|diesel\s*auto|benzina\s*auto|gasolio\s*v|moto|scooter|trattore|muletto|carrello|forklift|escavator|truck|van\b|mezzo/i },
  { iso: "1.1", patterns: /stazionari|caldaia|riscaldament|capannon|metano|gas\s*natural|gpl|gasolio\s*term|boiler|bruciator|termico|calore|vapore|cogenerator|riscald|forno|stufa|central|impianto\s*term/i },
  { iso: "1.3", patterns: /processo|lavorazion|produzion|chimic|cement|siderurg|industrial|reazion/i },
];

function classifySource(src: Row): IsoSubcategory {
  const cat = ((src.source_category as string) || "").toLowerCase().trim();
  const label = ((src.source_label as string) || "").toLowerCase();
  const fuel = ((src.activity_data_type as string) || "").toLowerCase();
  const combined = `${cat} ${label} ${fuel}`;

  if (cat === "hfc") return "1.4";
  if (cat === "mobile" || cat === "carburante") return "1.2";
  if (cat === "stazionario" || cat === "gas_naturale") return "1.1";

  const matched = KEYWORD_RULES.find((rule) => rule.patterns.test(combined));
  if (matched) return matched.iso;

  if (/combustion|fuel|combust/i.test(combined)) return "1.1";
  return "1.3";
}

// ─── GHG GAS list ─────────────────────────────────────────────
const GHG_GASES = ["CO₂", "CH₄", "N₂O", "SF₆", "HFC (media ponderata)", "PFC (media ponderata)", "NF₃"];

// ═══════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════
export default function GhgViewPage() {
  const params = useParams();
  const companyId = params.id as string;
  const reportId = params.reportId as string;
  const [companyName, setCompanyName] = useState("");
  const [companyData, setCompanyData] = useState<Row | null>(null);
  const [report, setReport] = useState<Row | null>(null);
  const [s1Sources, setS1Sources] = useState<Row[]>([]);
  const [s2Sources, setS2Sources] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
  const [expandedAccordion, setExpandedAccordion] = useState<string | null>("quant-1");
  const [downloading, setDownloading] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  useEffect(() => {
    (async () => {
      const [{ data: co }, { data: rep }, { data: s1 }, { data: s2 }] = await Promise.all([
        supabase.from("companies").select("*").eq("id", companyId).single(),
        supabase.from("ghg_reports").select("*").eq("id", reportId).single(),
        supabase.from("scope1_sources").select("*").eq("ghg_report_id", reportId),
        supabase.from("scope2_sources").select("*").eq("ghg_report_id", reportId),
      ]);
      if (co) { setCompanyName(co.company_name); setCompanyData(co as Row); }
      if (rep) setReport(rep);
      if (s1) setS1Sources(s1 as Row[]);
      if (s2) setS2Sources(s2 as Row[]);
      setLoading(false);
    })();
  }, [companyId, reportId]);

  if (loading) return <p className="text-gray-500 text-sm py-8 text-center">Caricamento report ISO 14064-1...</p>;
  if (!report) return <p className="text-red-600 text-sm py-8 text-center">Report non trovato.</p>;

  // ─── Extract form_data (JSONB) with optional chaining ───────
  const fd = (report.form_data as Record<string, unknown>) || {};

  // ─── Basic report fields ────────────────────────────────────
  const reportCode = (report.report_code as string) || "";
  const year = (report.reference_year as number) || (fd.year as number) || (report.year as number) || new Date(report.created_at as string).getFullYear();
  const s1Total = Number(report.scope1_total ?? 0);
  const s2lb = Number(report.scope2_lb_total ?? 0);
  const s2mb = Number(report.scope2_mb_total ?? 0);
  const grandTotal = Number(report.total_co2eq ?? 0) || s1Total + s2lb;
  const isComplete = report.status === "completato" || report.status === "completed";

  // Consolidation approach
  const consolidationValue = (fd.consolidation_approach as string) || (report.consolidation_approach as string) || "operational";
  const approachOption = CONSOLIDATION_APPROACH_OPTIONS.find((o) => o.value === consolidationValue);
  const approachLabel = approachOption?.label || "Controllo operativo";

  // Company data
  const companyAddress = (fd.company_address as string) || (companyData?.registered_address as string) || "—";
  const atecoCode = (fd.ateco_code as string) || (companyData?.nace_code as string) || "—";
  const responsibleName = (companyData?.responsible_name as string) || (fd.responsible_name as string) || "—";
  const inventoryPurposeRaw = fd.inventory_purpose;
  const PURPOSE_LABELS: Record<string, string> = {
    rendicontazione_volontaria: "Rendicontazione volontaria",
    supply_chain: "Richiesta da cliente/supply chain",
    bando_finanziamento: "Bando o finanziamento",
    verifica_terza_parte: "Preparazione verifica terza parte",
    vsme_reporting: "Rendicontazione VSME/ESG",
    altro: "Altro",
  };
  const inventoryPurpose = Array.isArray(inventoryPurposeRaw)
    ? (inventoryPurposeRaw as string[]).map((v) => PURPOSE_LABELS[v] || v).join(", ")
    : (inventoryPurposeRaw as string) || "Rendicontazione volontaria ai sensi della norma UNI EN ISO 14064-1:2019";

  // Reporting period
  const periodFrom = (fd.reporting_period_from as string) || (companyData?.reporting_period_start as string) || "";
  const periodTo = (fd.reporting_period_to as string) || (companyData?.reporting_period_end as string) || "";
  const periodLabel = periodFrom && periodTo
    ? `${new Date(periodFrom).toLocaleDateString("it-IT")} — ${new Date(periodTo).toLocaleDateString("it-IT")}`
    : `Anno ${year}`;

  // GWP source
  const s1GwpSources = s1Sources.map((s) => (s.gwp_source as string) || "").filter(Boolean);
  const gwpSource = (fd.gwp_source as string) || (s1GwpSources.length > 0 ? mode(s1GwpSources) : "IPCC AR6, orizzonte temporale 100 anni");

  // Verification
  const VERIFICATION_LABELS: Record<string, string> = {
    non_verificato: "Non verificato",
    verifica_limitata: "Verifica con garanzia limitata",
    verifica_ragionevole: "Verifica con garanzia ragionevole",
  };
  const verificationStatusRaw = (fd.verification_status as string) || "non_verificato";
  const verificationStatus = VERIFICATION_LABELS[verificationStatusRaw] || verificationStatusRaw;
  const verificationBody = (fd.verification_body as string) || "";

  // Reference year
  const referenceYear = (fd.reference_year as number) || year;
  const referenceYearRationale = (fd.reference_year_rationale as string) || "Primo anno di inventario — utilizzato come baseline per i confronti futuri.";

  // Materiality criteria
  const materialityCriteria = (fd.materiality_criteria as string) || "Le emissioni indirette significative sono state identificate sulla base dei criteri di entità, livello di influenza e accuratezza dei dati disponibili.";

  // Installations
  const installations = (fd.installations as Array<{ name: string; address: string }>) || [
    { name: (fd.company_name as string) || companyName || "Sede principale", address: companyAddress }
  ];

  // Consolidation rationale
  const consolidationRationale = (fd.consolidation_rationale as string) || "L'approccio adottato è coerente con il controllo esercitato dall'organizzazione sulle installazioni incluse nell'inventario.";

  // Mitigation
  const mitigationInitiatives = (fd.mitigation_initiatives as Array<{ title: string; description: string; reduction_tco2e: number }>) || [];

  // Categories 3-6
  const CAT_STATUS_LABELS: Record<string, string> = {
    non_rendicontato: "Non rendicontato in questa fase",
    significativo: "Significativo",
    non_significativo_documentato: "Non significativo (documentato)",
  };
  const catStatusLabel = (v: string) => CAT_STATUS_LABELS[v] || v || "Non rendicontato in questa fase";
  const defaultCatRationale = "Categoria valutata come non significativa o dati non disponibili per il periodo di rendicontazione.";
  const cat3Status = catStatusLabel((fd.category_3_status as string) || "");
  const cat3Rationale = (fd.category_3_rationale as string) || defaultCatRationale;
  const cat4Status = catStatusLabel((fd.category_4_status as string) || "");
  const cat4Rationale = (fd.category_4_rationale as string) || defaultCatRationale;
  const cat5Status = catStatusLabel((fd.category_5_status as string) || "");
  const cat5Rationale = (fd.category_5_rationale as string) || defaultCatRationale;
  const cat6Status = catStatusLabel((fd.category_6_status as string) || "");
  const cat6Rationale = (fd.category_6_rationale as string) || defaultCatRationale;

  // ─── Scope 1: classify sources into ISO 14064-1 subcategories ───
  const s1Groups: Record<string, { sources: Row[]; total: number }> = {
    "1.1": { sources: [], total: 0 },
    "1.2": { sources: [], total: 0 },
    "1.3": { sources: [], total: 0 },
    "1.4": { sources: [], total: 0 },
  };

  let co2Bio = 0;
  const biogenicTypes = new Set(["biogas", "wood_pellet", "wood"]);

  if (s1Sources.length > 0) {
    s1Sources.forEach((src) => {
      const em = Number(src.emissions_tco2e ?? 0);
      const fuel = (src.activity_data_type as string) || "";
      const iso = classifySource(src);

      s1Groups[iso].sources.push(src);
      s1Groups[iso].total += em;

      if (biogenicTypes.has(fuel)) co2Bio += em;
    });

    console.log("[GHG View] ISO classification result:", {
      "1.1_stazionaria": s1Groups["1.1"].sources.map((s) => s.source_label),
      "1.2_mobile": s1Groups["1.2"].sources.map((s) => s.source_label),
      "1.3_processo": s1Groups["1.3"].sources.map((s) => s.source_label),
      "1.4_fuggitiva": s1Groups["1.4"].sources.map((s) => s.source_label),
    });
  }

  // Gas totals for Cat.1 (IPCC AR6 ratios)
  const cat1GasTotals: GasBreak = { co2: 0, ch4: 0, n2o: 0, hfc: 0, pfc: 0, sf6: 0 };
  if (s1Sources.length > 0) {
    s1Sources.forEach((src) => {
      const gb = calcGasBreakdown(src);
      cat1GasTotals.co2 += gb.co2;
      cat1GasTotals.ch4 += gb.ch4;
      cat1GasTotals.n2o += gb.n2o;
      cat1GasTotals.hfc += gb.hfc;
      cat1GasTotals.pfc += gb.pfc;
      cat1GasTotals.sf6 += gb.sf6;
    });
  } else {
    // Fallback: assign all s1Total to CO₂
    cat1GasTotals.co2 = s1Total * 0.9985;
    cat1GasTotals.ch4 = s1Total * 0.0009;
    cat1GasTotals.n2o = s1Total * 0.0006;
  }

  // Scope 2 aggregates — debug FE values
  if (s2Sources.length > 0) {
    console.log("[GHG View] scope2_sources FE debug:", s2Sources.map((s) => ({
      label: s.source_label,
      fe_location_value: s.fe_location_value,
      fe_market_value: s.fe_market_value,
      fe_custom_value: s.fe_custom_value,
      fe_location_source: s.fe_location_source,
      fe_custom_source_ref: s.fe_custom_source_ref,
      activity_value_kwh: s.activity_value_kwh,
      emissions_location_tco2e: s.emissions_location_tco2e,
      emissions_market_tco2e: s.emissions_market_tco2e,
      check_lb: `${s.activity_value_kwh} × ${s.fe_custom_value ?? s.fe_location_value} = ${Number(s.activity_value_kwh ?? 0) * Number(s.fe_custom_value ?? s.fe_location_value ?? 0)} (saved: ${s.emissions_location_tco2e})`,
    })));
  }
  const s2LbTotal = s2Sources.length > 0 ? s2Sources.reduce((sum, s) => sum + Number(s.emissions_location_tco2e ?? 0), 0) : s2lb;
  const s2MbTotal = s2Sources.length > 0 ? s2Sources.reduce((sum, s) => sum + Number(s.emissions_market_tco2e ?? 0), 0) : s2mb;
  const s2FvSources = s2Sources.filter((s) => s.has_fv === true);

  // ─── Uncertainty calculations ───────────────────────────────
  const s1Uncertainties = s1Sources.map((s) => ({ em: Number(s.emissions_tco2e ?? 0), unc: Number(s.uncertainty_combined_pct ?? 10) }));
  const s2Uncertainties = s2Sources.map((s) => ({ em: Number(s.emissions_location_tco2e ?? 0), unc: Number(s.uncertainty_combined_pct ?? 5) }));

  const calcWeightedUncertainty = (items: { em: number; unc: number }[]) => {
    const totalEm = items.reduce((a, r) => a + r.em, 0);
    return totalEm > 0 ? items.reduce((a, r) => a + r.em * r.unc, 0) / totalEm : 0;
  };

  const s1WeightedUnc = calcWeightedUncertainty(s1Uncertainties);
  const s2WeightedUnc = calcWeightedUncertainty(s2Uncertainties);

  // Combined uncertainty: √(Σ(em_i × unc_i)²) / total × 100
  const allItems = [...s1Uncertainties, ...s2Uncertainties];
  const totalEmAll = allItems.reduce((a, r) => a + r.em, 0);
  const combinedUncertainty = totalEmAll > 0
    ? Math.sqrt(allItems.reduce((a, r) => a + Math.pow(r.em * r.unc / 100, 2), 0)) / totalEmAll * 100
    : calcWeightedUncertainty(allItems);

  // Data quality modes
  const s1Qualities = s1Sources.map((s) => (s.data_quality as string) || "stima_ragionata");
  const s2Qualities = s2Sources.map((s) => (s.data_quality as string) || "stima_ragionata");
  const s1QualityMode = s1Qualities.length > 0 ? mapDataQuality(mode(s1Qualities)) : mapDataQuality("stima_ragionata");
  const s2QualityMode = s2Qualities.length > 0 ? mapDataQuality(mode(s2Qualities)) : mapDataQuality("stima_ragionata");

  // ─── Chart data ─────────────────────────────────────────────
  // Pie data by subcategory
  const pieData = [
    { name: "1.1 Comb. stazionaria", value: s1Groups["1.1"].total, fill: C.ghg1 },
    { name: "1.2 Comb. mobile", value: s1Groups["1.2"].total, fill: C.ghg2 },
    { name: "1.3 Processi", value: s1Groups["1.3"].total, fill: C.ghg3 },
    { name: "1.4 Fuggitive", value: s1Groups["1.4"].total, fill: C.ghg4 },
    { name: "2. Energia importata", value: s2lb, fill: "#C8EDD4" },
  ].filter((d) => d.value > 0);
  // Fallback: if no s1Sources, use s1Total as single entry
  if (s1Sources.length === 0 && s1Total > 0) {
    pieData.unshift({ name: "Cat. 1 Dirette", value: s1Total, fill: C.ghg1 });
  }

  // Source horizontal bars
  const sourceBarData = s1Sources
    .map((src) => ({ name: (src.source_label as string) || "—", value: Number(src.emissions_tco2e ?? 0) }))
    .sort((a, b) => b.value - a.value);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tooltipFmt = (v: any) => `${fmt(Number(v))} tCO₂e`;

  const toggleRow = (key: string) => setExpandedRows((prev) => ({ ...prev, [key]: !prev[key] }));

  // ─── Intensity indicators (§9.3.2g) ─────────────────────────
  const turnover = Number(companyData?.turnover_eur ?? 0);
  const employees = Number(companyData?.number_of_employees ?? 0);

  // MWh conversion factors per fuel type
  const FUEL_MWH: Record<string, number> = {
    natural_gas: 0.01, lpg: 0.007, diesel: 0.01, gasolio: 0.01,
    benzina: 0.009, fuel_oil: 0.011, coal: 0.008, wood_pellet: 0.0047,
    wood: 0.004, hydrogen: 0.033,
  };
  const mwhScope1 = s1Sources.reduce((sum, src) => {
    const qty = Number(src.activity_value ?? 0);
    const fuel = (src.activity_data_type as string) || "";
    const factor = FUEL_MWH[fuel] || 0.01;
    return sum + qty * factor;
  }, 0);
  const kwhScope2 = s2Sources.reduce((sum, src) => sum + Number(src.activity_value_kwh ?? 0), 0);
  const mwhTotal = mwhScope1 + kwhScope2 / 1000;

  const intensitaFatturato = turnover > 0 ? (grandTotal / turnover) * 1_000_000 : null;
  const intensitaDipendenti = employees > 0 ? grandTotal / employees : null;
  const intensitaEnergia = mwhTotal > 0 ? grandTotal / mwhTotal : null;

  const today = new Date().toLocaleDateString("it-IT", { day: "2-digit", month: "long", year: "numeric" });

  return (
    <div className="space-y-6 max-w-5xl mx-auto print:max-w-none print:space-y-4" style={{ fontFamily: "Arial, sans-serif", color: GHG_DARK }}>

      {/* ═══════════ BANNER MODIFICA ═══════════ */}
      {isComplete && (
        <div className="bg-amber-50 border border-amber-300 text-amber-800 px-4 py-2 rounded-md text-sm">
          ⚠ Stai visualizzando un report completato. Le modifiche richiedono la riapertura del report.
        </div>
      )}

      {/* ═══════════ NAVIGATION (print:hidden) ═══════════ */}
      <div className="flex items-center justify-between print:hidden">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: C.accent }}>
            Inventario GHG — ISO 14064-1:2019
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">{companyName} · {periodLabel}</p>
          {reportCode && <p className="text-xs text-gray-400 font-mono">{reportCode}</p>}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={downloading}
            onClick={async () => {
              setDownloading(true);
              try {
                const res = await fetch(`/api/ghg/${reportId}/generate-report`);
                if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error((e as { error?: string }).error || "Errore generazione"); }
                const cd = res.headers.get("content-disposition") || "";
                const fnMatch = cd.match(/filename="([^"]+)"/);
                const fname = fnMatch ? fnMatch[1] : `Report_GHG_${year}.docx`;
                const blob = await res.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = fname;
                a.click();
                window.URL.revokeObjectURL(url);
              } catch (err) {
                alert(err instanceof Error ? err.message : "Errore durante la generazione del report");
              } finally {
                setDownloading(false);
              }
            }}
            className="text-white px-3 py-1.5 rounded-md text-sm font-medium transition-colors disabled:opacity-60"
            style={{ backgroundColor: downloading ? "#999" : C.darkBase }}
          >
            {downloading ? "Generazione in corso..." : "Genera Report Word — Stile ISO 14064"}
          </button>
          <button
            type="button"
            disabled={downloadingPdf}
            onClick={async () => {
              setDownloadingPdf(true);
              try {
                const res = await fetch(`/api/ghg/${reportId}/generate-presentation`);
                if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error((e as { error?: string }).error || "Errore generazione PDF"); }
                const cd = res.headers.get("content-disposition") || "";
                const fnMatch = cd.match(/filename="([^"]+)"/);
                const fname = fnMatch ? fnMatch[1] : `Sintesi_GHG_${year}.pdf`;
                const blob = await res.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = fname;
                a.click();
                window.URL.revokeObjectURL(url);
              } catch (err) {
                alert(err instanceof Error ? err.message : "Errore durante la generazione della sintesi PDF");
              } finally {
                setDownloadingPdf(false);
              }
            }}
            className="text-white px-3 py-1.5 rounded-md text-sm font-medium transition-colors disabled:opacity-60"
            style={{ backgroundColor: downloadingPdf ? "#999" : "#006450" }}
          >
            {downloadingPdf ? "Generazione PDF..." : "Scarica Sintesi Cliente (PDF)"}
          </button>
          <Link href={`/clients/${companyId}/ghg/${reportId}/scope3`}
            className="border border-blue-300 text-blue-700 px-3 py-1.5 rounded-md text-sm font-medium hover:bg-blue-50">Scope 3 Screening</Link>
          <Link href={`/clients/${companyId}/ghg/${reportId}/edit`}
            className="border border-gray-300 text-gray-700 px-3 py-1.5 rounded-md text-sm hover:bg-gray-50">Modifica</Link>
          <Link href={`/clients/${companyId}`}
            className="border border-gray-300 text-gray-500 px-3 py-1.5 rounded-md text-sm hover:bg-gray-50">← Torna al cliente</Link>
        </div>
      </div>

      {/* ═══════════ HEADER — Dichiarazione consolidata ═══════════ */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden print:break-inside-avoid">
        <div className="px-5 py-3" style={{ backgroundColor: C.darkBase }}>
          <h2 className="text-white font-semibold text-sm">Dichiarazione consolidata dell&apos;inventario GHG</h2>
        </div>
        <div className="px-5 py-4 space-y-0.5">
          <InfoRow label="Società rendicontante" value={companyName} />
          <InfoRow label="Responsabile" value={responsibleName} />
          <InfoRow label="Periodo di rendicontazione" value={periodLabel} />
          <InfoRow label="Codice rapporto" value={<span className="font-mono">{reportCode || "—"}</span>} />
          <InfoRow label="Confini organizzativi" value={approachLabel} />
          <InfoRow label="Confini di rendicontazione" value="Cat. 1 + Cat. 2 — vedere Capitolo 3" />
          <InfoRow label="Stato" value={
            <Badge variant={isComplete ? "green" : "yellow"}>{isComplete ? "Completato" : "Bozza"}</Badge>
          } />
        </div>
      </div>

      {/* ═══════════ CAPITOLO 1 — Descrizione generale ═══════════ */}
      <Chapter number={1} title="Descrizione generale" isoRef="§9.3.1" id="cap1">
        <div className="space-y-4">
          <div className="space-y-0.5">
            <InfoRow label="Organizzazione" value={companyName} />
            <InfoRow label="Indirizzo" value={companyAddress} />
            <InfoRow label="Settore (codice ATECO/NACE)" value={atecoCode} />
            <InfoRow label="Responsabile del rapporto" value={responsibleName} />
            <InfoRow label="Scopo dell'inventario GHG" value={inventoryPurpose} />
            <InfoRow label="Periodo di rendicontazione" value={periodLabel} />
          </div>

          {/* GHG considerati */}
          <div>
            <p className="text-sm font-semibold text-gray-700 mb-1">GHG considerati</p>
            <div className="flex flex-wrap gap-1.5">
              {GHG_GASES.map((g) => (
                <span key={g} className="bg-gray-100 text-gray-700 text-xs px-2 py-0.5 rounded">{g}</span>
              ))}
            </div>
          </div>

          {/* GWP */}
          <InfoRow label="Valori GWP utilizzati" value={gwpSource} />

          {/* Verification status */}
          <div className="flex items-start gap-3 bg-gray-50 rounded-lg p-3">
            <span className="text-lg">{verificationStatus.toLowerCase().includes("verificato") && !verificationStatus.toLowerCase().includes("non") ? "✅" : "⚠️"}</span>
            <div className="text-sm">
              <p className="font-medium">Stato verifica: {verificationStatus}</p>
              {verificationStatus.toLowerCase().includes("non") || !verificationBody ? (
                <p className="text-gray-500 text-xs mt-0.5">
                  Inventario non sottoposto a verifica indipendente di terza parte.
                </p>
              ) : (
                <p className="text-gray-500 text-xs mt-0.5">
                  Verifica condotta da: {verificationBody}.
                </p>
              )}
            </div>
          </div>

          {/* Dichiarazione obbligatoria §9.3.1r */}
          <div className="bg-green-50 border border-green-200 rounded-lg p-3">
            <p className="text-xs font-mono text-gray-500 mb-1">§9.3.1r — Dichiarazione obbligatoria</p>
            <p className="text-sm text-green-900">
              Il presente rapporto è stato preparato in conformità alla norma UNI EN ISO 14064-1:2019.
            </p>
          </div>
        </div>
      </Chapter>

      {/* ═══════════ CAPITOLO 2 — Confini organizzativi ═══════════ */}
      <Chapter number={2} title="Confini organizzativi" isoRef="§5.1" id="cap2">
        <div className="space-y-4">
          <div>
            <p className="text-sm font-semibold text-gray-700 mb-1">
              Approccio di consolidamento: {approachLabel}
            </p>
            <p className="text-sm text-gray-600 bg-gray-50 p-3 rounded-lg">
              {APPROACH_DEFINITIONS[consolidationValue] || APPROACH_DEFINITIONS.operational}
            </p>
          </div>

          {/* Installations table */}
          <div>
            <p className="text-sm font-semibold text-gray-700 mb-2">Installazioni incluse nell&apos;inventario</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
                <thead>
                  <tr style={{ backgroundColor: C.darkBase }}>
                    <th className="py-2 px-3 text-left text-xs text-white font-medium">Nome installazione</th>
                    <th className="py-2 px-3 text-left text-xs text-white font-medium">Indirizzo</th>
                    <th className="py-2 px-3 text-center text-xs text-white font-medium">Inclusa</th>
                  </tr>
                </thead>
                <tbody>
                  {installations.map((inst, i) => (
                    <tr key={i} className="border-b border-gray-100">
                      <td className="py-2 px-3">{inst.name || "—"}</td>
                      <td className="py-2 px-3 text-gray-600">{inst.address || "—"}</td>
                      <td className="py-2 px-3 text-center"><Badge variant="green">Sì</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <p className="text-sm font-semibold text-gray-700 mb-1">Motivazione</p>
            <p className="text-sm text-gray-600">{consolidationRationale}</p>
          </div>
        </div>
      </Chapter>

      {/* ═══════════ CAPITOLO 3 — Confini di rendicontazione ═══════════ */}
      <Chapter number={3} title="Confini di rendicontazione" isoRef="§5.2" id="cap3">
        <div className="space-y-5">
          {/* Anno di riferimento */}
          <div>
            <p className="text-sm font-semibold text-gray-700 mb-1">
              Anno di riferimento (§6.4.1)
              <InfoTooltip text="L'anno di riferimento è obbligatorio ai sensi del §6.4.1 della norma ISO 14064-1:2019. Serve come baseline per confronti futuri." />
            </p>
            <p className="text-sm text-gray-600">
              Anno di riferimento selezionato: <strong>{referenceYear}</strong>. {referenceYearRationale}
            </p>
          </div>

          {/* Materiality criteria */}
          <div>
            <p className="text-sm font-semibold text-gray-700 mb-1">Criteri di materialità (§5.2.3)</p>
            <p className="text-sm text-gray-600">{materialityCriteria}</p>
          </div>

          {/* 6 Categories table */}
          <div>
            <p className="text-sm font-semibold text-gray-700 mb-2">Categorie ISO 14064-1 — Confini di rendicontazione</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
                <thead>
                  <tr style={{ backgroundColor: C.darkBase }}>
                    <th className="py-2 px-3 text-left text-xs text-white font-medium w-8">#</th>
                    <th className="py-2 px-3 text-left text-xs text-white font-medium">Categoria</th>
                    <th className="py-2 px-3 text-center text-xs text-white font-medium">Stato</th>
                    <th className="py-2 px-3 text-right text-xs text-white font-medium">tCO₂e</th>
                    <th className="py-2 px-3 text-left text-xs text-white font-medium">Note / Motivazione</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Cat 1 */}
                  <tr className="border-b border-gray-100">
                    <td className="py-2 px-3 font-medium">1</td>
                    <td className="py-2 px-3">Emissioni e rimozioni dirette di GHG</td>
                    <td className="py-2 px-3 text-center"><Badge variant="green">SIGNIFICATIVO</Badge></td>
                    <td className="py-2 px-3 text-right font-medium">{fmtLocale(s1Total)}</td>
                    <td className="py-2 px-3 text-xs text-gray-600">Rendicontato — vedere Capitolo 4</td>
                  </tr>
                  {/* Cat 2 */}
                  <tr className="border-b border-gray-100">
                    <td className="py-2 px-3 font-medium">2</td>
                    <td className="py-2 px-3">Emissioni indirette da energia importata</td>
                    <td className="py-2 px-3 text-center"><Badge variant="green">SIGNIFICATIVO</Badge></td>
                    <td className="py-2 px-3 text-right font-medium">
                      <span>LB: {fmtLocale(s2lb)}</span>
                      <br />
                      <span className="text-gray-500">MB: {fmtLocale(s2mb)}</span>
                    </td>
                    <td className="py-2 px-3 text-xs text-gray-600">Rendicontato LB e MB — vedere Capitolo 4</td>
                  </tr>
                  {/* Cat 3 */}
                  <tr className="border-b border-gray-100 text-[#6FCF97] opacity-60 italic">
                    <td className="py-2 px-3">3</td>
                    <td className="py-2 px-3">Emissioni indirette dal trasporto</td>
                    <td className="py-2 px-3 text-center"><Badge variant="gray">{cat3Status}</Badge></td>
                    <td className="py-2 px-3 text-right">—</td>
                    <td className="py-2 px-3 text-xs">{cat3Rationale}</td>
                  </tr>
                  {/* Cat 4 */}
                  <tr className="border-b border-gray-100 text-[#6FCF97] opacity-60 italic">
                    <td className="py-2 px-3">4</td>
                    <td className="py-2 px-3">Emissioni indirette da prodotti utilizzati</td>
                    <td className="py-2 px-3 text-center"><Badge variant="gray">{cat4Status}</Badge></td>
                    <td className="py-2 px-3 text-right">—</td>
                    <td className="py-2 px-3 text-xs">{cat4Rationale}</td>
                  </tr>
                  {/* Cat 5 */}
                  <tr className="border-b border-gray-100 text-[#6FCF97] opacity-60 italic">
                    <td className="py-2 px-3">5</td>
                    <td className="py-2 px-3">Emissioni indirette associate all&apos;uso di prodotti dell&apos;organizzazione</td>
                    <td className="py-2 px-3 text-center"><Badge variant="gray">{cat5Status}</Badge></td>
                    <td className="py-2 px-3 text-right">—</td>
                    <td className="py-2 px-3 text-xs">{cat5Rationale}</td>
                  </tr>
                  {/* Cat 6 */}
                  <tr className="text-[#6FCF97] opacity-60 italic">
                    <td className="py-2 px-3">6</td>
                    <td className="py-2 px-3">Emissioni indirette da altre fonti</td>
                    <td className="py-2 px-3 text-center"><Badge variant="gray">{cat6Status}</Badge></td>
                    <td className="py-2 px-3 text-right">—</td>
                    <td className="py-2 px-3 text-xs">{cat6Rationale}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </Chapter>

      {/* ═══════════ CAPITOLO 4 — Inventario GHG quantificato ═══════════ */}
      <Chapter number={4} title="Inventario GHG quantificato" isoRef="§6" id="cap4">
        <div className="space-y-6">

          {/* ─── 4A) TABELLA CONSOLIDATA ISO (F.1) ─── */}
          <div>
            <p className="text-sm font-semibold text-gray-700 mb-1">
              Tabella consolidata dell&apos;inventario GHG
              <InfoTooltip text="Ispirata alla figura F.1 della norma UNI EN ISO 14064-1:2019. La ripartizione per singolo gas è approssimata: per combustione fossile CO₂ ≈ tCO₂e (CH₄ e N₂O < 1%)." />
            </p>
            <p className="text-xs text-gray-500 font-mono mb-3">Rif. Fig. F.1 — UNI EN ISO 14064-1:2019</p>

            <div className="overflow-x-auto border border-gray-200 rounded-lg">
              <table className="w-full text-sm whitespace-nowrap">
                <thead>
                  <tr style={{ backgroundColor: C.darkBase }}>
                    <th className="py-2 px-3 text-left text-xs text-white font-medium w-8">#</th>
                    <th className="py-2 px-3 text-left text-xs text-white font-medium">Categoria / Sorgente</th>
                    <th className="py-2 px-3 text-left text-xs text-white font-medium">Note</th>
                    <th className="py-2 px-3 text-right text-xs text-white font-medium">tCO₂e TOT</th>
                    <th className="py-2 px-3 text-right text-xs text-white font-medium">CO₂</th>
                    <th className="py-2 px-3 text-right text-xs text-white font-medium">CH₄</th>
                    <th className="py-2 px-3 text-right text-xs text-white font-medium">N₂O</th>
                    <th className="py-2 px-2 text-right text-[10px] text-white font-medium">HFC</th>
                    <th className="py-2 px-2 text-right text-[10px] text-white font-medium">PFC</th>
                    <th className="py-2 px-2 text-right text-[10px] text-white font-medium">SF₆</th>
                    <th className="py-2 px-3 text-right text-xs text-white font-medium">Incert. %</th>
                    <th className="py-2 px-3 text-center text-xs text-white font-medium">Qualità</th>
                  </tr>
                </thead>
                <tbody>

                  {/* ── Cat. 1 Header ── */}
                  <tr className="bg-gray-100 font-semibold border-b border-gray-200">
                    <td className="py-2 px-3">1</td>
                    <td className="py-2 px-3">Cat. 1: Emissioni dirette di GHG</td>
                    <td className="py-2 px-3"></td>
                    <td className="py-2 px-3 text-right">{fmt(s1Total)}</td>
                    <td className="py-2 px-3 text-right" title={GAS_TOOLTIP}>{fmt(cat1GasTotals.co2)}</td>
                    <td className="py-2 px-3 text-right text-xs" title={GAS_TOOLTIP}>{fmtGas(cat1GasTotals.ch4)}</td>
                    <td className="py-2 px-3 text-right text-xs" title={GAS_TOOLTIP}>{fmtGas(cat1GasTotals.n2o)}</td>
                    <td className="py-2 px-2 text-right text-xs">{fmtGas(cat1GasTotals.hfc)}</td>
                    <td className="py-2 px-2 text-right text-xs">{fmtGas(cat1GasTotals.pfc)}</td>
                    <td className="py-2 px-2 text-right text-xs">{fmtGas(cat1GasTotals.sf6)}</td>
                    <td className="py-2 px-3 text-right">{fmtPct(s1WeightedUnc)}</td>
                    <td className="py-2 px-3 text-center"><Badge variant={s1QualityMode.cls === "A" || s1QualityMode.cls === "B" ? "green" : "yellow"}>{s1QualityMode.cls}</Badge></td>
                  </tr>

                  {/* ── Cat. 1 Sub-rows ── */}
                  {s1Sources.length > 0 ? (
                    <>
                      {(["1.1", "1.2", "1.3", "1.4"] as const).map((isoKey) => {
                        const group = s1Groups[isoKey];
                        const labels: Record<string, string> = {
                          "1.1": "Combustione stazionaria",
                          "1.2": "Combustione mobile",
                          "1.3": "Processi industriali",
                          "1.4": "Emissioni fuggitive",
                        };
                        const rowKey = isoKey;
                        const isExpanded = expandedRows[rowKey];

                        // Always show 1.3 and 1.4 for ISO completeness (§5.2.4)
                        if (group.sources.length === 0 && isoKey !== "1.4" && isoKey !== "1.3") return null;

                        // Gas totals for this subcategory
                        const subGas: GasBreak = { co2: 0, ch4: 0, n2o: 0, hfc: 0, pfc: 0, sf6: 0 };
                        group.sources.forEach((s) => {
                          const gb = calcGasBreakdown(s);
                          subGas.co2 += gb.co2; subGas.ch4 += gb.ch4; subGas.n2o += gb.n2o;
                          subGas.hfc += gb.hfc; subGas.pfc += gb.pfc; subGas.sf6 += gb.sf6;
                        });

                        return (
                          <Fragment key={isoKey}>
                            <tr
                              className={`border-b border-gray-100 ${group.sources.length > 0 ? "cursor-pointer hover:bg-gray-50" : ""}`}
                              onClick={() => group.sources.length > 0 && toggleRow(rowKey)}
                            >
                              <td className="py-1.5 px-3 pl-8 text-gray-500 text-xs">{rowKey}</td>
                              <td className="py-1.5 px-3 pl-8 text-gray-700">
                                {group.sources.length > 0 && <span className="text-gray-400 mr-1 text-xs">{isExpanded ? "▼" : "▶"}</span>}
                                {labels[isoKey]}
                              </td>
                              <td className="py-1.5 px-3 text-xs text-gray-400">{group.sources.length === 0 ? "Non applicabile per questa organizzazione" : ""}</td>
                              <td className={`py-1.5 px-3 text-right ${group.sources.length === 0 ? "text-gray-400" : "text-gray-700"}`}>{group.total > 0 ? fmt(group.total) : "0"}</td>
                              <td className="py-1.5 px-3 text-right text-gray-500 text-xs" title={GAS_TOOLTIP}>{fmtGas(subGas.co2)}</td>
                              <td className="py-1.5 px-3 text-right text-gray-500 text-xs" title={GAS_TOOLTIP}>{fmtGas(subGas.ch4)}</td>
                              <td className="py-1.5 px-3 text-right text-gray-500 text-xs" title={GAS_TOOLTIP}>{fmtGas(subGas.n2o)}</td>
                              <td className="py-1.5 px-2 text-right text-gray-500 text-xs">{fmtGas(subGas.hfc)}</td>
                              <td className="py-1.5 px-2 text-right text-gray-500 text-xs">{fmtGas(subGas.pfc)}</td>
                              <td className="py-1.5 px-2 text-right text-gray-500 text-xs">{fmtGas(subGas.sf6)}</td>
                              <td className="py-1.5 px-3 text-right text-gray-400">—</td>
                              <td className="py-1.5 px-3 text-center text-gray-400">—</td>
                            </tr>
                            {isExpanded && group.sources.map((src, si) => {
                              const srcGas = calcGasBreakdown(src);
                              return (
                                <tr key={si} className="border-b border-gray-50 bg-gray-50/50">
                                  <td className="py-1 px-3 pl-14 text-gray-400 text-[11px]"></td>
                                  <td className="py-1 px-3 pl-14 text-gray-500 text-xs">{src.source_label as string}</td>
                                  <td className="py-1 px-3 text-xs text-gray-400">{fuelLabel(src.activity_data_type as string)}</td>
                                  <td className="py-1 px-3 text-right text-xs text-gray-600">{fmt(Number(src.emissions_tco2e ?? 0))}</td>
                                  <td className="py-1 px-3 text-right text-gray-400 text-xs" title={GAS_TOOLTIP}>{fmtGas(srcGas.co2)}</td>
                                  <td className="py-1 px-3 text-right text-gray-400 text-xs" title={GAS_TOOLTIP}>{fmtGas(srcGas.ch4)}</td>
                                  <td className="py-1 px-3 text-right text-gray-400 text-xs" title={GAS_TOOLTIP}>{fmtGas(srcGas.n2o)}</td>
                                  <td className="py-1 px-2 text-right text-gray-400 text-xs">{fmtGas(srcGas.hfc)}</td>
                                  <td className="py-1 px-2 text-right text-gray-400 text-xs">{fmtGas(srcGas.pfc)}</td>
                                  <td className="py-1 px-2 text-right text-gray-400 text-xs">{fmtGas(srcGas.sf6)}</td>
                                  <td className="py-1 px-3 text-right text-xs text-gray-500">{fmtPct(Number(src.uncertainty_combined_pct ?? 10))}</td>
                                  <td className="py-1 px-3 text-center"><Badge variant="gray">{mapDataQuality((src.data_quality as string) || "").cls}</Badge></td>
                                </tr>
                              );
                            })}
                          </Fragment>
                        );
                      })}

                      {/* 1.5 LULUCF */}
                      <tr className="border-b border-gray-100">
                        <td className="py-1.5 px-3 pl-8 text-gray-400 text-xs">1.5</td>
                        <td className="py-1.5 px-3 pl-8 text-gray-400">LULUCF</td>
                        <td className="py-1.5 px-3"><Badge variant="gray">Non applicabile</Badge></td>
                        <td className="py-1.5 px-3 text-right text-gray-400">0</td>
                        <td className="py-1.5 px-3 text-right text-gray-400">—</td>
                        <td className="py-1.5 px-3 text-right text-gray-400">—</td>
                        <td className="py-1.5 px-3 text-right text-gray-400">—</td>
                        <td className="py-1.5 px-2 text-right text-gray-400">—</td>
                        <td className="py-1.5 px-2 text-right text-gray-400">—</td>
                        <td className="py-1.5 px-2 text-right text-gray-400">—</td>
                        <td className="py-1.5 px-3 text-right text-gray-400">—</td>
                        <td className="py-1.5 px-3 text-center text-gray-400">—</td>
                      </tr>

                      {/* Biogenic CO₂ */}
                      <tr className="border-b border-gray-200 bg-gray-50/50">
                        <td className="py-1.5 px-3"></td>
                        <td className="py-1.5 px-3 italic text-gray-500 text-xs" colSpan={2}>
                          di cui: emissioni CO₂ biogeniche (§App.D)
                        </td>
                        <td className="py-1.5 px-3 text-right text-gray-500 text-xs italic">
                          {co2Bio > 0 ? fmt(co2Bio) : "0"}
                        </td>
                        <td className="py-1.5 px-3 text-right text-gray-400 text-xs italic" colSpan={7}>
                          {co2Bio > 0 ? "" : "Non applicabile — nessun consumo di biomassa rendicontato"}
                        </td>
                        <td className="py-1.5 px-3"></td>
                      </tr>
                    </>
                  ) : (
                    <tr className="border-b border-gray-200">
                      <td className="py-1.5 px-3"></td>
                      <td className="py-1.5 px-3 text-gray-500 italic text-xs" colSpan={11}>
                        Dettaglio sorgenti non disponibile — valore totale dal report: {fmt(s1Total)} tCO₂e
                      </td>
                    </tr>
                  )}

                  {/* ── Cat. 2 Header ── */}
                  <tr className="bg-gray-100 font-semibold border-b border-gray-200">
                    <td className="py-2 px-3">2</td>
                    <td className="py-2 px-3">Cat. 2: Emissioni indirette da energia importata</td>
                    <td className="py-2 px-3"></td>
                    <td className="py-2 px-3 text-right">LB: {fmt(s2LbTotal)}</td>
                    <td className="py-2 px-3 text-left text-xs text-gray-400 italic font-normal" colSpan={6}>— solo tCO₂e aggregato (§App.E) †</td>
                    <td className="py-2 px-3 text-right">{fmtPct(s2WeightedUnc)}</td>
                    <td className="py-2 px-3 text-center"><Badge variant={s2QualityMode.cls === "A" || s2QualityMode.cls === "B" ? "green" : "yellow"}>{s2QualityMode.cls}</Badge></td>
                  </tr>

                  {/* ── Cat. 2 Sub-rows ── */}
                  {s2Sources.length > 0 ? (
                    <>
                      {/* 2.1 LB */}
                      <tr
                        className="border-b border-gray-100 cursor-pointer hover:bg-gray-50"
                        onClick={() => toggleRow("2.1")}
                      >
                        <td className="py-1.5 px-3 pl-8 text-gray-500 text-xs">2.1</td>
                        <td className="py-1.5 px-3 pl-8 text-gray-700">
                          <span className="text-gray-400 mr-1 text-xs">{expandedRows["2.1"] ? "▼" : "▶"}</span>
                          Elettricità importata — Location-based (LB)
                        </td>
                        <td className="py-1.5 px-3"></td>
                        <td className="py-1.5 px-3 text-right text-gray-700">{fmt(s2LbTotal)}</td>
                        <td className="py-1.5 px-3 text-gray-400" colSpan={6}></td>
                        <td className="py-1.5 px-3 text-right text-gray-400">—</td>
                        <td className="py-1.5 px-3 text-center text-gray-400">—</td>
                      </tr>
                      {expandedRows["2.1"] && s2Sources.map((src, i) => (
                        <tr key={`lb-${i}`} className="border-b border-gray-50 bg-gray-50/50">
                          <td className="py-1 px-3 pl-14"></td>
                          <td className="py-1 px-3 pl-14 text-gray-500 text-xs">{src.source_label as string}</td>
                          <td className="py-1 px-3 text-xs text-gray-400">{fmt(Number(src.activity_value_kwh ?? 0))} kWh</td>
                          <td className="py-1 px-3 text-right text-xs text-gray-600">{fmt(Number(src.emissions_location_tco2e ?? 0))}</td>
                          <td className="py-1 px-3" colSpan={6}></td>
                          <td className="py-1 px-3 text-right text-xs text-gray-500">{fmtPct(Number(src.uncertainty_combined_pct ?? 5))}</td>
                          <td className="py-1 px-3 text-center"><Badge variant="gray">{mapDataQuality((src.data_quality as string) || "").cls}</Badge></td>
                        </tr>
                      ))}

                      {/* 2.2 MB */}
                      <tr
                        className="border-b border-gray-100 cursor-pointer hover:bg-gray-50"
                        onClick={() => toggleRow("2.2")}
                      >
                        <td className="py-1.5 px-3 pl-8 text-gray-500 text-xs">2.2</td>
                        <td className="py-1.5 px-3 pl-8 text-gray-700">
                          <span className="text-gray-400 mr-1 text-xs">{expandedRows["2.2"] ? "▼" : "▶"}</span>
                          Elettricità importata — Market-based (MB)
                        </td>
                        <td className="py-1.5 px-3"></td>
                        <td className="py-1.5 px-3 text-right text-gray-700">{fmt(s2MbTotal)}</td>
                        <td className="py-1.5 px-3 text-gray-400" colSpan={6}></td>
                        <td className="py-1.5 px-3 text-right text-gray-400">—</td>
                        <td className="py-1.5 px-3 text-center text-gray-400">—</td>
                      </tr>
                      {expandedRows["2.2"] && s2Sources.map((src, i) => (
                        <tr key={`mb-${i}`} className="border-b border-gray-50 bg-gray-50/50">
                          <td className="py-1 px-3 pl-14"></td>
                          <td className="py-1 px-3 pl-14 text-gray-500 text-xs">{src.source_label as string}</td>
                          <td className="py-1 px-3 text-xs text-gray-400">{src.contract_type as string}</td>
                          <td className="py-1 px-3 text-right text-xs text-gray-600">{fmt(Number(src.emissions_market_tco2e ?? 0))}</td>
                          <td className="py-1 px-3" colSpan={6}></td>
                          <td className="py-1 px-3 text-right text-xs text-gray-500">{fmtPct(Number(src.uncertainty_combined_pct ?? 5))}</td>
                          <td className="py-1 px-3 text-center text-gray-400">—</td>
                        </tr>
                      ))}

                      {/* 2.3 FV (if present) */}
                      {s2FvSources.length > 0 && (() => {
                        // Debug: log all FV/PV fields
                        console.log("[GHG View] FV/PV fields per source:", s2FvSources.map((s) => ({
                          source_label: s.source_label,
                          fv_production_kwh: s.fv_production_kwh,
                          fv_autoconsumato_kwh: s.fv_autoconsumato_kwh,
                          fv_immesso_kwh: s.fv_immesso_kwh,
                          fv_go_vendute: s.fv_go_vendute,
                          pv_generated_kwh: s.pv_generated_kwh,
                          pv_self_consumed_kwh: s.pv_self_consumed_kwh,
                          pv_fed_to_grid_kwh: s.pv_fed_to_grid_kwh,
                          fv_self_consumed: s.fv_self_consumed,
                        })));

                        // Use highest value as production, lowest as self-consumption
                        const totalProd = s2FvSources.reduce((sum, src) => {
                          const a = Number(src.fv_production_kwh ?? 0);
                          const b = Number(src.pv_generated_kwh ?? 0);
                          return sum + Math.max(a, b);
                        }, 0);
                        const totalSelfCons = s2FvSources.reduce((sum, src) => {
                          const a = Number(src.fv_autoconsumato_kwh ?? 0);
                          const b = Number(src.pv_self_consumed_kwh ?? 0);
                          const candidates = [a, b].filter((v) => v > 0);
                          return sum + (candidates.length > 0 ? Math.min(...candidates) : 0);
                        }, 0);
                        const totalFedGrid = s2FvSources.reduce((sum, src) => {
                          return sum + Number(src.fv_immesso_kwh ?? src.pv_fed_to_grid_kwh ?? 0);
                        }, 0);
                        const fvWarning = totalSelfCons > totalProd && totalProd > 0;

                        return (
                          <>
                            <tr className="border-b border-gray-100">
                              <td className="py-1.5 px-3 pl-8 text-gray-500 text-xs">2.3</td>
                              <td className="py-1.5 px-3 pl-8 text-gray-700">Autoproduzione fotovoltaica (FV)</td>
                              <td className="py-1.5 px-3 text-xs text-gray-400">Energia autoprodotta</td>
                              <td className="py-1.5 px-3 text-right text-gray-500 text-xs">
                                {fmt(totalProd)} kWh
                              </td>
                              <td className="py-1.5 px-3 text-gray-400 text-xs italic" colSpan={6}>
                                autocons. {fmt(totalSelfCons)} kWh{totalFedGrid > 0 && ` · immessi ${fmt(totalFedGrid)} kWh`}
                              </td>
                              <td className="py-1.5 px-3 text-gray-400">—</td>
                              <td className="py-1.5 px-3 text-gray-400">—</td>
                            </tr>
                            {fvWarning && (
                              <tr className="border-b border-gray-100">
                                <td className="py-1 px-3" colSpan={12}>
                                  <div className="bg-amber-50 border border-amber-300 text-amber-800 text-xs px-3 py-1.5 rounded">
                                    Verificare dati FV: autoconsumo ({fmt(totalSelfCons)} kWh) non può superare produzione ({fmt(totalProd)} kWh)
                                  </div>
                                </td>
                              </tr>
                            )}
                          </>
                        );
                      })()}
                    </>
                  ) : (
                    <tr className="border-b border-gray-200">
                      <td className="py-1.5 px-3"></td>
                      <td className="py-1.5 px-3 text-gray-500 italic text-xs" colSpan={11}>
                        Dettaglio sorgenti non disponibile — LB: {fmt(s2lb)}, MB: {fmt(s2mb)} tCO₂e
                      </td>
                    </tr>
                  )}

                  {/* ── Cat. 3-6 ── */}
                  {[
                    { n: 3, label: "Cat. 3: Emissioni indirette dal trasporto", status: cat3Status },
                    { n: 4, label: "Cat. 4: Emissioni indirette da prodotti utilizzati", status: cat4Status },
                    { n: 5, label: "Cat. 5: Emissioni indirette dall'uso di prodotti", status: cat5Status },
                    { n: 6, label: "Cat. 6: Emissioni indirette da altre fonti", status: cat6Status },
                  ].map((cat) => (
                    <tr key={cat.n} className="border-b border-gray-100 text-[#6FCF97] opacity-60 italic">
                      <td className="py-1.5 px-3">{cat.n}</td>
                      <td className="py-1.5 px-3">{cat.label}</td>
                      <td className="py-1.5 px-3 text-xs">{cat.status}</td>
                      <td className="py-1.5 px-3 text-right">—</td>
                      <td className="py-1.5 px-3" colSpan={6}></td>
                      <td className="py-1.5 px-3 text-right">—</td>
                      <td className="py-1.5 px-3 text-center">—</td>
                    </tr>
                  ))}

                  {/* ── TOTALE GENERALE ── */}
                  <tr className="font-bold text-white" style={{ backgroundColor: C.darkSurface }}>
                    <td className="py-2.5 px-3"></td>
                    <td className="py-2.5 px-3">TOTALE INVENTARIO GHG</td>
                    <td className="py-2.5 px-3"></td>
                    <td className="py-2.5 px-3 text-right">{fmt(grandTotal)}</td>
                    <td className="py-2.5 px-3 text-right" title="Cat.1 CO₂ + Scope 2 tCO₂e">{fmt(cat1GasTotals.co2 + s2LbTotal)}</td>
                    <td className="py-2.5 px-3 text-right text-xs">{fmtGas(cat1GasTotals.ch4)}</td>
                    <td className="py-2.5 px-3 text-right text-xs">{fmtGas(cat1GasTotals.n2o)}</td>
                    <td className="py-2.5 px-2 text-right text-xs">{fmtGas(cat1GasTotals.hfc)}</td>
                    <td className="py-2.5 px-2 text-right text-xs">—</td>
                    <td className="py-2.5 px-2 text-right text-xs">—</td>
                    <td className="py-2.5 px-3 text-right">{fmtPct(combinedUncertainty)}</td>
                    <td className="py-2.5 px-3 text-center">—</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="text-xs text-gray-500 italic mt-2">
              † Per Cat. 2 (energia elettrica importata) i fattori di emissione ISPRA/AIB sono già espressi come tCO₂e
              aggregati e non disaggregati per singolo gas. Le emissioni Scope 2 sono composte prevalentemente da CO₂;
              la quota CH₄, N₂O e altri GHG è inclusa nel valore tCO₂e del fattore di emissione come da metodologia IPCC
              (§App.E norma ISO 14064-1). La disaggregazione per singolo gas è applicabile e richiesta dalla norma solo per
              Cat. 1 (emissioni dirette).
            </p>
          </div>

          {/* ─── 4B) APPROCCIO DI QUANTIFICAZIONE (§6.2) ─── */}
          <div>
            <p className="text-sm font-semibold text-gray-700 mb-2">Approccio di quantificazione (§6.2)</p>
            <div className="space-y-2">

              {/* ── Cat 1 accordion (open by default) ── */}
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <button
                  type="button"
                  className="w-full flex items-center justify-between px-4 py-2.5 text-left bg-gray-50 hover:bg-gray-100 text-sm font-medium"
                  onClick={() => setExpandedAccordion(expandedAccordion === "quant-1" ? null : "quant-1")}
                >
                  <span>Categoria 1 — Metodo di quantificazione (§6.2.3)</span>
                  <span className="text-gray-400 text-xs">{expandedAccordion === "quant-1" ? "▲" : "▼"}</span>
                </button>
                {expandedAccordion === "quant-1" && (
                  <div className="px-4 py-3 text-sm text-gray-600 space-y-4">
                    <div className="bg-gray-50 rounded-lg p-3 text-sm">
                      <p className="mb-2">
                        Le emissioni dirette (Cat. 1) sono state quantificate applicando il metodo dei fattori di emissione (§6.2.3):
                      </p>
                      <p className="font-mono text-xs bg-white border border-gray-200 rounded px-3 py-1.5 inline-block mb-2">
                        Emissioni (tCO₂e) = Dato attività × Fattore di emissione × GWP
                      </p>
                      <p>
                        I fattori di emissione sono tratti da <strong>{gwpSource}</strong>.
                        I valori GWP fanno riferimento a {gwpSource}, orizzonte temporale 100 anni (§6.3).
                      </p>
                    </div>

                    {s1Sources.length > 0 && (
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs border border-gray-200 rounded-lg overflow-hidden whitespace-nowrap">
                          <thead>
                            <tr style={{ backgroundColor: C.darkBase }}>
                              <th className="py-2 px-2 text-left text-white font-medium">Sorgente</th>
                              <th className="py-2 px-2 text-center text-white font-medium">Sottocat.</th>
                              <th className="py-2 px-2 text-right text-white font-medium">Dato attività</th>
                              <th className="py-2 px-2 text-center text-white font-medium">Tipo dato</th>
                              <th className="py-2 px-2 text-right text-white font-medium">FE</th>
                              <th className="py-2 px-2 text-left text-white font-medium">Unità FE</th>
                              <th className="py-2 px-2 text-left text-white font-medium">Rif. FE</th>
                              <th className="py-2 px-2 text-left text-white font-medium">GWP source</th>
                              <th className="py-2 px-2 text-right text-white font-medium">tCO₂e</th>
                              <th className="py-2 px-2 text-right text-white font-medium">Incert. %</th>
                            </tr>
                          </thead>
                          <tbody>
                            {s1Sources.map((src, i) => {
                              const dq = mapDataQuality((src.data_quality as string) || "");
                              const dqColors: Record<string, string> = {
                                A: "bg-green-100 text-green-800",
                                B: "bg-sky-100 text-sky-800",
                                C: "bg-yellow-100 text-yellow-800",
                                D: "bg-orange-100 text-orange-800",
                              };
                              const unit = (src.activity_unit as string) || "";
                              const feUnit = `tCO₂e/${unit || "unità"}`;
                              const isoSub = classifySource(src);
                              return (
                                <tr key={i} className="border-b border-gray-100">
                                  <td className="py-1.5 px-2">{src.source_label as string}</td>
                                  <td className="py-1.5 px-2 text-center font-mono text-gray-500">{isoSub}</td>
                                  <td className="py-1.5 px-2 text-right">{fmt(Number(src.activity_value ?? 0))} {unit}</td>
                                  <td className="py-1.5 px-2 text-center">
                                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${dqColors[dq.cls] || dqColors.D}`}>{dq.cls}</span>
                                  </td>
                                  <td className="py-1.5 px-2 text-right font-mono">{fmtFe(Number(src.fe_value ?? 0))}</td>
                                  <td className="py-1.5 px-2 font-mono text-gray-500">{feUnit}</td>
                                  <td className="py-1.5 px-2 text-gray-500">{(src.ef_reference as string) || (src.fe_source_ref as string) || "—"}</td>
                                  <td className="py-1.5 px-2 text-gray-500">{(src.gwp_source as string) || gwpSource}</td>
                                  <td className="py-1.5 px-2 text-right font-medium">{fmt(Number(src.emissions_tco2e ?? 0))}</td>
                                  <td className="py-1.5 px-2 text-right">{fmtPct(Number(src.uncertainty_combined_pct ?? 10))}</td>
                                </tr>
                              );
                            })}
                            <tr className="font-semibold bg-gray-100 border-t border-gray-300">
                              <td className="py-2 px-2">TOTALE Cat. 1</td>
                              <td className="py-2 px-2"></td>
                              <td className="py-2 px-2"></td>
                              <td className="py-2 px-2"></td>
                              <td className="py-2 px-2"></td>
                              <td className="py-2 px-2"></td>
                              <td className="py-2 px-2"></td>
                              <td className="py-2 px-2"></td>
                              <td className="py-2 px-2 text-right">{fmt(s1Total)}</td>
                              <td className="py-2 px-2 text-right">{fmtPct(s1WeightedUnc)}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    )}

                    <p className="text-xs text-gray-500 italic">
                      Livello di quantificazione: Tier 1 IPCC (fattori di emissione predefiniti).
                      I dati di attività sono stati raccolti da fatture, contatori e registri aziendali.
                      Le esclusioni di sorgenti non significative sono documentate al §5.1 (Capitolo 3).
                    </p>
                  </div>
                )}
              </div>

              {/* ── Cat 2 accordion ── */}
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <button
                  type="button"
                  className="w-full flex items-center justify-between px-4 py-2.5 text-left bg-gray-50 hover:bg-gray-100 text-sm font-medium"
                  onClick={() => setExpandedAccordion(expandedAccordion === "quant-2" ? null : "quant-2")}
                >
                  <span>Categoria 2 — Metodo di quantificazione (App. E)</span>
                  <span className="text-gray-400 text-xs">{expandedAccordion === "quant-2" ? "▲" : "▼"}</span>
                </button>
                {expandedAccordion === "quant-2" && (
                  <div className="px-4 py-3 text-sm text-gray-600 space-y-4">
                    <div className="bg-gray-50 rounded-lg p-3 text-sm space-y-2">
                      <p>
                        Le emissioni indirette da energia importata (Cat. 2) sono state quantificate applicando
                        due approcci in conformità all&apos;Appendice E della norma:
                      </p>
                      <p>
                        <strong>Approccio location-based (LB):</strong> applicato il fattore di emissione medio della
                        rete elettrica nazionale
                        {s2Sources.length > 0 && (() => {
                          const s = s2Sources[0];
                          const eff = s.fe_custom_value != null ? Number(s.fe_custom_value) : Number(s.fe_location_value ?? 0);
                          return ` (${fmtFe(eff)} tCO₂e/kWh${s.fe_custom_value != null ? " — personalizzato" : ""})`;
                        })()}
                        {" "}(§E.2.1).
                      </p>
                      <p>
                        <strong>Approccio market-based (MB):</strong> applicato il fattore basato sulla tipologia contrattuale
                        {s2Sources.length > 0 && ` (${Array.from(new Set(s2Sources.map((s) => s.contract_type as string))).join(", ")})`}
                        {" "}(§E.2.2).
                      </p>
                      <p>Il valore rendicontato come principale è il location-based (LB) in conformità al §E.2.1.</p>
                    </div>

                    {s2Sources.length > 0 && (
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs border border-gray-200 rounded-lg overflow-hidden whitespace-nowrap">
                          <thead>
                            <tr style={{ backgroundColor: C.darkBase }}>
                              <th className="py-2 px-2 text-left text-white font-medium">Fornitore/sorgente</th>
                              <th className="py-2 px-2 text-right text-white font-medium">Consumo kWh</th>
                              <th className="py-2 px-2 text-right text-white font-medium">FE LB</th>
                              <th className="py-2 px-2 text-right text-white font-medium">FE MB</th>
                              <th className="py-2 px-2 text-left text-white font-medium">Contratto</th>
                              <th className="py-2 px-2 text-left text-white font-medium">Fonte FE</th>
                              <th className="py-2 px-2 text-right text-white font-medium">LB tCO₂e</th>
                              <th className="py-2 px-2 text-right text-white font-medium">MB tCO₂e</th>
                              <th className="py-2 px-2 text-right text-white font-medium">Incert. %</th>
                            </tr>
                          </thead>
                          <tbody>
                            {s2Sources.map((src, i) => {
                              const ct = ((src.contract_type as string) || "").toLowerCase();
                              const hasMarket = ct === "go" || ct === "ppa" || ct === "garanzia_origine" || (ct !== "" && ct !== "standard" && ct !== "maggior_tutela");
                              // Effective FE: use fe_custom_value if present, fallback to fe_location_value
                              const feCustom = src.fe_custom_value != null ? Number(src.fe_custom_value) : null;
                              const feLocation = Number(src.fe_location_value ?? 0);
                              const effectiveFeLb = feCustom ?? feLocation;
                              const feSource = (src.fe_location_source as string) || (src.fe_custom_source_ref as string) || "";
                              const isCustomFe = feCustom != null;
                              const feWarning = effectiveFeLb > 0.001;
                              // Debug
                              console.log(`[S2 FE] ${src.source_label}: fe_location_value=${src.fe_location_value}, fe_custom_value=${src.fe_custom_value}, effective=${effectiveFeLb}, fe_market_value=${src.fe_market_value}`);
                              return (
                                <Fragment key={i}>
                                  <tr className="border-b border-gray-100">
                                    <td className="py-1.5 px-2">{src.source_label as string}</td>
                                    <td className="py-1.5 px-2 text-right">{fmt(Number(src.activity_value_kwh ?? 0))}</td>
                                    <td className={`py-1.5 px-2 text-right font-mono ${!hasMarket ? "font-semibold" : "text-gray-400"}`}>
                                      {fmtFe(effectiveFeLb)}
                                      {isCustomFe && <span className="text-[9px] text-amber-600 ml-0.5">*</span>}
                                    </td>
                                    <td className={`py-1.5 px-2 text-right font-mono ${hasMarket ? "font-semibold" : "text-gray-400"}`}>{fmtFe(Number(src.fe_market_value ?? 0))}</td>
                                    <td className="py-1.5 px-2 text-gray-500">{src.contract_type as string}</td>
                                    <td className="py-1.5 px-2 text-gray-500 text-[10px]">
                                      {isCustomFe
                                        ? (feSource || "Inserito dall'utente")
                                        : hasMarket
                                          ? `Market-based (${ct})`
                                          : (feSource || "Location-based (ISPRA)")}
                                    </td>
                                    <td className="py-1.5 px-2 text-right font-medium">{fmt(Number(src.emissions_location_tco2e ?? 0))}</td>
                                    <td className="py-1.5 px-2 text-right font-medium">{fmt(Number(src.emissions_market_tco2e ?? 0))}</td>
                                    <td className="py-1.5 px-2 text-right">{fmtPct(Number(src.uncertainty_combined_pct ?? 5))}</td>
                                  </tr>
                                  {feWarning && (
                                    <tr className="border-b border-gray-100">
                                      <td colSpan={9} className="py-1 px-2">
                                        <span className="text-[10px] text-amber-700 bg-amber-50 px-2 py-0.5 rounded">
                                          Il FE location-based per {src.source_label as string} ({fmtFe(effectiveFeLb)}) sembra in kgCO₂e/kWh — verificare coerenza emissioni calcolate
                                        </span>
                                      </td>
                                    </tr>
                                  )}
                                </Fragment>
                              );
                            })}
                            <tr className="font-semibold bg-gray-100 border-t border-gray-300">
                              <td className="py-2 px-2">TOTALE Cat. 2</td>
                              <td className="py-2 px-2 text-right">{fmt(s2Sources.reduce((s, src) => s + Number(src.activity_value_kwh ?? 0), 0))}</td>
                              <td className="py-2 px-2"></td>
                              <td className="py-2 px-2"></td>
                              <td className="py-2 px-2"></td>
                              <td className="py-2 px-2"></td>
                              <td className="py-2 px-2 text-right">{fmt(s2LbTotal)}</td>
                              <td className="py-2 px-2 text-right">{fmt(s2MbTotal)}</td>
                              <td className="py-2 px-2 text-right">{fmtPct(s2WeightedUnc)}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    )}

                    {/* FV section */}
                    {s2FvSources.length > 0 && (
                      <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm space-y-1">
                        <p className="font-semibold text-green-900">Autoproduzione fotovoltaica</p>
                        {s2FvSources.map((src, i) => {
                          const prod = Math.max(Number(src.fv_production_kwh ?? 0), Number(src.pv_generated_kwh ?? 0));
                          const selfCons = Math.min(
                            ...[Number(src.fv_autoconsumato_kwh ?? 0), Number(src.pv_self_consumed_kwh ?? 0)].filter((v) => v > 0).concat([prod])
                          );
                          const fedGrid = Number(src.fv_immesso_kwh ?? src.pv_fed_to_grid_kwh ?? 0);
                          const goVendute = src.fv_go_vendute === true;
                          const autoConsumoPct = prod > 0 ? fmt(selfCons / prod * 100) : "0";
                          return (
                            <div key={i} className="text-green-800 text-xs space-y-0.5">
                              {s2FvSources.length > 1 && <p className="font-medium">{src.source_label as string}:</p>}
                              <p>Energia prodotta: {fmt(prod)} kWh</p>
                              <p>Autoconsumo: {fmt(selfCons)} kWh ({autoConsumoPct}% della produzione)</p>
                              {fedGrid > 0 && <p>Immessa in rete: {fmt(fedGrid)} kWh</p>}
                              {goVendute && <p>GO vendute: Sì</p>}
                            </div>
                          );
                        })}
                        <p className="text-xs text-green-700 italic mt-1">
                          Le emissioni dirette associate all&apos;impianto FV sono incluse in Cat. 1 se applicabile (§E.3).
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>

            </div>

            {/* Documentation note */}
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 mt-3 space-y-2">
              <p className="text-xs text-gray-500">
                I fattori di emissione location-based sono aggiornati annualmente da ISPRA. Il valore mostrato corrisponde
                al fattore utilizzato nel calcolo. Per il confronto con anni precedenti verificare la serie storica ISPRA.
              </p>
              <p className="text-xs text-gray-500">
                La documentazione completa dei fattori di emissione e dei dati di attività è conservata nel sistema
                Enworia ai sensi del §8.2 della norma (conservazione documenti).
                Il registro completo è disponibile come allegato tecnico nel pacchetto verifica (Documento D2).
              </p>
            </div>
          </div>

          {/* ─── 4C) VALUTAZIONE DELL'INCERTEZZA ─── */}
          <div>
            <p className="text-sm font-semibold text-gray-700 mb-2">Valutazione dell&apos;incertezza (§8.3)</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
                <thead>
                  <tr style={{ backgroundColor: C.darkBase }}>
                    <th className="py-2 px-3 text-left text-xs text-white font-medium">Categoria</th>
                    <th className="py-2 px-3 text-right text-xs text-white font-medium">Incertezza combinata %</th>
                    <th className="py-2 px-3 text-center text-xs text-white font-medium">Classe qualità dato</th>
                    <th className="py-2 px-3 text-center text-xs text-white font-medium">Semaforo</th>
                    <th className="py-2 px-3 text-left text-xs text-white font-medium">Metodo valutazione</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-gray-100">
                    <td className="py-2 px-3 font-medium">Cat. 1 — Emissioni dirette</td>
                    <td className="py-2 px-3 text-right">{fmtPct(s1WeightedUnc)}</td>
                    <td className="py-2 px-3 text-center">{s1QualityMode.label}</td>
                    <td className="py-2 px-3 text-center">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${sem(s1WeightedUnc).color}`}>
                        {sem(s1WeightedUnc).emoji} {sem(s1WeightedUnc).text}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-xs text-gray-500">Media ponderata per peso emissivo</td>
                  </tr>
                  <tr className="border-b border-gray-100">
                    <td className="py-2 px-3 font-medium">Cat. 2 — Energia importata</td>
                    <td className="py-2 px-3 text-right">{fmtPct(s2WeightedUnc)}</td>
                    <td className="py-2 px-3 text-center">{s2QualityMode.label}</td>
                    <td className="py-2 px-3 text-center">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${sem(s2WeightedUnc).color}`}>
                        {sem(s2WeightedUnc).emoji} {sem(s2WeightedUnc).text}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-xs text-gray-500">Media ponderata per peso emissivo</td>
                  </tr>
                  <tr className="bg-gray-100 font-semibold">
                    <td className="py-2 px-3">TOTALE INVENTARIO</td>
                    <td className="py-2 px-3 text-right">{fmtPct(combinedUncertainty)}</td>
                    <td className="py-2 px-3 text-center">—</td>
                    <td className="py-2 px-3 text-center">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${sem(combinedUncertainty).color}`}>
                        {sem(combinedUncertainty).emoji} {sem(combinedUncertainty).text}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-xs text-gray-500">Combinazione quadratica (√Σ(Em×Unc)²/Tot)</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="text-xs text-gray-500 italic mt-2">
              La valutazione dell&apos;incertezza è stata condotta in conformità al §8.3 della norma UNI EN ISO 14064-1:2019.
              Per la valutazione quantitativa è applicabile la metodologia ISO/IEC Guide 98-3.
            </p>

            {/* Mini uncertainty profile per source */}
            {(s1Sources.length > 0 || s2Sources.length > 0) && (
              <div className="mt-4">
                <p className="text-xs font-semibold text-gray-700 mb-2">Profilo incertezza per sorgente</p>
                <div className="space-y-1">
                  {[...s1Sources, ...s2Sources].map((src, i) => {
                    const unc = Number(src.uncertainty_combined_pct ?? 10);
                    const label = (src.source_label as string) || "—";
                    const barColor = unc < 10 ? "#27AE60" : unc <= 30 ? "#C8860A" : "#C0392B";
                    const widthPct = Math.min(unc, 100);
                    return (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        <span className="w-28 truncate text-gray-600" title={label}>{label}</span>
                        <div className="flex-1 bg-gray-100 rounded-full h-3 relative overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{ width: `${widthPct}%`, backgroundColor: barColor }}
                          />
                        </div>
                        <span className="w-12 text-right text-gray-500">{fmtPct(unc)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* ─── GRAFICI ─── */}
          <div className="space-y-4 print:hidden">

            {/* GRAFICO 0 — 3 metric cards */}
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg p-3 text-center" style={{ backgroundColor: C.lightBg }}>
                <p className="text-[22px] font-medium" style={{ color: C.accent }}>{fmt(grandTotal)}</p>
                <p className="text-[11px] text-gray-500">tCO₂e inventario totale</p>
              </div>
              <div className="rounded-lg p-3 text-center" style={{ backgroundColor: C.lightBg }}>
                <p className="text-[22px] font-medium" style={{ color: grandTotal > 0 && (s2lb / grandTotal) > 0.5 ? C.warning : C.accent }}>
                  {grandTotal > 0 ? fmt((s2lb / grandTotal) * 100) : "0"}%
                </p>
                <p className="text-[11px] text-gray-500">Scope 2 sul totale</p>
              </div>
              <div className="rounded-lg p-3 text-center" style={{ backgroundColor: C.lightBg }}>
                <p className="text-[22px] font-medium" style={{ color: C.accent }}>{fmtPct(combinedUncertainty)}</p>
                <p className="text-[11px] text-gray-500">Incertezza combinata</p>
              </div>
            </div>

            {/* GRAFICO 1 — Inventario per categoria ISO */}
            {(() => {
              const catData = [
                { name: "Cat. 1\nDirette", value: s1Total, fill: C.ghg1, errorY: s1Total * s1WeightedUnc / 100 },
                { name: "Cat. 2\nEnergia", value: s2lb, fill: C.ghg2, errorY: s2lb * s2WeightedUnc / 100 },
                { name: "Cat. 3\nTrasporti", value: 0, fill: C.ghgNs, errorY: 0 },
                { name: "Cat. 4\nProdotti", value: 0, fill: C.ghgNs, errorY: 0 },
                { name: "Cat. 5\nUso prod.", value: 0, fill: C.ghgNs, errorY: 0 },
                { name: "Cat. 6\nAltro", value: 0, fill: C.ghgNs, errorY: 0 },
              ];
              return (
                <div className="bg-white border border-[#E2EAE8] rounded-xl p-5">
                  <p className="text-[13px] font-medium text-gray-800">Inventario GHG per categoria ISO 14064-1</p>
                  <p className="text-xs text-gray-500 mb-1">Cat. 3–6 in grigio — non rendicontate in questa fase</p>
                  <div className="flex items-center gap-4 mb-2 text-[11px]">
                    <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: C.ghg1 }} /> Cat. 1-2 Rendicontate</span>
                    <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: C.ghgNs }} /> Cat. 3-6 Non rendicontate</span>
                  </div>
                  <div style={{ height: 240 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={catData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#E2EAE8" />
                        <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} />
                        <YAxis tick={{ fontSize: 11 }} label={{ value: "tCO₂e", angle: -90, position: "insideLeft", style: { fontSize: 11 } }} />
                        <Tooltip formatter={tooltipFmt} />
                        <Bar dataKey="value" isAnimationActive={false} radius={[6, 6, 0, 0]}>
                          <ErrorBar dataKey="errorY" width={8} strokeWidth={2} stroke={C.warning} />
                          {catData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              );
            })()}

            {/* GRAFICI 2+3 affiancati */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

              {/* GRAFICO 2 — Composizione Scope 1 (donut) */}
              <div className="bg-white border border-[#E2EAE8] rounded-xl p-5">
                <p className="text-[13px] font-medium text-gray-800">Composizione Scope 1</p>
                <p className="text-xs text-gray-500 mb-1">Sottocategorie §B.2 norma</p>
                {(() => {
                  const donutData = pieData.filter((d) => d.name.startsWith("1."));
                  if (donutData.length === 0 && s1Total > 0) {
                    donutData.push({ name: "Scope 1", value: s1Total, fill: C.ghg1 });
                  }
                  const donutTotal = donutData.reduce((s, d) => s + d.value, 0);
                  return (
                    <>
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 mb-1 text-[11px]">
                        {donutData.map((d) => (
                          <span key={d.name} className="flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: d.fill }} />
                            {d.name} {donutTotal > 0 ? `${fmt((d.value / donutTotal) * 100)}%` : ""}
                          </span>
                        ))}
                      </div>
                      <div style={{ height: 200 }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie data={donutData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={80} isAnimationActive={false} stroke="#fff" strokeWidth={2}>
                              {donutData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                            </Pie>
                            <Tooltip formatter={tooltipFmt} />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                    </>
                  );
                })()}
              </div>

              {/* GRAFICO 3 — Scope 2 LB vs MB */}
              <div className="bg-white border border-[#E2EAE8] rounded-xl p-5">
                <p className="text-[13px] font-medium text-gray-800">Scope 2 — Location vs Market based</p>
                <p className="text-xs text-gray-500 mb-1">Approccio duale §App.E norma</p>
                <div className="flex items-center gap-4 mb-1 text-[11px]">
                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: C.ghg1 }} /> Location-based</span>
                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: C.ghg2 }} /> Market-based</span>
                </div>
                <div style={{ height: 160 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={[{ name: "Elettricità importata", lb: s2lb, mb: s2mb }]}
                      layout="vertical"
                      margin={{ left: 0, right: 10 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#E2EAE8" />
                      <XAxis type="number" tick={{ fontSize: 11 }} />
                      <YAxis dataKey="name" type="category" width={0} tick={false} />
                      <Tooltip formatter={tooltipFmt} />
                      <Bar dataKey="lb" name="Location-based" fill={C.ghg1} isAnimationActive={false} radius={[0, 6, 6, 0]} />
                      <Bar dataKey="mb" name="Market-based" fill={C.ghg2} isAnimationActive={false} radius={[0, 6, 6, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <p className="text-[11px] text-gray-500 mt-1">
                  {s2mb < s2lb
                    ? "MB inferiore: presenza strumenti contrattuali o FER"
                    : s2mb > s2lb
                      ? "MB superiore: verificare contratto energetico"
                      : "LB e MB coincidenti"}
                </p>
              </div>
            </div>

            {/* GRAFICO 4 — Emissioni per fonte Scope 1 */}
            {sourceBarData.length >= 1 && (() => {
              const qualityOpacity: Record<string, number> = { A: 1.0, B: 0.8, C: 0.55, D: 0.55 };
              const coloredSourceData = s1Sources.map((src) => {
                const iso = classifySource(src);
                const colorMap: Record<string, string> = { "1.1": C.ghg1, "1.2": C.ghg2, "1.3": C.ghg3, "1.4": C.warning };
                const q = mapDataQuality((src.data_quality as string) || "").cls;
                return {
                  name: (src.source_label as string) || "—",
                  value: Number(src.emissions_tco2e ?? 0),
                  fill: colorMap[iso] || C.ghg1,
                  quality: q,
                  unc: Number(src.uncertainty_combined_pct ?? 10),
                  opacity: qualityOpacity[q] ?? 0.8,
                };
              }).sort((a, b) => b.value - a.value);

              return (
                <div className="bg-white border border-[#E2EAE8] rounded-xl p-5">
                  <p className="text-[13px] font-medium text-gray-800">Emissioni per fonte — Scope 1</p>
                  <p className="text-xs text-gray-500 mb-1">Dettaglio sorgenti con classe qualità dato</p>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 mb-2 text-[11px]">
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: C.ghg1 }} /> Stazionaria</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: C.ghg2 }} /> Mobile</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: C.warning }} /> Fuggitive</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: C.ghg3 }} /> Processi</span>
                  </div>
                  <div style={{ height: Math.max(160, coloredSourceData.length * 40) }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={coloredSourceData} margin={{ left: 10, right: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#E2EAE8" />
                        <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={50} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip
                          // eslint-disable-next-line @typescript-eslint/no-explicit-any
                          formatter={(v: any, _name: any, props: any) => [
                            `${fmt(Number(v))} tCO₂e | Qualità: ${props?.payload?.quality ?? "—"} | Incert.: ${fmtPct(props?.payload?.unc)}`,
                            "Emissioni",
                          ]}
                        />
                        <Bar dataKey="value" name="tCO₂e" isAnimationActive={false} radius={[6, 6, 0, 0]}>
                          {coloredSourceData.map((d, i) => <Cell key={i} fill={d.fill} fillOpacity={d.opacity} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              );
            })()}

          </div>

        </div>
      </Chapter>

      {/* ═══════════ INDICATORI DI INTENSITÀ GHG (§9.3.2g) ═══════════ */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden print:break-inside-avoid">
        <div className="flex items-center justify-between px-5 py-3" style={{ backgroundColor: C.darkBase }}>
          <h2 className="text-white font-semibold text-sm">Indicatori di intensità GHG (§9.3.2)</h2>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#2A3D39] text-[#A8C5BE]">Informazioni raccomandate</span>
        </div>
        <div className="px-5 py-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

            {/* Card 1 — Intensità economica */}
            <div className={`border rounded-lg p-4 text-center ${intensitaFatturato !== null ? "border-[#27AE60]/30" : "border-gray-200 bg-gray-50"}`}>
              <p className="text-2xl font-bold" style={{ color: intensitaFatturato !== null ? C.accent : "#D1D5DB" }}>
                {intensitaFatturato !== null ? fmt(intensitaFatturato) : "N.D."}
              </p>
              <p className="text-xs text-gray-500 mt-1">tCO₂e / M€ fatturato</p>
            </div>

            {/* Card 2 — Intensità occupazionale */}
            <div className={`border rounded-lg p-4 text-center ${intensitaDipendenti !== null ? "border-[#27AE60]/30" : "border-gray-200 bg-gray-50"}`}>
              <p className="text-2xl font-bold" style={{ color: intensitaDipendenti !== null ? C.accent : "#D1D5DB" }}>
                {intensitaDipendenti !== null ? fmt(intensitaDipendenti) : "N.D."}
              </p>
              <p className="text-xs text-gray-500 mt-1">tCO₂e / dipendente</p>
            </div>

            {/* Card 3 — Intensità energetica */}
            <div className={`border rounded-lg p-4 text-center ${intensitaEnergia !== null ? "border-[#27AE60]/30" : "border-gray-200 bg-gray-50"}`}>
              <p className="text-2xl font-bold" style={{ color: intensitaEnergia !== null ? C.accent : "#D1D5DB" }}>
                {intensitaEnergia !== null ? fmt(intensitaEnergia) : "N.D."}
              </p>
              <p className="text-xs text-gray-500 mt-1">tCO₂e / MWh</p>
            </div>

          </div>

          <p className="text-xs text-gray-500 italic">
            Gli indicatori di intensità sono calcolati in conformità al §9.3.2g della norma UNI EN ISO 14064-1:2019.
            Consentono il confronto delle prestazioni climatiche indipendentemente dalle variazioni dimensionali dell&apos;organizzazione nel tempo.
          </p>
        </div>
      </div>

      {/* ═══════════ CAPITOLO 5 — Attività di mitigazione ═══════════ */}
      <Chapter number={5} title="Attività di mitigazione e opportunità di riduzione" isoRef="§7" id="cap5">
        {(() => {
          // ── Mitigation analysis logic ──
          const pctScope2 = grandTotal > 0 ? (s2lb / grandTotal) * 100 : 0;
          const stazTotal = s1Groups["1.1"].total;
          const mobileTotal = s1Groups["1.2"].total;
          const fuggTotal = s1Groups["1.4"].total;
          const pctStaz = grandTotal > 0 ? (stazTotal / grandTotal) * 100 : 0;
          const pctMobile = grandTotal > 0 ? (mobileTotal / grandTotal) * 100 : 0;
          const pctFugg = grandTotal > 0 ? (fuggTotal / grandTotal) * 100 : 0;

          const hasFv = s2Sources.some((s) => s.has_fv === true);
          const totalKwhS2 = s2Sources.reduce((sum, s) => sum + Number(s.activity_value_kwh ?? 0), 0);
          const totalSelfCons = s2Sources.reduce((sum, s) => sum + Number(s.fv_autoconsumato_kwh ?? s.pv_self_consumed_kwh ?? 0), 0);
          const fvAutoConsumoPct = totalKwhS2 > 0 ? (totalSelfCons / totalKwhS2) * 100 : 0;

          const hasGasSource = s1Groups["1.1"].sources.some((s) => {
            const label = ((s.source_label as string) || "").toLowerCase();
            const fuel = ((s.activity_data_type as string) || "").toLowerCase();
            return /gas|metano|natural_gas/.test(`${label} ${fuel}`);
          });

          type MitigArea = {
            id: string; icon: string; title: string; pct: number; emissions: number;
            text: string; actions: string[];
            reductionPct: number; reductionTco2e: number; horizon: string;
          };
          const areas: MitigArea[] = [];

          if (pctScope2 > 20) {
            const actions: string[] = [];
            if (!hasFv) {
              actions.push(`Installazione impianto fotovoltaico: potenziale riduzione stimata fino al ${fmt(pctScope2 * 0.4)}% delle emissioni totali (ipotesi: copertura 40% del fabbisogno con autoconsumo)`);
            }
            if (hasFv && fvAutoConsumoPct < 80) {
              actions.push(`Ottimizzazione autoconsumo FV: l'impianto esistente copre il ${fmt(fvAutoConsumoPct)}% del fabbisogno. Sistemi di accumulo o gestione dei carichi potrebbero aumentare l'autoconsumo e ridurre i prelievi dalla rete.`);
            }
            actions.push(`Acquisto energia da fonti rinnovabili certificate (GO): azzererebbe le emissioni Scope 2 market-based (${fmt(s2mb)} tCO₂e MB)`);
            const reduction = pctScope2 * 0.4 * grandTotal / 100;
            areas.push({
              id: "energia", icon: "⚡", title: "Energia elettrica importata", pct: pctScope2, emissions: s2lb,
              text: `L'energia elettrica importata rappresenta la principale fonte di emissioni indirette. Le emissioni Scope 2 (${fmt(s2lb)} tCO₂e LB) dipendono direttamente dal mix energetico della rete nazionale.`,
              actions, reductionPct: 40, reductionTco2e: reduction, horizon: "1-3 anni",
            });
          }

          if (pctStaz > 15) {
            const actions = [
              "Sostituzione caldaia con pompa di calore: riduzione potenziale 60-80% delle emissioni termiche",
              "Miglioramento isolamento termico edifici: riduzione consumi 20-40%",
            ];
            if (hasGasSource) {
              actions.push("Valutare sostituzione con biometano certificato per riduzione emissioni Scope 1 a breve termine");
            }
            areas.push({
              id: "termico", icon: "🔥", title: "Combustibili fossili — uso termico", pct: pctStaz, emissions: stazTotal,
              text: `La combustione di combustibili fossili per riscaldamento e usi termici genera ${fmt(stazTotal)} tCO₂e, pari al ${fmt(pctStaz)}% delle emissioni dirette totali.`,
              actions, reductionPct: 70, reductionTco2e: stazTotal * 0.7, horizon: "2-5 anni",
            });
          }

          if (pctMobile > 10) {
            areas.push({
              id: "mobile", icon: "🚗", title: "Parco veicoli", pct: pctMobile, emissions: mobileTotal,
              text: `Il parco veicoli aziendale contribuisce con ${fmt(mobileTotal)} tCO₂e (${fmt(pctMobile)}% del totale).`,
              actions: [
                "Elettrificazione graduale del parco veicoli: riduzione emissioni dirette Scope 1 per ogni veicolo sostituito",
                "Ottimizzazione percorsi e politiche di mobilità aziendale: riduzione potenziale 10-20%",
              ],
              reductionPct: 80, reductionTco2e: mobileTotal * 0.8, horizon: "3-7 anni",
            });
          }

          if (pctFugg > 5) {
            areas.push({
              id: "fuggitive", icon: "❄️", title: "Gas refrigeranti", pct: pctFugg, emissions: fuggTotal,
              text: `Le emissioni fuggitive da gas refrigeranti (${fmt(fuggTotal)} tCO₂e) hanno un elevato potenziale di riscaldamento globale (GWP).`,
              actions: [
                "Manutenzione preventiva impianti: riduce le perdite accidentali",
                "Sostituzione graduale con refrigeranti a basso GWP (es. R-32, R-290, R-744)",
              ],
              reductionPct: 50, reductionTco2e: fuggTotal * 0.5, horizon: "1-2 anni",
            });
          }

          // Sort by impact descending, limit to 4
          areas.sort((a, b) => b.pct - a.pct);
          const activeAreas = areas.slice(0, 4);
          const totalReduction = activeAreas.reduce((s, a) => s + a.reductionTco2e, 0);

          const impactColor = (pct: number) => {
            if (pct > 50) return { border: "border-l-red-500", badge: "bg-red-100 text-red-800" };
            if (pct > 30) return { border: "border-l-orange-400", badge: "bg-orange-100 text-orange-800" };
            return { border: "border-l-yellow-400", badge: "bg-yellow-100 text-yellow-800" };
          };

          return (
            <div className="space-y-5">
              {/* Manual initiatives (if any) */}
              {mitigationInitiatives.length > 0 && (
                <div>
                  <p className="text-sm font-semibold text-gray-700 mb-2">Iniziative dichiarate</p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
                      <thead>
                        <tr style={{ backgroundColor: C.darkBase }}>
                          <th className="py-2 px-3 text-left text-xs text-white font-medium">Iniziativa</th>
                          <th className="py-2 px-3 text-left text-xs text-white font-medium">Descrizione</th>
                          <th className="py-2 px-3 text-right text-xs text-white font-medium">Riduzione tCO₂e</th>
                        </tr>
                      </thead>
                      <tbody>
                        {mitigationInitiatives.map((init, i) => (
                          <tr key={i} className="border-b border-gray-100">
                            <td className="py-2 px-3 font-medium">{init.title}</td>
                            <td className="py-2 px-3 text-gray-600">{init.description}</td>
                            <td className="py-2 px-3 text-right">{fmt(init.reduction_tco2e)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* ── Auto-generated intervention areas ── */}
              <div>
                <p className="text-sm font-semibold text-gray-700 mb-3">Aree di intervento prioritarie (analisi automatica)</p>

                {activeAreas.length > 0 ? (
                  <div className="space-y-3">
                    {activeAreas.map((area) => {
                      const colors = impactColor(area.pct);
                      return (
                        <div key={area.id} className={`border border-gray-200 border-l-4 ${colors.border} rounded-lg overflow-hidden`}>
                          <div className="px-4 py-3">
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <span className="text-lg">{area.icon}</span>
                                <span className="text-sm font-semibold text-gray-800">{area.title}</span>
                              </div>
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${colors.badge}`}>
                                {fmt(area.pct)}% del totale
                              </span>
                            </div>
                            <p className="text-sm text-gray-600 mb-2">{area.text}</p>
                            <div className="space-y-1">
                              {area.actions.map((action, ai) => (
                                <p key={ai} className="text-sm" style={{ color: C.accentDark }}>
                                  → {action}
                                </p>
                              ))}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <p className="text-sm text-green-800">
                      Le emissioni dell&apos;organizzazione sono distribuite in modo equilibrato tra le categorie.
                      Non si identificano aree di intervento prioritario con impatto superiore al 10% del totale.
                    </p>
                  </div>
                )}
              </div>

              {/* ── Reduction potential table ── */}
              {activeAreas.length > 0 && (
                <div>
                  <p className="text-sm font-semibold text-gray-700 mb-2">Potenziale di riduzione stimato</p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
                      <thead>
                        <tr style={{ backgroundColor: C.darkBase }}>
                          <th className="py-2 px-3 text-left text-xs text-white font-medium">Area</th>
                          <th className="py-2 px-3 text-right text-xs text-white font-medium">Emissioni attuali tCO₂e</th>
                          <th className="py-2 px-3 text-right text-xs text-white font-medium">Riduzione pot. %</th>
                          <th className="py-2 px-3 text-right text-xs text-white font-medium">Riduzione stimata tCO₂e</th>
                          <th className="py-2 px-3 text-left text-xs text-white font-medium">Orizzonte</th>
                        </tr>
                      </thead>
                      <tbody>
                        {activeAreas.map((area) => (
                          <tr key={area.id} className="border-b border-gray-100">
                            <td className="py-2 px-3">{area.icon} {area.title}</td>
                            <td className="py-2 px-3 text-right">{fmt(area.emissions)}</td>
                            <td className="py-2 px-3 text-right">{area.reductionPct}%</td>
                            <td className="py-2 px-3 text-right font-medium">{fmt(area.reductionTco2e)}</td>
                            <td className="py-2 px-3 text-gray-500">{area.horizon}</td>
                          </tr>
                        ))}
                        <tr className="font-bold text-white" style={{ backgroundColor: C.darkSurface }}>
                          <td className="py-2 px-3">TOTALE POTENZIALE</td>
                          <td className="py-2 px-3 text-right">{fmt(grandTotal)}</td>
                          <td className="py-2 px-3 text-right">{grandTotal > 0 ? fmt(totalReduction / grandTotal * 100) : 0}%</td>
                          <td className="py-2 px-3 text-right">{fmt(totalReduction)}</td>
                          <td className="py-2 px-3"></td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  <p className="text-xs text-gray-400 italic mt-2">
                    Le stime di riduzione sono indicative e basate su benchmark di settore.
                    Non costituiscono impegni formali ai sensi del §7.3 della norma UNI EN ISO 14064-1:2019.
                    Per obiettivi formali di riduzione verificabili, fare riferimento al §7.3 della norma.
                  </p>
                </div>
              )}

              {/* ── Reference year comparison ── */}
              <div>
                <p className="text-sm font-semibold text-gray-700 mb-1">Confronto con anno di riferimento (§9.3.2j)</p>
                {referenceYear === year ? (
                  <p className="text-sm text-gray-500 italic">
                    Prima annualità di inventario — nessun confronto disponibile.
                  </p>
                ) : (
                  <p className="text-sm text-gray-500 italic">
                    Confronto con anno base {referenceYear} — da implementare nella fase successiva.
                  </p>
                )}
              </div>

              <p className="text-xs text-gray-400 italic border-t border-gray-100 pt-3">
                Sezione redatta in conformità al §7.1 e §9.3.2b della norma UNI EN ISO 14064-1:2019 — Informazioni raccomandate.
              </p>
            </div>
          );
        })()}
      </Chapter>

      {/* ═══════════ FOOTER — Dichiarazioni obbligatorie ISO ═══════════ */}
      <div className="rounded-lg overflow-hidden print:break-inside-avoid" style={{ backgroundColor: C.darkBase }}>
        <div className="px-6 py-5 space-y-4">
          <h3 className="text-white font-semibold text-sm mb-3">Dichiarazioni obbligatorie — UNI EN ISO 14064-1:2019</h3>

          {/* §9.3.1r */}
          <div className="text-gray-300 text-sm">
            <p className="text-gray-500 text-[10px] font-mono mb-0.5">§9.3.1r</p>
            <p>
              Il presente rapporto è stato preparato in conformità alla norma UNI EN ISO 14064-1:2019
              (Gas ad effetto serra — Parte 1: Specifiche e guida, al livello dell&apos;organizzazione,
              per la quantificazione e la rendicontazione delle emissioni di gas ad effetto serra e della loro rimozione).
            </p>
          </div>

          <div className="border-t border-[#2A3D39]" />

          {/* §9.3.1s */}
          <div className="text-gray-300 text-sm">
            <p className="text-gray-500 text-[10px] font-mono mb-0.5">§9.3.1s</p>
            <p>
              Stato verifica: {verificationStatus}.{" "}
              {verificationStatus.toLowerCase().includes("non") || !verificationBody ? (
                <>L&apos;inventario GHG non è stato sottoposto a verifica indipendente di terza parte per il presente periodo di rendicontazione.</>
              ) : (
                <>Verifica condotta da: {verificationBody}.</>
              )}
            </p>
          </div>

          <div className="border-t border-[#2A3D39]" />

          {/* §9.3.1t */}
          <div className="text-gray-300 text-sm">
            <p className="text-gray-500 text-[10px] font-mono mb-0.5">§9.3.1t</p>
            <p>
              Valori GWP utilizzati: {gwpSource}. Orizzonte temporale: 100 anni.
              In assenza di fattori specifici, sono stati applicati i valori predefiniti IPCC più recenti
              disponibili al momento della quantificazione.
            </p>
          </div>

          <div className="border-t border-[#2A3D39]" />

          {/* Report metadata */}
          <div className="text-gray-400 text-xs space-y-0.5">
            <p>Data generazione rapporto: {today}</p>
            <p>Codice rapporto: {reportCode || "—"}</p>
            <p>Generato con <strong className="text-gray-300">Enworia</strong> — audit-ready carbon management | enworia.com</p>
          </div>
        </div>
      </div>

    </div>
  );
}

