"use client";

import { Fragment, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { CONSOLIDATION_APPROACH_OPTIONS, STATIONARY_FUEL_OPTIONS, FUEL_TYPE_OPTIONS } from "@/data/ghg-constants";
import { Tooltip as InfoTooltip } from "@/components/ui/Tooltip";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from "recharts";

/* ═══════════════════════════════════════════════════════════════
   ISO 14064-1:2019 — GHG Inventory Report View
   Conforme ai requisiti di rendicontazione §9.3
   ═══════════════════════════════════════════════════════════════ */

const GHG_GREEN = "#006450";
const GHG_DARK = "#0A1A13";

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

// ─── Number formatting ────────────────────────────────────────
const fmt = (v: number, d = 3) => v.toFixed(d);
const fmtLocale = (v: number) => v.toLocaleString("it-IT", { minimumFractionDigits: 3, maximumFractionDigits: 3 });

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
        style={{ backgroundColor: GHG_GREEN }}
      >
        <h2 className="text-white font-semibold text-sm">
          {number !== undefined ? `Capitolo ${number} — ` : ""}{title}
        </h2>
        <div className="flex items-center gap-2">
          <span className="bg-white/20 text-white/90 text-[10px] font-mono px-2 py-0.5 rounded">
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
    green: "bg-green-100 text-green-800",
    gray: "bg-gray-100 text-gray-500",
    yellow: "bg-yellow-100 text-yellow-800",
    red: "bg-red-100 text-red-800",
  };
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${colors[variant]}`}>{children}</span>;
}

const SCOPE_COLORS = ["#2d6a4f", "#52b788", "#95d5b2"];

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
  const [expandedAccordion, setExpandedAccordion] = useState<string | null>(null);

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
  const responsibleName = (fd.responsible_name as string) || "—";
  const inventoryPurpose = (fd.inventory_purpose as string) || "Rendicontazione volontaria ai sensi della norma UNI EN ISO 14064-1:2019";

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
  const verificationStatus = (fd.verification_status as string) || "Non verificato";
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
  const cat3Status = (fd.category_3_status as string) || "Non rendicontato in questa fase";
  const cat3Rationale = (fd.category_3_rationale as string) || "Categoria valutata come non significativa o dati non disponibili per il periodo di rendicontazione.";
  const cat4Status = (fd.category_4_status as string) || "Non rendicontato in questa fase";
  const cat4Rationale = (fd.category_4_rationale as string) || "Categoria valutata come non significativa o dati non disponibili per il periodo di rendicontazione.";
  const cat5Status = (fd.category_5_status as string) || "Non rendicontato in questa fase";
  const cat5Rationale = (fd.category_5_rationale as string) || "Categoria valutata come non significativa o dati non disponibili per il periodo di rendicontazione.";
  const cat6Status = (fd.category_6_status as string) || "Non rendicontato in questa fase";
  const cat6Rationale = (fd.category_6_rationale as string) || "Categoria valutata come non significativa o dati non disponibili per il periodo di rendicontazione.";

  // ─── Scope 1: classify sources into ISO 14064-1 subcategories ───
  // DB source_category values: "stazionario", "mobile", "hfc"
  // We map these + keyword analysis on source_label to ISO subcategories:
  //   1.1 Combustione stazionaria (§B.2.2a)
  //   1.2 Combustione mobile (§B.2.2b)
  //   1.3 Processi industriali (§B.2.2c)
  //   1.4 Emissioni fuggitive (§B.2.2d) — includes HFC/refrigerant leaks

  type IsoSubcategory = "1.1" | "1.2" | "1.3" | "1.4";
  type GroupedSources = { sources: Row[]; total: number };

  const KEYWORD_RULES: { iso: IsoSubcategory; patterns: RegExp }[] = [
    {
      iso: "1.4",
      patterns: /hfc|refrigerant|fuggitiv|perdita|leak|r-?\d{2,4}|sf6|nf3|pfc/i,
    },
    {
      iso: "1.2",
      patterns: /mobile|veicol|auto|furgon|camion|trasport|flotta|automezzo|diesel\s*auto|benzina\s*auto|gasolio\s*v|moto|scooter|trattore|muletto|carrello|forklift|escavator|truck|van\b|mezzo/i,
    },
    {
      iso: "1.1",
      patterns: /stazionari|caldaia|riscaldament|capannon|metano|gas\s*natural|gpl|gasolio\s*term|boiler|bruciator|termico|calore|vapore|cogenerator|riscald|forno|stufa|central|impianto\s*term/i,
    },
    {
      iso: "1.3",
      patterns: /processo|lavorazion|produzion|chimic|cement|siderurg|industrial|reazion/i,
    },
  ];

  function classifySource(src: Row): IsoSubcategory {
    const cat = ((src.source_category as string) || "").toLowerCase().trim();
    const label = ((src.source_label as string) || "").toLowerCase();
    const fuel = ((src.activity_data_type as string) || "").toLowerCase();
    const combined = `${cat} ${label} ${fuel}`;

    // Direct mapping from known DB values
    if (cat === "hfc") return "1.4";
    if (cat === "mobile" || cat === "carburante") return "1.2";
    if (cat === "stazionario" || cat === "gas_naturale") return "1.1";

    // Keyword-based classification on combined text
    for (const rule of KEYWORD_RULES) {
      if (rule.patterns.test(combined)) return rule.iso;
    }

    // Default: stazionaria if it looks like combustion, otherwise processo
    if (/combustion|fuel|combust/i.test(combined)) return "1.1";
    return "1.3";
  }

  const s1Groups: Record<IsoSubcategory, GroupedSources> = {
    "1.1": { sources: [], total: 0 },
    "1.2": { sources: [], total: 0 },
    "1.3": { sources: [], total: 0 },
    "1.4": { sources: [], total: 0 },
  };

  let co2Fossil = 0, hfcTotal = 0, co2Bio = 0;
  const biogenicTypes = new Set(["biogas", "wood_pellet", "wood"]);

  if (s1Sources.length > 0) {
    // Debug: log actual source_category and source_label values from DB
    console.log("[GHG View] scope1_sources raw values:", s1Sources.map((s) => ({
      source_category: s.source_category,
      source_label: s.source_label,
      activity_data_type: s.activity_data_type,
      emissions_tco2e: s.emissions_tco2e,
    })));
    console.log("[GHG View] scope2_sources raw values:", s2Sources.map((s) => ({
      source_category: s.source_category,
      source_label: s.source_label,
      contract_type: s.contract_type,
      emissions_location_tco2e: s.emissions_location_tco2e,
      emissions_market_tco2e: s.emissions_market_tco2e,
    })));

    s1Sources.forEach((src) => {
      const em = Number(src.emissions_tco2e ?? 0);
      const fuel = (src.activity_data_type as string) || "";
      const iso = classifySource(src);

      s1Groups[iso].sources.push(src);
      s1Groups[iso].total += em;

      if (iso === "1.4") hfcTotal += em;
      else if (biogenicTypes.has(fuel)) co2Bio += em;
      else co2Fossil += em;
    });

    console.log("[GHG View] ISO classification result:", {
      "1.1_stazionaria": s1Groups["1.1"].sources.map((s) => s.source_label),
      "1.2_mobile": s1Groups["1.2"].sources.map((s) => s.source_label),
      "1.3_processo": s1Groups["1.3"].sources.map((s) => s.source_label),
      "1.4_fuggitiva": s1Groups["1.4"].sources.map((s) => s.source_label),
    });
  } else {
    co2Fossil = s1Total;
  }

  // Scope 2 aggregates
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
  const scopeData = [
    { name: "Scope 1", value: s1Total, fill: SCOPE_COLORS[0] },
    { name: "Scope 2 LB", value: s2lb, fill: SCOPE_COLORS[1] },
    { name: "Scope 2 MB", value: s2mb, fill: SCOPE_COLORS[2] },
  ];
  const showScopeChart = scopeData.some((d) => d.value > 0);

  // Pie data by subcategory
  const pieData = [
    { name: "1.1 Comb. stazionaria", value: s1Groups["1.1"].total, fill: "#2d6a4f" },
    { name: "1.2 Comb. mobile", value: s1Groups["1.2"].total, fill: "#40916c" },
    { name: "1.3 Processi", value: s1Groups["1.3"].total, fill: "#52b788" },
    { name: "1.4 Fuggitive", value: s1Groups["1.4"].total, fill: "#74c69d" },
    { name: "2. Energia importata", value: s2lb, fill: "#95d5b2" },
  ].filter((d) => d.value > 0);
  // Fallback: if no s1Sources, use s1Total as single entry
  if (s1Sources.length === 0 && s1Total > 0) {
    pieData.unshift({ name: "Cat. 1 Dirette", value: s1Total, fill: "#2d6a4f" });
  }

  // Source horizontal bars
  const sourceBarData = s1Sources
    .map((src) => ({ name: (src.source_label as string) || "—", value: Number(src.emissions_tco2e ?? 0) }))
    .sort((a, b) => b.value - a.value);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tooltipFmt = (v: any) => `${Number(v).toFixed(3)} tCO₂e`;

  const toggleRow = (key: string) => setExpandedRows((prev) => ({ ...prev, [key]: !prev[key] }));

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
          <h1 className="text-2xl font-bold" style={{ color: GHG_GREEN }}>
            Inventario GHG — ISO 14064-1:2019
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">{companyName} · {periodLabel}</p>
          {reportCode && <p className="text-xs text-gray-400 font-mono">{reportCode}</p>}
        </div>
        <div className="flex gap-2">
          <Link href={`/clients/${companyId}/ghg/${reportId}/edit`}
            className="border border-gray-300 text-gray-700 px-3 py-1.5 rounded-md text-sm hover:bg-gray-50">Modifica</Link>
          <Link href={`/clients/${companyId}`}
            className="border border-gray-300 text-gray-500 px-3 py-1.5 rounded-md text-sm hover:bg-gray-50">← Torna al cliente</Link>
        </div>
      </div>

      {/* ═══════════ HEADER — Dichiarazione consolidata ═══════════ */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden print:break-inside-avoid">
        <div className="px-5 py-3" style={{ backgroundColor: GHG_GREEN }}>
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
                  <tr style={{ backgroundColor: GHG_GREEN }}>
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
                  <tr style={{ backgroundColor: GHG_GREEN }}>
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
                  <tr className="border-b border-gray-100 text-gray-400 italic">
                    <td className="py-2 px-3">3</td>
                    <td className="py-2 px-3">Emissioni indirette dal trasporto</td>
                    <td className="py-2 px-3 text-center"><Badge variant="gray">{cat3Status}</Badge></td>
                    <td className="py-2 px-3 text-right">—</td>
                    <td className="py-2 px-3 text-xs">{cat3Rationale}</td>
                  </tr>
                  {/* Cat 4 */}
                  <tr className="border-b border-gray-100 text-gray-400 italic">
                    <td className="py-2 px-3">4</td>
                    <td className="py-2 px-3">Emissioni indirette da prodotti utilizzati</td>
                    <td className="py-2 px-3 text-center"><Badge variant="gray">{cat4Status}</Badge></td>
                    <td className="py-2 px-3 text-right">—</td>
                    <td className="py-2 px-3 text-xs">{cat4Rationale}</td>
                  </tr>
                  {/* Cat 5 */}
                  <tr className="border-b border-gray-100 text-gray-400 italic">
                    <td className="py-2 px-3">5</td>
                    <td className="py-2 px-3">Emissioni indirette associate all&apos;uso di prodotti dell&apos;organizzazione</td>
                    <td className="py-2 px-3 text-center"><Badge variant="gray">{cat5Status}</Badge></td>
                    <td className="py-2 px-3 text-right">—</td>
                    <td className="py-2 px-3 text-xs">{cat5Rationale}</td>
                  </tr>
                  {/* Cat 6 */}
                  <tr className="text-gray-400 italic">
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
                  <tr style={{ backgroundColor: GHG_GREEN }}>
                    <th className="py-2 px-3 text-left text-xs text-white font-medium w-8">#</th>
                    <th className="py-2 px-3 text-left text-xs text-white font-medium">Categoria / Sorgente</th>
                    <th className="py-2 px-3 text-left text-xs text-white font-medium">Note</th>
                    <th className="py-2 px-3 text-right text-xs text-white font-medium">tCO₂e TOT</th>
                    <th className="py-2 px-3 text-right text-xs text-white font-medium">CO₂</th>
                    <th className="py-2 px-3 text-right text-xs text-white font-medium">CH₄</th>
                    <th className="py-2 px-3 text-right text-xs text-white font-medium">N₂O</th>
                    <th className="py-2 px-3 text-right text-xs text-white font-medium whitespace-normal" style={{ maxWidth: 90 }}>HFC/PFC/SF₆/NF₃</th>
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
                    <td className="py-2 px-3 text-right">{fmt(co2Fossil)}</td>
                    <td className="py-2 px-3 text-right text-gray-400">0</td>
                    <td className="py-2 px-3 text-right text-gray-400">0</td>
                    <td className="py-2 px-3 text-right">{hfcTotal > 0 ? fmt(hfcTotal) : "0"}</td>
                    <td className="py-2 px-3 text-right">±{s1WeightedUnc.toFixed(1)}%</td>
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

                        if (group.sources.length === 0 && isoKey !== "1.4") return null;

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
                              <td className="py-1.5 px-3"></td>
                              <td className="py-1.5 px-3 text-right text-gray-700">{group.total > 0 ? fmt(group.total) : "—"}</td>
                              <td className="py-1.5 px-3 text-right text-gray-400">—</td>
                              <td className="py-1.5 px-3 text-right text-gray-400">—</td>
                              <td className="py-1.5 px-3 text-right text-gray-400">—</td>
                              <td className="py-1.5 px-3 text-right text-gray-400">{isoKey === "1.4" && group.total > 0 ? fmt(group.total) : "—"}</td>
                              <td className="py-1.5 px-3 text-right text-gray-400">—</td>
                              <td className="py-1.5 px-3 text-center text-gray-400">—</td>
                            </tr>
                            {isExpanded && group.sources.map((src, si) => (
                              <tr key={si} className="border-b border-gray-50 bg-gray-50/50">
                                <td className="py-1 px-3 pl-14 text-gray-400 text-[11px]"></td>
                                <td className="py-1 px-3 pl-14 text-gray-500 text-xs">{src.source_label as string}</td>
                                <td className="py-1 px-3 text-xs text-gray-400">{fuelLabel(src.activity_data_type as string)}</td>
                                <td className="py-1 px-3 text-right text-xs text-gray-600">{fmt(Number(src.emissions_tco2e ?? 0))}</td>
                                <td className="py-1 px-3 text-right text-gray-400 text-xs">—</td>
                                <td className="py-1 px-3 text-right text-gray-400 text-xs">—</td>
                                <td className="py-1 px-3 text-right text-gray-400 text-xs">—</td>
                                <td className="py-1 px-3 text-right text-gray-400 text-xs">—</td>
                                <td className="py-1 px-3 text-right text-xs text-gray-500">±{Number(src.uncertainty_combined_pct ?? 10).toFixed(1)}%</td>
                                <td className="py-1 px-3 text-center"><Badge variant="gray">{mapDataQuality((src.data_quality as string) || "").cls}</Badge></td>
                              </tr>
                            ))}
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
                        <td className="py-1.5 px-3 text-right text-gray-400">—</td>
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
                        <td className="py-1.5 px-3 text-right text-gray-400 text-xs italic" colSpan={5}>
                          {co2Bio > 0 ? "" : "Non applicabile — nessun consumo di biomassa rendicontato"}
                        </td>
                        <td className="py-1.5 px-3"></td>
                      </tr>
                    </>
                  ) : (
                    <tr className="border-b border-gray-200">
                      <td className="py-1.5 px-3"></td>
                      <td className="py-1.5 px-3 text-gray-500 italic text-xs" colSpan={9}>
                        Dettaglio sorgenti non disponibile — valore totale dal report: {fmt(s1Total)} tCO₂e
                      </td>
                    </tr>
                  )}

                  {/* ── Cat. 2 Header ── */}
                  <tr className="bg-gray-100 font-semibold border-b border-gray-200">
                    <td className="py-2 px-3">2</td>
                    <td className="py-2 px-3">Cat. 2: Emissioni indirette da energia importata</td>
                    <td className="py-2 px-3"></td>
                    <td className="py-2 px-3 text-right">
                      LB: {fmt(s2LbTotal)}
                    </td>
                    <td className="py-2 px-3 text-right">{fmt(s2LbTotal)}</td>
                    <td className="py-2 px-3 text-right text-gray-400">—</td>
                    <td className="py-2 px-3 text-right text-gray-400">—</td>
                    <td className="py-2 px-3 text-right text-gray-400">—</td>
                    <td className="py-2 px-3 text-right">±{s2WeightedUnc.toFixed(1)}%</td>
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
                        <td className="py-1.5 px-3 text-right text-gray-400">{fmt(s2LbTotal)}</td>
                        <td className="py-1.5 px-3 text-right text-gray-400">—</td>
                        <td className="py-1.5 px-3 text-right text-gray-400">—</td>
                        <td className="py-1.5 px-3 text-right text-gray-400">—</td>
                        <td className="py-1.5 px-3 text-right text-gray-400">—</td>
                        <td className="py-1.5 px-3 text-center text-gray-400">—</td>
                      </tr>
                      {expandedRows["2.1"] && s2Sources.map((src, i) => (
                        <tr key={`lb-${i}`} className="border-b border-gray-50 bg-gray-50/50">
                          <td className="py-1 px-3 pl-14"></td>
                          <td className="py-1 px-3 pl-14 text-gray-500 text-xs">{src.source_label as string}</td>
                          <td className="py-1 px-3 text-xs text-gray-400">{Number(src.activity_value_kwh ?? 0).toLocaleString("it-IT")} kWh</td>
                          <td className="py-1 px-3 text-right text-xs text-gray-600">{fmt(Number(src.emissions_location_tco2e ?? 0))}</td>
                          <td className="py-1 px-3 text-right text-xs text-gray-400">—</td>
                          <td className="py-1 px-3 text-right text-xs text-gray-400">—</td>
                          <td className="py-1 px-3 text-right text-xs text-gray-400">—</td>
                          <td className="py-1 px-3 text-right text-xs text-gray-400">—</td>
                          <td className="py-1 px-3 text-right text-xs text-gray-500">±{Number(src.uncertainty_combined_pct ?? 5).toFixed(1)}%</td>
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
                        <td className="py-1.5 px-3 text-right text-gray-400">—</td>
                        <td className="py-1.5 px-3 text-right text-gray-400">—</td>
                        <td className="py-1.5 px-3 text-right text-gray-400">—</td>
                        <td className="py-1.5 px-3 text-right text-gray-400">—</td>
                        <td className="py-1.5 px-3 text-right text-gray-400">—</td>
                        <td className="py-1.5 px-3 text-center text-gray-400">—</td>
                      </tr>
                      {expandedRows["2.2"] && s2Sources.map((src, i) => (
                        <tr key={`mb-${i}`} className="border-b border-gray-50 bg-gray-50/50">
                          <td className="py-1 px-3 pl-14"></td>
                          <td className="py-1 px-3 pl-14 text-gray-500 text-xs">{src.source_label as string}</td>
                          <td className="py-1 px-3 text-xs text-gray-400">{src.contract_type as string}</td>
                          <td className="py-1 px-3 text-right text-xs text-gray-600">{fmt(Number(src.emissions_market_tco2e ?? 0))}</td>
                          <td className="py-1 px-3 text-right text-xs text-gray-400" colSpan={6}>—</td>
                        </tr>
                      ))}

                      {/* 2.3 FV (if present) */}
                      {s2FvSources.length > 0 && (
                        <tr className="border-b border-gray-100">
                          <td className="py-1.5 px-3 pl-8 text-gray-500 text-xs">2.3</td>
                          <td className="py-1.5 px-3 pl-8 text-gray-700">Autoproduzione fotovoltaica (FV)</td>
                          <td className="py-1.5 px-3 text-xs text-gray-400">Energia autoprodotta</td>
                          <td className="py-1.5 px-3 text-right text-gray-500 text-xs">
                            {s2FvSources.reduce((s, src) => s + Number(src.fv_production_kwh ?? 0), 0).toLocaleString("it-IT")} kWh prod.
                            <br/>
                            {s2FvSources.reduce((s, src) => s + Number(src.fv_autoconsumato_kwh ?? src.pv_self_consumed_kwh ?? 0), 0).toLocaleString("it-IT")} kWh autocons.
                          </td>
                          <td className="py-1.5 px-3 text-gray-400 text-xs" colSpan={6}>
                            Emissioni dirette incluse in Cat.1 se applicabile
                          </td>
                        </tr>
                      )}
                    </>
                  ) : (
                    <tr className="border-b border-gray-200">
                      <td className="py-1.5 px-3"></td>
                      <td className="py-1.5 px-3 text-gray-500 italic text-xs" colSpan={9}>
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
                    <tr key={cat.n} className="border-b border-gray-100 text-gray-400 italic">
                      <td className="py-1.5 px-3">{cat.n}</td>
                      <td className="py-1.5 px-3">{cat.label}</td>
                      <td className="py-1.5 px-3 text-xs">{cat.status}</td>
                      <td className="py-1.5 px-3 text-right">—</td>
                      <td className="py-1.5 px-3 text-right">—</td>
                      <td className="py-1.5 px-3 text-right">—</td>
                      <td className="py-1.5 px-3 text-right">—</td>
                      <td className="py-1.5 px-3 text-right">—</td>
                      <td className="py-1.5 px-3 text-right">—</td>
                      <td className="py-1.5 px-3 text-center">—</td>
                    </tr>
                  ))}

                  {/* ── TOTALE GENERALE ── */}
                  <tr className="font-bold text-white" style={{ backgroundColor: "#004d3b" }}>
                    <td className="py-2.5 px-3"></td>
                    <td className="py-2.5 px-3">TOTALE INVENTARIO GHG</td>
                    <td className="py-2.5 px-3"></td>
                    <td className="py-2.5 px-3 text-right">{fmt(grandTotal)}</td>
                    <td className="py-2.5 px-3 text-right">{fmt(co2Fossil + s2LbTotal)}</td>
                    <td className="py-2.5 px-3 text-right">—</td>
                    <td className="py-2.5 px-3 text-right">—</td>
                    <td className="py-2.5 px-3 text-right">{hfcTotal > 0 ? fmt(hfcTotal) : "—"}</td>
                    <td className="py-2.5 px-3 text-right">±{combinedUncertainty.toFixed(1)}%</td>
                    <td className="py-2.5 px-3 text-center">—</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* ─── 4B) APPROCCIO DI QUANTIFICAZIONE ─── */}
          <div>
            <p className="text-sm font-semibold text-gray-700 mb-2">Approccio di quantificazione (§6.2)</p>
            <div className="space-y-2">
              {/* Cat 1 accordion */}
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <button
                  type="button"
                  className="w-full flex items-center justify-between px-4 py-2.5 text-left bg-gray-50 hover:bg-gray-100 text-sm font-medium"
                  onClick={() => setExpandedAccordion(expandedAccordion === "quant-1" ? null : "quant-1")}
                >
                  <span>Categoria 1 — Metodo di quantificazione</span>
                  <span className="text-gray-400 text-xs">{expandedAccordion === "quant-1" ? "▲" : "▼"}</span>
                </button>
                {expandedAccordion === "quant-1" && (
                  <div className="px-4 py-3 text-sm text-gray-600 space-y-3">
                    <p>
                      Le emissioni dirette sono state quantificate applicando il metodo dei fattori di emissione
                      (Dati attività × Fattore di emissione × GWP). I fattori di emissione utilizzati sono tratti da{" "}
                      <strong>{gwpSource}</strong>. I valori GWP applicati fanno riferimento al {gwpSource} con orizzonte
                      temporale 100 anni, come richiesto dal §6.3 della norma.
                    </p>
                    {s1Sources.length > 0 && (
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs border border-gray-200 rounded">
                          <thead>
                            <tr className="bg-gray-100">
                              <th className="py-1.5 px-2 text-left font-medium">Sorgente</th>
                              <th className="py-1.5 px-2 text-right font-medium">FE utilizzato</th>
                              <th className="py-1.5 px-2 text-left font-medium">Rif. FE</th>
                              <th className="py-1.5 px-2 text-left font-medium">GWP source</th>
                            </tr>
                          </thead>
                          <tbody>
                            {s1Sources.map((src, i) => (
                              <tr key={i} className="border-b border-gray-100">
                                <td className="py-1 px-2">{src.source_label as string}</td>
                                <td className="py-1 px-2 text-right font-mono">{Number(src.fe_value ?? 0).toFixed(6)}</td>
                                <td className="py-1 px-2 text-gray-500">{(src.ef_reference as string) || "—"}</td>
                                <td className="py-1 px-2 text-gray-500">{(src.gwp_source as string) || gwpSource}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Cat 2 accordion */}
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <button
                  type="button"
                  className="w-full flex items-center justify-between px-4 py-2.5 text-left bg-gray-50 hover:bg-gray-100 text-sm font-medium"
                  onClick={() => setExpandedAccordion(expandedAccordion === "quant-2" ? null : "quant-2")}
                >
                  <span>Categoria 2 — Metodo di quantificazione</span>
                  <span className="text-gray-400 text-xs">{expandedAccordion === "quant-2" ? "▲" : "▼"}</span>
                </button>
                {expandedAccordion === "quant-2" && (
                  <div className="px-4 py-3 text-sm text-gray-600 space-y-2">
                    <p>
                      <strong>Approccio location-based:</strong> applicato il fattore di emissione medio della rete elettrica
                      nazionale per l&apos;anno di rendicontazione (§E.2.1 della norma).
                    </p>
                    <p>
                      <strong>Approccio market-based:</strong> applicato in base alla tipologia contrattuale
                      {s2Sources.length > 0 && ` (${Array.from(new Set(s2Sources.map((s) => s.contract_type as string))).join(", ")})`}
                      {" "}(§E.2.2 della norma).
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ─── 4C) VALUTAZIONE DELL'INCERTEZZA ─── */}
          <div>
            <p className="text-sm font-semibold text-gray-700 mb-2">Valutazione dell&apos;incertezza (§8.3)</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
                <thead>
                  <tr style={{ backgroundColor: GHG_GREEN }}>
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
                    <td className="py-2 px-3 text-right">±{s1WeightedUnc.toFixed(1)}%</td>
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
                    <td className="py-2 px-3 text-right">±{s2WeightedUnc.toFixed(1)}%</td>
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
                    <td className="py-2 px-3 text-right">±{combinedUncertainty.toFixed(1)}%</td>
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
          </div>

          {/* ─── GRAFICI RECHARTS ─── */}
          <div className="space-y-6 print:hidden">

            {/* Scope comparison bar chart */}
            {showScopeChart && (
              <div>
                <p className="text-sm font-semibold text-gray-700 mb-2">Confronto Scope 1 vs Scope 2</p>
                <div style={{ height: 220 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={scopeData} layout="horizontal">
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip formatter={tooltipFmt} />
                      <Bar dataKey="value" name="tCO₂e" isAnimationActive={false}>
                        {scopeData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Pie chart by subcategory */}
            {pieData.length > 1 && (
              <div>
                <p className="text-sm font-semibold text-gray-700 mb-2">Ripartizione per sottocategoria</p>
                <div style={{ height: 260 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={90}
                        label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                        isAnimationActive={false}
                        labelLine={false}
                      >
                        {pieData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                      </Pie>
                      <Tooltip formatter={tooltipFmt} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Source horizontal bar chart */}
            {sourceBarData.length >= 1 && (
              <div>
                <p className="text-sm font-semibold text-gray-700 mb-2">Emissioni per singola fonte (Scope 1)</p>
                <div style={{ height: Math.max(150, sourceBarData.length * 40) }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={sourceBarData} layout="vertical" margin={{ left: 10, right: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" tick={{ fontSize: 11 }} />
                      <YAxis dataKey="name" type="category" width={140} tick={{ fontSize: 11 }} />
                      <Tooltip formatter={tooltipFmt} />
                      <Bar dataKey="value" name="tCO₂e" fill="#2d6a4f" isAnimationActive={false} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </div>

        </div>
      </Chapter>

      {/* ═══════════ CAPITOLO 5 — Attività di mitigazione ═══════════ */}
      <Chapter number={5} title="Attività di mitigazione" isoRef="§7" id="cap5">
        <div className="space-y-4">
          {mitigationInitiatives.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
                <thead>
                  <tr style={{ backgroundColor: GHG_GREEN }}>
                    <th className="py-2 px-3 text-left text-xs text-white font-medium">Iniziativa</th>
                    <th className="py-2 px-3 text-left text-xs text-white font-medium">Descrizione</th>
                    <th className="py-2 px-3 text-right text-xs text-white font-medium">Riduzione stimata tCO₂e</th>
                  </tr>
                </thead>
                <tbody>
                  {mitigationInitiatives.map((init, i) => (
                    <tr key={i} className="border-b border-gray-100">
                      <td className="py-2 px-3 font-medium">{init.title}</td>
                      <td className="py-2 px-3 text-gray-600">{init.description}</td>
                      <td className="py-2 px-3 text-right">{init.reduction_tco2e?.toFixed(3) ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <p className="text-sm text-gray-600">
                Nessuna iniziativa di riduzione GHG rendicontata per il periodo in esame.
                La rendicontazione delle attività di mitigazione è raccomandata dalla norma (§7.1) ma non obbligatoria.
              </p>
            </div>
          )}

          {/* Confronto con anno di riferimento §9.3.2j */}
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
        </div>
      </Chapter>

      {/* ═══════════ FOOTER — Dichiarazioni obbligatorie ISO ═══════════ */}
      <div className="rounded-lg overflow-hidden print:break-inside-avoid" style={{ backgroundColor: "#1a2e25" }}>
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

          <div className="border-t border-white/10" />

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

          <div className="border-t border-white/10" />

          {/* §9.3.1t */}
          <div className="text-gray-300 text-sm">
            <p className="text-gray-500 text-[10px] font-mono mb-0.5">§9.3.1t</p>
            <p>
              Valori GWP utilizzati: {gwpSource}. Orizzonte temporale: 100 anni.
              In assenza di fattori specifici, sono stati applicati i valori predefiniti IPCC più recenti
              disponibili al momento della quantificazione.
            </p>
          </div>

          <div className="border-t border-white/10" />

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

