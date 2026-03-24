"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import type {
  GhgFormData,
  StationarySource,
  FleetVehicle,
  HfcGas,
  ElectricityPod,
  DataQuality,
  EfMode,
  FuelType,
  UsageCategory,
  ContractType,
  MarketInstrument,
  ConsolidationApproach,
  OrganizationalEntity,
  EntityControlType,
  StationaryFuelType,
  GasBreakdown,
  VerificationStatus,
  CategoryStatus,
} from "@/types/ghg";
import { DATA_QUALITY_UNCERTAINTY } from "@/types/ghg";
import {
  MONTHS,
  DATA_QUALITY_OPTIONS,
  FUEL_TYPE_OPTIONS,
  USAGE_CATEGORY_OPTIONS,
  CONTRACT_TYPE_OPTIONS,
  HFC_GAS_OPTIONS,
  HFC_GAS_GROUPS,
  PERIMETER_OPTIONS,
  DEFAULT_EMISSION_FACTORS,
  COUNTRY_EF_OPTIONS,
  MARKET_INSTRUMENT_OPTIONS,
  CONSOLIDATION_APPROACH_OPTIONS,
  ENTITY_CONTROL_TYPE_OPTIONS,
  STATIONARY_FUEL_GROUPS,
  STATIONARY_FUEL_OPTIONS,
  MOBILE_FUEL_GROUPS,
  COMBUSTION_GAS_EF,
  GWP_CH4,
  GWP_N2O,
} from "@/data/ghg-constants";

const GHG_GREEN = "#27AE60";
const GHG_GREEN_HOVER = "#1A8A47";
const GHG_DARK = "#1C2B28";

// ─── locale number formatters (Italian: comma decimal) ───
const itN = (v: number, decimals: number) =>
  v.toLocaleString("it-IT", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

// ─── helpers ──────────────────────────────────────────────
function emptyMonth(): number[] {
  return Array(12).fill(0);
}

function newStationarySource(): StationarySource {
  return {
    source_name: "",
    fuel_type: "natural_gas",
    unit: "Sm³",
    monthly: emptyMonth(),
    data_quality: "bolletta",
    ef_mode: "standard",
    ef_value: null,
    ef_reference: "",
  };
}

const BIOGENIC_FUELS = new Set(["biogas", "wood_pellet", "wood"]);

async function generateReportCode(year: number): Promise<string> {
  const { count } = await supabase
    .from("ghg_reports")
    .select("id", { count: "exact", head: true })
    .eq("reference_year", year);
  const n = (count ?? 0) + 1;
  return `GHG-${year}-${String(n).padStart(5, "0")}`;
}

function getVehicleCalc(v: FleetVehicle): { quantity: number; ef: { value: number; uncertainty: number; unit: string }; method: "litri" | "km" } {
  const isElectric = v.fuel_type === "electric_car_it";
  if (isElectric) {
    return { quantity: v.km_annual || 0, ef: getStandardEf("carburante", "electric_car_it"), method: "km" };
  }
  // Prefer liters if available
  if ((v.liters_annual ?? 0) > 0) {
    return { quantity: v.liters_annual!, ef: getStandardEf("carburante", v.fuel_type), method: "litri" };
  }
  // Fallback to km
  if ((v.km_annual ?? 0) > 0) {
    const kmKey = `${v.fuel_type}_km`;
    if (kmKey in DEFAULT_EMISSION_FACTORS) {
      const f = DEFAULT_EMISSION_FACTORS[kmKey as keyof typeof DEFAULT_EMISSION_FACTORS];
      return { quantity: v.km_annual!, ef: { value: f.value, uncertainty: f.uncertainty, unit: f.unit }, method: "km" };
    }
    // No per-km factor available, return 0
    return { quantity: v.km_annual!, ef: { value: 0, uncertainty: 20, unit: "tCO₂e/km" }, method: "km" };
  }
  return { quantity: 0, ef: getStandardEf("carburante", v.fuel_type), method: "litri" };
}

function calcGasBreakdown(fuelKey: string, quantity: number): { co2: number; ch4: number; n2o: number; hasDetail: boolean } {
  const gef = COMBUSTION_GAS_EF[fuelKey];
  if (!gef || gef.fe_co2 == null) return { co2: 0, ch4: 0, n2o: 0, hasDetail: false };
  return {
    co2: quantity * gef.fe_co2,
    ch4: quantity * (gef.fe_ch4 ?? 0) * GWP_CH4,
    n2o: quantity * (gef.fe_n2o ?? 0) * GWP_N2O,
    hasDetail: true,
  };
}

function newVehicle(): FleetVehicle {
  return {
    plate: "",
    fuel_type: "gasolio",
    liters_annual: null,
    km_annual: null,
    usage_category: "aziendale",
    data_quality: "bolletta",
    ef_mode: "standard",
    ef_value: null,
    ef_reference: "",
  };
}

function newHfc(): HfcGas {
  return {
    gas_name: "R-134a",
    kg_annual: null,
    data_quality: "stima_ragionata",
    ef_mode: "standard",
    ef_value: null,
    ef_reference: "",
  };
}

function newPod(): ElectricityPod {
  return {
    site_name: "",
    country: "IT",
    pod_code: "",
    contract_type: "mercato_libero",
    monthly: emptyMonth(),
    fv_self_consumed: null,
    has_fv: false,
    fv_production_kwh: 0,
    fv_autoconsumato_kwh: 0,
    fv_go_vendute: false,
    fv_immesso_kwh: 0,
    data_quality: "bolletta",
    ef_mode: "standard",
    ef_value: null,
    ef_reference: "",
    market_instrument: "none",
    market_certified_kwh: 0,
    market_ppa_coverage: 0,
    market_supplier_ef: 0,
    market_emissions: 0,
  };
}

function getCountryEf(country: string): { value: number; uncertainty: number; unit: string } {
  const opt = COUNTRY_EF_OPTIONS.find((o) => o.value === country);
  return { value: opt?.fe ?? 0.0002331, uncertainty: 5, unit: "tCO\u2082e/kWh" };
}

function getResidualMixEf(country: string): number {
  const opt = COUNTRY_EF_OPTIONS.find((o) => o.value === country);
  // Use residual mix if available, otherwise fallback to location EF
  return opt?.residual_mix_ef ?? opt?.fe ?? 0.0002331;
}

function calcMarketEmissions(
  pod: ElectricityPod,
  netKwh: number,
  locationEf: number,
  totalConsumo: number
): number {
  // If GO sold to third parties → residual mix on TOTAL consumption
  if (pod.has_fv && pod.fv_go_vendute) {
    return totalConsumo * getResidualMixEf(pod.country);
  }

  switch (pod.market_instrument) {
    case "none":
      return netKwh * getResidualMixEf(pod.country);
    case "go":
    case "rec":
    case "i_rec": {
      const certifiedKwh = Math.min(pod.market_certified_kwh, netKwh);
      return (netKwh - certifiedKwh) * locationEf;
    }
    case "ppa": {
      const ppaKwh = netKwh * (pod.market_ppa_coverage / 100);
      return (netKwh - ppaKwh) * locationEf;
    }
    case "supplier_rate":
      return netKwh * pod.market_supplier_ef;
    default:
      return netKwh * locationEf;
  }
}

function newEntity(): OrganizationalEntity {
  return {
    name: "",
    ownership_pct: 100,
    control_type: "operational",
    included: true,
    exclusion_reason: "",
  };
}

const DEFAULT_CATEGORY_RATIONALE = "Categoria valutata come non significativa per questa organizzazione nel periodo di rendicontazione. Criteri applicati: entità stimata trascurabile, dati non disponibili con sufficiente accuratezza.";

function defaultFormData(): GhgFormData {
  return {
    // Step 1 — Contesto inventario
    reference_year: null,
    reference_year_rationale: "Primo anno di inventario — utilizzato come baseline per i confronti futuri ai sensi del §6.4.1 della norma UNI EN ISO 14064-1:2019.",
    consolidation_approach: "operational",
    installations: [],
    verification_status: "non_verificato",
    verification_body: "",
    inventory_purpose: ["rendicontazione_volontaria"],
    category_3_status: "non_rendicontato",
    category_3_rationale: DEFAULT_CATEGORY_RATIONALE,
    category_4_status: "non_rendicontato",
    category_4_rationale: DEFAULT_CATEGORY_RATIONALE,
    category_5_status: "non_rendicontato",
    category_5_rationale: DEFAULT_CATEGORY_RATIONALE,
    category_6_status: "non_rendicontato",
    category_6_rationale: DEFAULT_CATEGORY_RATIONALE,
    materiality_criteria: "Le emissioni indirette significative sono state identificate sulla base dei criteri di entità, livello di influenza e accuratezza dei dati disponibili, in conformità al §5.2.3 della norma UNI EN ISO 14064-1:2019.",
    // Step 2 — Perimetro
    year: new Date().getFullYear() - 1,
    base_year: new Date().getFullYear() - 2,
    base_year_recalculation: [],
    base_year_recalculation_notes: "",
    perimeter: "individuale",
    entities: [],
    included_entities: "",
    notes: "",
    // Steps 3-6
    stationary_sources: [newStationarySource()],
    fleet_vehicles: [],
    hfc_gases: [],
    electricity_pods: [newPod()],
  };
}

function getStationaryEf(fuelType: string): { value: number; uncertainty: number; unit: string } {
  const fuel = STATIONARY_FUEL_OPTIONS.find((f) => f.value === fuelType);
  if (fuel) return { value: fuel.fe, uncertainty: fuel.fe_uncertainty, unit: fuel.fe_unit };
  return { value: 0.001983, uncertainty: 3, unit: "tCO₂e/Sm³" };
}

function getStandardEf(
  sourceType: "stazionario" | "gas_naturale" | "carburante" | "hfc" | "elettricita",
  subType?: string
): { value: number; uncertainty: number; unit: string } {
  if (sourceType === "stazionario") {
    return getStationaryEf(subType || "natural_gas");
  }
  if (sourceType === "gas_naturale") {
    // Legacy compatibility
    return getStationaryEf(subType === "mwh" ? "natural_gas" : "natural_gas");
  }
  if (sourceType === "carburante") {
    if (subType && subType in DEFAULT_EMISSION_FACTORS) {
      const f = DEFAULT_EMISSION_FACTORS[subType as keyof typeof DEFAULT_EMISSION_FACTORS];
      return { value: f.value, uncertainty: f.uncertainty, unit: f.unit };
    }
    const f = DEFAULT_EMISSION_FACTORS.gasolio;
    return { value: f.value, uncertainty: f.uncertainty, unit: f.unit };
  }
  if (sourceType === "hfc") {
    const gas = HFC_GAS_OPTIONS.find((g) => g.value === subType);
    return { value: (gas?.gwp ?? 1430) / 1000, uncertainty: 10, unit: "tCO₂e/kg" };
  }
  // elettricita — subType is now the country code
  return getCountryEf(subType || "IT");
}

function calcTco2e(quantity: number, efValue: number): number {
  return quantity * efValue;
}

function calcUncertainty(dataQuality: DataQuality, efUncertainty: number): number {
  const dq = DATA_QUALITY_UNCERTAINTY[dataQuality];
  return Math.sqrt(dq * dq + efUncertainty * efUncertainty);
}

const TRAFFIC_COLORS = {
  green: { bg: "bg-green-100", text: "text-green-800", dot: "bg-green-500" },
  yellow: { bg: "bg-yellow-100", text: "text-yellow-800", dot: "bg-yellow-500" },
  red: { bg: "bg-red-100", text: "text-red-800", dot: "bg-red-500" },
};

function getSemaforoQuality(uncertainty: number): { color: "green" | "yellow" | "red"; label: string; text: string } {
  if (uncertainty < 5) return { color: "green", label: "\uD83D\uDFE2", text: "Alta" };
  if (uncertainty <= 15) return { color: "yellow", label: "\uD83D\uDFE1", text: "Media" };
  return { color: "red", label: "\uD83D\uDD34", text: "Bassa" };
}

function UncertaintyBadge({ uncertainty }: { uncertainty: number }) {
  const sem = getSemaforoQuality(uncertainty);
  const colors = TRAFFIC_COLORS[sem.color];
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${colors.bg} ${colors.text}`}>
      <span className={`w-2 h-2 rounded-full ${colors.dot}`}></span>
      ±{itN(uncertainty, 1)}% · {sem.text}
    </span>
  );
}

// ─── Validation helpers ──────────────────────────────────
function isStationaryEmpty(s: StationarySource): boolean {
  return !s.source_name && s.monthly.every((v) => !v);
}
function isStationaryComplete(s: StationarySource): boolean {
  return s.monthly.some((v) => v > 0);
}
function isVehicleEmpty(v: FleetVehicle): boolean {
  return !v.plate && !v.liters_annual && !v.km_annual;
}
function isVehicleComplete(v: FleetVehicle): boolean {
  return (v.liters_annual ?? 0) > 0 || (v.km_annual ?? 0) > 0;
}
function isPodEmpty(p: ElectricityPod): boolean {
  return !p.site_name && p.monthly.every((v) => !v);
}
function isPodComplete(p: ElectricityPod): boolean {
  return p.monthly.some((v) => v > 0);
}

type AutoSaveStatus = "idle" | "pending" | "saving" | "saved" | "error";

// ─── Reusable sub-components ──────────────────────────────
function StepCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-lg border border-[var(--border)] overflow-hidden">
      <div className="px-5 py-3" style={{ backgroundColor: GHG_DARK }}>
        <h2 className="text-white font-semibold text-sm tracking-wide">{title}</h2>
      </div>
      <div className="px-5 py-5 space-y-4">{children}</div>
    </div>
  );
}

// ─── EF validation ranges ────────────────────────────────────
type EfValidation = { min: number; max: number; unit: string };
const EF_RANGES: Record<string, EfValidation> = {
  natural_gas: { min: 0.001, max: 0.003, unit: "tCO₂e/Sm³" },
  lpg: { min: 0.001, max: 0.003, unit: "tCO₂e/litro" },
  diesel: { min: 0.002, max: 0.004, unit: "tCO₂e/litro" },
  gasolio: { min: 0.002, max: 0.004, unit: "tCO₂e/litro" },
  benzina: { min: 0.002, max: 0.003, unit: "tCO₂e/litro" },
  fuel_oil: { min: 0.002, max: 0.004, unit: "tCO₂e/litro" },
  coal: { min: 0.001, max: 0.004, unit: "tCO₂e/kg" },
  _fossil_generic: { min: 0.0001, max: 0.005, unit: "tCO₂e/unità" },
  _electricity: { min: 0.0001, max: 0.001, unit: "tCO₂e/kWh" },
  _refrigerant: { min: 0.0001, max: 5, unit: "tCO₂e/kg" },
};

function getEfWarning(
  value: number | null,
  sourceType?: "stationary" | "mobile" | "hfc" | "electricity",
  fuelType?: string,
): { level: "yellow" | "red"; message: string; offerConvert?: number } | null {
  if (value == null || value === 0) return null;

  // Electricity
  if (sourceType === "electricity") {
    const range = EF_RANGES._electricity;
    if (value > 0.001) {
      return {
        level: "yellow",
        message: `Il valore inserito (${value}) sembra essere in kgCO₂e/kWh (es. ISPRA: 0.4111). L'unità richiesta è tCO₂e/kWh (es. ISPRA: 0.0004111).`,
        offerConvert: value / 1000,
      };
    }
    if (value < range.min) {
      return { level: "yellow", message: `Valore sotto il range atteso per elettricità: ${range.min}–${range.max} ${range.unit}` };
    }
    return null;
  }

  // Refrigerants
  if (sourceType === "hfc") {
    if (value > 10) {
      return { level: "red", message: `Valore molto alto (${value}): verificare unità di misura. Range atteso per refrigeranti: 0.0001–5 tCO₂e/kg.` };
    }
    if (value > 5) {
      return { level: "yellow", message: `Valore sopra il range tipico per refrigeranti: 0.0001–5 tCO₂e/kg.` };
    }
    return null;
  }

  // Very high value — likely kg instead of t
  if (value > 1) {
    return { level: "red", message: "Valore molto alto: verificare unità di misura. I fattori di emissione si esprimono in tCO₂e, non kgCO₂e." };
  }

  // Fossil fuels range check
  const fuel = fuelType || "";
  const range = EF_RANGES[fuel] || EF_RANGES._fossil_generic;
  if (value < range.min || value > range.max) {
    return { level: "yellow", message: `Valore fuori dal range atteso per ${fuel || "combustibile"}: ${range.min}–${range.max} ${range.unit}` };
  }

  return null;
}

function QualityAndEf({
  dataQuality,
  efMode,
  efValue,
  efReference,
  standardEf,
  onChangeQuality,
  onChangeEfMode,
  onChangeEfValue,
  onChangeEfReference,
  sourceType,
  fuelType,
}: {
  dataQuality: DataQuality;
  efMode: EfMode;
  efValue: number | null;
  efReference: string;
  standardEf: { value: number; uncertainty: number; unit: string };
  onChangeQuality: (v: DataQuality) => void;
  onChangeEfMode: (v: EfMode) => void;
  onChangeEfValue: (v: number | null) => void;
  onChangeEfReference: (v: string) => void;
  sourceType?: "stationary" | "mobile" | "hfc" | "electricity";
  fuelType?: string;
}) {
  const efUnc = efMode === "custom" ? 5 : standardEf.uncertainty;
  const combinedUnc = calcUncertainty(dataQuality, efUnc);
  const [efWarning, setEfWarning] = useState<{ level: "yellow" | "red"; message: string; offerConvert?: number } | null>(null);

  const handleEfBlur = () => {
    setEfWarning(getEfWarning(efValue, sourceType, fuelType));
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-3 bg-gray-50 rounded-md">
      <div>
        <label className="text-xs font-medium text-[var(--muted)] mb-1 block">Qualità dato</label>
        <select
          value={dataQuality}
          onChange={(e) => onChangeQuality(e.target.value as DataQuality)}
          className="w-full border border-[var(--border)] rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#27AE60]/30 focus:border-[#27AE60]"
        >
          {DATA_QUALITY_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label} (±{o.uncertainty}%)
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="text-xs font-medium text-[var(--muted)] mb-1 block">Fattore emissione</label>
        <div className="flex gap-2 mb-2">
          <button
            type="button"
            onClick={() => { onChangeEfMode("standard"); setEfWarning(null); }}
            className={`px-3 py-1 text-xs rounded-md transition-colors ${
              efMode === "standard"
                ? "text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
            style={efMode === "standard" ? { backgroundColor: GHG_GREEN } : {}}
          >
            Standard
          </button>
          <button
            type="button"
            onClick={() => onChangeEfMode("custom")}
            className={`px-3 py-1 text-xs rounded-md transition-colors ${
              efMode === "custom"
                ? "text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
            style={efMode === "custom" ? { backgroundColor: GHG_GREEN } : {}}
          >
            Personalizzato
          </button>
        </div>
        {efMode === "standard" ? (
          <p className="text-xs text-[var(--muted)]">
            {standardEf.value} {standardEf.unit} (±{standardEf.uncertainty}%)
          </p>
        ) : (
          <div className="space-y-2">
            <input
              type="number"
              step="any"
              placeholder="Valore FE (in tCO₂e)"
              value={efValue ?? ""}
              onChange={(e) => { onChangeEfValue(e.target.value ? Number(e.target.value) : null); setEfWarning(null); }}
              onBlur={handleEfBlur}
              className="w-full border border-[var(--border)] rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#27AE60]/30 focus:border-[#27AE60]"
            />
            {efWarning && (
              <div className={`text-xs px-3 py-2 rounded-md border ${
                efWarning.level === "red"
                  ? "bg-red-50 border-red-300 text-red-800"
                  : "bg-amber-50 border-amber-300 text-amber-800"
              }`}>
                <p>{efWarning.level === "red" ? "🔴" : "⚠️"} {efWarning.message}</p>
                {efWarning.offerConvert != null && (
                  <div className="flex gap-2 mt-1.5">
                    <button
                      type="button"
                      onClick={() => { onChangeEfValue(efWarning.offerConvert!); setEfWarning(null); }}
                      className="px-2 py-0.5 text-xs rounded bg-amber-200 hover:bg-amber-300 font-medium"
                    >
                      Sì, converti a {itN(efWarning.offerConvert, 7)}
                    </button>
                    <button
                      type="button"
                      onClick={() => setEfWarning(null)}
                      className="px-2 py-0.5 text-xs rounded bg-gray-200 hover:bg-gray-300"
                    >
                      No, mantieni
                    </button>
                  </div>
                )}
              </div>
            )}
            <input
              type="text"
              placeholder="Riferimento (es. DEFRA 2023)"
              value={efReference}
              onChange={(e) => onChangeEfReference(e.target.value)}
              className="w-full border border-[var(--border)] rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#27AE60]/30 focus:border-[#27AE60]"
            />
          </div>
        )}
      </div>
      {/* Uncertainty badge — spans full width */}
      <div className="md:col-span-2 flex items-center justify-between">
        <span className="text-xs text-[var(--muted)]">
          Incertezza combinata: dato ±{DATA_QUALITY_UNCERTAINTY[dataQuality]}% + FE ±{efUnc}%
        </span>
        <UncertaintyBadge uncertainty={combinedUnc} />
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────
export default function GhgNewPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const companyId = params.id as string;
  const existingReportId = searchParams.get("report");
  const isEditMode = searchParams.get("edit") === "1";
  const presetAnno = searchParams.get("anno");

  const [step, setStep] = useState(1);
  const [form, setForm] = useState<GhgFormData>(() => {
    const d = defaultFormData();
    if (presetAnno) d.year = Number(presetAnno);
    return d;
  });
  const [reportId, setReportId] = useState<string | null>(existingReportId);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [companyName, setCompanyName] = useState("");
  const [autoSaveStatus, setAutoSaveStatus] = useState<AutoSaveStatus>("idle");
  const [calcGenerated, setCalcGenerated] = useState(false);
  const [reportSaved, setReportSaved] = useState(false);
  const [editingCompleted, setEditingCompleted] = useState(false);
  const [reportCode, setReportCode] = useState<string | null>(null);
  const [validationWarning, setValidationWarning] = useState<{ step: number; message: string; canContinue: boolean } | null>(null);
  const [draftBanner, setDraftBanner] = useState<{ show: boolean; draftId: string; stepReached: number; formData: GhgFormData; code: string | null } | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const formInitialized = useRef(false);

  const [, setCompanyAddress] = useState("");

  // Load company name and address
  useEffect(() => {
    supabase
      .from("companies")
      .select("company_name, registered_address")
      .eq("id", companyId)
      .single()
      .then(({ data }) => {
        if (data) {
          setCompanyName(data.company_name);
          setCompanyAddress(data.registered_address || "");
          // Pre-populate installations if empty
          setForm((prev) => {
            if (prev.installations.length === 0) {
              return { ...prev, installations: [{ name: data.company_name, address: data.registered_address || "" }] };
            }
            return prev;
          });
          // Pre-populate reference_year if null
          setForm((prev) => {
            if (prev.reference_year === null) {
              return { ...prev, reference_year: prev.year };
            }
            return prev;
          });
        }
      });
  }, [companyId]);

  // Check for existing draft (only when creating new, not editing)
  useEffect(() => {
    if (existingReportId) return;
    console.log("[GHG draft check] companyId:", companyId);
    (async () => {
      const { data, error } = await supabase
        .from("ghg_reports")
        .select("id, step_reached, form_data, reference_year, report_code")
        .eq("company_id", companyId)
        .eq("status", "bozza")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      console.log("[GHG draft check] result:", { data, error });
      if (data?.form_data && Object.keys(data.form_data as object).length > 0) {
        setDraftBanner({
          show: true,
          draftId: data.id,
          stepReached: (data.step_reached as number) || 1,
          formData: data.form_data as GhgFormData,
          code: (data.report_code as string) || null,
        });
      }
    })();
  }, [companyId, existingReportId]);

  // Load existing report if editing
  useEffect(() => {
    if (!existingReportId) return;
    (async () => {
      const { data: rep } = await supabase
        .from("ghg_reports")
        .select("*")
        .eq("id", existingReportId)
        .single();
      if (!rep) return;
      const { data: s1 } = await supabase
        .from("scope1_sources")
        .select("*")
        .eq("ghg_report_id", existingReportId);
      const { data: s2 } = await supabase
        .from("scope2_sources")
        .select("*")
        .eq("ghg_report_id", existingReportId);

      const stationarySources: StationarySource[] = [];
      const vehicles: FleetVehicle[] = [];
      const hfcGases: HfcGas[] = [];
      (s1 || []).forEach((src: Record<string, unknown>) => {
        const cat = (src.source_category as string) || (src.source_type as string) || "";
        if (cat === "stazionario" || cat === "gas_naturale") {
          const fuelType = (src.activity_data_type as string) || (src.fuel_type as string) || "natural_gas";
          const fuelOpt = STATIONARY_FUEL_OPTIONS.find((f) => f.value === fuelType);
          stationarySources.push({
            source_name: (src.source_label as string) || (src.site_name as string) || "",
            fuel_type: fuelType as StationaryFuelType,
            unit: (src.activity_unit as string) || fuelOpt?.unit || "Sm³",
            monthly: (src.monthly_values as number[]) || emptyMonth(),
            data_quality: (src.data_quality as DataQuality) || "bolletta",
            ef_mode: (src.fe_source_type as EfMode) || "standard",
            ef_value: (src.fe_value as number) ?? null,
            ef_reference: (src.fe_source_ref as string) || "",
          });
        } else if (cat === "mobile" || cat === "carburante") {
          vehicles.push({
            plate: (src.source_label as string) || (src.plate as string) || "",
            fuel_type: ((src.activity_data_type as string) || (src.fuel_type as string) || "gasolio") as FuelType,
            liters_annual: (src.activity_value as number) ?? null,
            km_annual: null,
            usage_category: ((src.notes as string) || "aziendale") as UsageCategory,
            data_quality: (src.data_quality as DataQuality) || "bolletta",
            ef_mode: (src.fe_source_type as EfMode) || "standard",
            ef_value: (src.fe_value as number) ?? null,
            ef_reference: (src.fe_source_ref as string) || "",
          });
        } else if (cat === "hfc") {
          hfcGases.push({
            gas_name: (src.source_label as string) || (src.activity_data_type as string) || "R-134a",
            kg_annual: (src.activity_value as number) ?? null,
            data_quality: (src.data_quality as DataQuality) || "stima_ragionata",
            ef_mode: (src.fe_source_type as EfMode) || "standard",
            ef_value: (src.fe_value as number) ?? null,
            ef_reference: (src.fe_source_ref as string) || "",
          });
        }
      });

      const pods: ElectricityPod[] = (s2 || []).map((src: Record<string, unknown>) => ({
        site_name: (src.source_label as string) || "",
        country: "IT",
        pod_code: "",
        contract_type: (src.contract_type as ContractType) || "mercato_libero",
        monthly: (src.monthly_values as number[]) || emptyMonth(),
        fv_self_consumed: (src.pv_self_consumed_kwh as number) ?? null,
        has_fv: (src.has_fv as boolean) || false,
        fv_production_kwh: (src.pv_generated_kwh as number) || 0,
        fv_autoconsumato_kwh: (src.fv_autoconsumato_kwh as number) || (src.pv_self_consumed_kwh as number) || 0,
        fv_go_vendute: (src.fv_go_vendute as boolean) || false,
        fv_immesso_kwh: (src.pv_fed_to_grid_kwh as number) || 0,
        data_quality: (src.data_quality as DataQuality) || "bolletta",
        ef_mode: (src.fe_custom_value != null ? "custom" : "standard") as EfMode,
        ef_value: (src.fe_custom_value as number) ?? (src.fe_location_value as number) ?? null,
        ef_reference: (src.fe_custom_source_ref as string) || "",
        market_instrument: ((src.fe_market_source_type as string) || "none") as MarketInstrument,
        market_certified_kwh: 0,
        market_ppa_coverage: 0,
        market_supplier_ef: (src.fe_market_value as number) || 0,
        market_emissions: (src.emissions_market_tco2e as number) || 0,
      }));

      // Try loading from form_data first (faster), fall back to scope tables
      const fd = rep.form_data as GhgFormData | null;
      if (fd && Object.keys(fd).length > 5) {
        // Merge with defaults to handle old form_data missing new fields
        setForm({ ...defaultFormData(), ...fd });
      } else {
        const repYear = (rep.reference_year as number) || (rep.year as number);
        setForm({
          ...defaultFormData(),
          year: repYear,
          base_year: (rep.base_year as number) || repYear - 1,
          base_year_recalculation: (rep.base_year_recalculation as string[]) || [],
          base_year_recalculation_notes: (rep.base_year_recalculation_notes as string) || "",
          perimeter: rep.perimeter,
          consolidation_approach: (rep.consolidation_approach as ConsolidationApproach) || "operational",
          entities: (rep.entities as OrganizationalEntity[]) || [],
          included_entities: rep.included_entities || "",
          notes: rep.notes || "",
          stationary_sources: stationarySources.length > 0 ? stationarySources : [newStationarySource()],
          fleet_vehicles: vehicles,
          hfc_gases: hfcGases,
          electricity_pods: pods.length > 0 ? pods : [newPod()],
        });
      }

      // Restore step from step_reached
      const stepReached = (rep.step_reached as number) || 1;
      if (isEditMode && stepReached > 1) setStep(stepReached);

      // Detect if editing a completed report
      if (isEditMode && (rep.status === "completato" || rep.status === "completed")) {
        setEditingCompleted(true);
      }
      // Load report_code
      if (rep.report_code) setReportCode(rep.report_code as string);
    })();
  }, [existingReportId, isEditMode]);

  // ─── Save logic ───────────────────────────────────
  const saveToDb = useCallback(async () => {
    setSaving(true);
    try {
      // Calculate totals
      let totalScope1 = 0;
      let totalScope2 = 0;

      // Combustione stazionaria
      form.stationary_sources.forEach((s) => {
        const total = s.monthly.reduce((a, b) => a + (b || 0), 0);
        const ef =
          s.ef_mode === "custom" && s.ef_value != null
            ? s.ef_value
            : getStandardEf("stazionario", s.fuel_type).value;
        // Biogenic emissions not added to fossil Scope 1
        if (!BIOGENIC_FUELS.has(s.fuel_type)) {
          totalScope1 += calcTco2e(total, ef);
        }
      });
      // Combustione mobile
      form.fleet_vehicles.forEach((v) => {
        const isElectric = v.fuel_type === "electric_car_it";
        const vc = getVehicleCalc(v);
        const ef = v.ef_mode === "custom" && v.ef_value != null ? v.ef_value : vc.ef.value;
        if (isElectric) {
          totalScope2 += calcTco2e(vc.quantity, ef);
        } else {
          totalScope1 += calcTco2e(vc.quantity, ef);
        }
      });
      // HFC
      form.hfc_gases.forEach((h) => {
        const kg = h.kg_annual || 0;
        const ef =
          h.ef_mode === "custom" && h.ef_value != null
            ? h.ef_value
            : getStandardEf("hfc", h.gas_name).value;
        totalScope1 += calcTco2e(kg, ef);
      });
      // Elettricità
      form.electricity_pods.forEach((p) => {
        const totalConsumo = p.monthly.reduce((a, b) => a + (b || 0), 0);
        const autocons = p.has_fv ? Math.min(p.fv_autoconsumato_kwh || 0, totalConsumo) : 0;
        const netKwh = Math.max(0, totalConsumo - autocons);
        const ef =
          p.ef_mode === "custom" && p.ef_value != null
            ? p.ef_value
            : getStandardEf("elettricita", p.country).value;
        totalScope2 += calcTco2e(netKwh, ef);
      });

      // Upsert report
      const reportData = {
        company_id: companyId,
        reference_year: form.year,
        base_year: form.base_year,
        base_year_recalculation: form.base_year_recalculation,
        perimeter: form.perimeter,
        consolidation_approach: form.consolidation_approach,
        entities: form.entities,
        included_entities: form.included_entities,
        notes: form.notes,
        status: "draft" as const,
        scope1_total: totalScope1,
        scope2_lb_total: totalScope2,
      };

      let rid = reportId;
      if (rid) {
        const { error } = await supabase.from("ghg_reports").update(reportData).eq("id", rid);
        if (error) console.error("[GHG save] update error:", error);
      } else {
        const { data, error } = await supabase
          .from("ghg_reports")
          .upsert(reportData, { onConflict: "company_id,reference_year" })
          .select("id")
          .single();
        if (error) console.error("[GHG save] upsert error:", error);
        if (data) {
          rid = data.id;
          setReportId(rid);
        }
      }
      if (!rid) throw new Error("No report ID");

      // Delete old sources and re-insert
      await Promise.all([
        supabase.from("scope1_sources").delete().eq("ghg_report_id", rid),
        supabase.from("scope2_sources").delete().eq("ghg_report_id", rid),
      ]);

      // Insert scope1 sources (columns: ghg_report_id, source_category, source_label,
      // activity_data_type, activity_unit, activity_value, monthly_values, data_quality,
      // fe_value, fe_source_ref, fe_source_type, uncertainty_activity_pct,
      // uncertainty_fe_pct, uncertainty_combined_pct, emissions_tco2e, notes)
      const scope1Rows: Record<string, unknown>[] = [];
      form.stationary_sources.forEach((s) => {
        const total = s.monthly.reduce((a, b) => a + (b || 0), 0);
        const stdEf = getStandardEf("stazionario", s.fuel_type);
        const ef = s.ef_mode === "custom" && s.ef_value != null ? s.ef_value : stdEf.value;
        const efUnc = s.ef_mode === "custom" ? 5 : stdEf.uncertainty;
        const tco2e = calcTco2e(total, ef);
        const unc = calcUncertainty(s.data_quality, efUnc);
        scope1Rows.push({
          ghg_report_id: rid,
          source_category: "stazionario",
          source_label: s.source_name || "Fonte",
          activity_data_type: s.fuel_type,
          activity_unit: s.unit,
          activity_value: total,
          monthly_values: s.monthly,
          data_quality: s.data_quality,
          fe_value: ef,
          fe_source_ref: s.ef_mode === "custom" ? s.ef_reference : stdEf.unit,
          fe_source_type: s.ef_mode,
          uncertainty_activity_pct: DATA_QUALITY_UNCERTAINTY[s.data_quality],
          uncertainty_fe_pct: efUnc,
          uncertainty_combined_pct: unc,
          emissions_tco2e: tco2e,
        });
      });
      form.fleet_vehicles.forEach((v) => {
        const vc = getVehicleCalc(v);
        const ef = v.ef_mode === "custom" && v.ef_value != null ? v.ef_value : vc.ef.value;
        const efUnc = v.ef_mode === "custom" ? 5 : vc.ef.uncertainty;
        const tco2e = calcTco2e(vc.quantity, ef);
        const unc = calcUncertainty(v.data_quality, efUnc);
        scope1Rows.push({
          ghg_report_id: rid,
          source_category: "mobile",
          source_label: v.plate || "Veicolo",
          activity_data_type: v.fuel_type,
          activity_unit: vc.method === "km" ? "km" : "litri",
          activity_value: vc.quantity,
          data_quality: v.data_quality,
          fe_value: ef,
          fe_source_ref: v.ef_mode === "custom" ? v.ef_reference : vc.ef.unit,
          fe_source_type: v.ef_mode,
          uncertainty_activity_pct: DATA_QUALITY_UNCERTAINTY[v.data_quality],
          uncertainty_fe_pct: efUnc,
          uncertainty_combined_pct: unc,
          emissions_tco2e: tco2e,
          notes: v.usage_category,
        });
      });
      form.hfc_gases.forEach((h) => {
        const stdEf = getStandardEf("hfc", h.gas_name);
        const ef = h.ef_mode === "custom" && h.ef_value != null ? h.ef_value : stdEf.value;
        const efUnc = h.ef_mode === "custom" ? 10 : stdEf.uncertainty;
        const tco2e = calcTco2e(h.kg_annual || 0, ef);
        const unc = calcUncertainty(h.data_quality, efUnc);
        scope1Rows.push({
          ghg_report_id: rid,
          source_category: "hfc",
          source_label: h.gas_name,
          activity_data_type: h.gas_name,
          activity_unit: "kg",
          activity_value: h.kg_annual || 0,
          data_quality: h.data_quality,
          fe_value: ef,
          fe_source_ref: h.ef_mode === "custom" ? h.ef_reference : "GWP AR6",
          fe_source_type: h.ef_mode,
          gwp_value: (ef * 1000),
          gwp_source: "IPCC AR6",
          uncertainty_activity_pct: DATA_QUALITY_UNCERTAINTY[h.data_quality],
          uncertainty_fe_pct: efUnc,
          uncertainty_combined_pct: unc,
          emissions_tco2e: tco2e,
        });
      });
      if (scope1Rows.length > 0) {
        const { error: s1Err } = await supabase.from("scope1_sources").insert(scope1Rows);
        if (s1Err) console.error("[GHG save] scope1 insert error:", s1Err);
      }

      // Insert scope2 sources (columns: ghg_report_id, source_category, source_label,
      // activity_value_kwh, monthly_values, contract_type, data_quality,
      // fe_location_value, fe_location_source, fe_location_source_type,
      // fe_market_value, fe_market_source, fe_market_source_type,
      // fe_custom_value, fe_custom_source_ref,
      // emissions_location_tco2e, emissions_market_tco2e,
      // has_fv, pv_generated_kwh, pv_self_consumed_kwh, pv_fed_to_grid_kwh,
      // fv_go_vendute, fv_autoconsumato_kwh,
      // uncertainty_activity_pct, uncertainty_fe_pct, uncertainty_combined_pct)
      const scope2Rows: Record<string, unknown>[] = [];
      form.electricity_pods.forEach((p) => {
        const totalConsumo = p.monthly.reduce((a, b) => a + (b || 0), 0);
        const autocons = p.has_fv ? Math.min(p.fv_autoconsumato_kwh || 0, totalConsumo) : 0;
        const netKwh = Math.max(0, totalConsumo - autocons);
        const stdEf = getStandardEf("elettricita", p.country);
        const ef = p.ef_mode === "custom" && p.ef_value != null ? p.ef_value : stdEf.value;
        const efUnc = p.ef_mode === "custom" ? 5 : stdEf.uncertainty;
        const locationEm = calcTco2e(netKwh, ef);
        const marketEm = calcMarketEmissions(p, netKwh, ef, totalConsumo);
        const marketEf = getResidualMixEf(p.country);
        const unc = calcUncertainty(p.data_quality, efUnc);
        const fvProd = p.has_fv ? (p.fv_production_kwh || 0) : 0;
        const fvImmesso = p.has_fv ? Math.max(0, fvProd - (p.fv_autoconsumato_kwh || 0)) : 0;
        scope2Rows.push({
          ghg_report_id: rid,
          source_category: "elettricita",
          source_label: p.site_name || p.pod_code || "Sede",
          activity_value_kwh: netKwh,
          monthly_values: p.monthly,
          contract_type: p.contract_type,
          data_quality: p.data_quality,
          fe_location_value: stdEf.value,
          fe_location_source: `IEA 2023 (${p.country})`,
          fe_location_source_type: "standard",
          fe_market_value: marketEf,
          fe_market_source: `Residual mix AIB 2023 (${p.country})`,
          fe_market_source_type: p.market_instrument === "none" ? "residual_mix" : p.market_instrument,
          ...(p.ef_mode === "custom" ? { fe_custom_value: p.ef_value, fe_custom_source_ref: p.ef_reference } : {}),
          emissions_location_tco2e: locationEm,
          emissions_market_tco2e: marketEm,
          has_fv: p.has_fv,
          pv_generated_kwh: fvProd,
          pv_self_consumed_kwh: autocons,
          pv_fed_to_grid_kwh: fvImmesso,
          fv_go_vendute: p.has_fv ? p.fv_go_vendute : false,
          fv_autoconsumato_kwh: autocons,
          uncertainty_activity_pct: DATA_QUALITY_UNCERTAINTY[p.data_quality],
          uncertainty_fe_pct: efUnc,
          uncertainty_combined_pct: unc,
        });
      });
      if (scope2Rows.length > 0) {
        const { error: s2Err } = await supabase.from("scope2_sources").insert(scope2Rows);
        if (s2Err) console.error("[GHG save] scope2 insert error:", s2Err);
      }

      setLastSaved(new Date());
    } catch (err) {
      console.error("GHG save error:", err);
    } finally {
      setSaving(false);
    }
  }, [form, reportId, companyId]);

  // ─── Autosave debounce ───────────────────────────
  const autoSave = useCallback(async () => {
    if (!companyId) {
      console.error("[GHG autosave] companyId is missing:", companyId);
      setAutoSaveStatus("error");
      return;
    }
    setAutoSaveStatus("saving");
    try {
      const draftData: Record<string, unknown> = {
        company_id: companyId,
        reference_year: form.year,
        perimeter: form.perimeter,
        consolidation_approach: form.consolidation_approach,
        entities: form.entities,
        included_entities: form.included_entities,
        notes: form.notes,
        status: "bozza",
        step_reached: step,
        form_data: form,
        base_year: form.base_year,
        base_year_recalculation: form.base_year_recalculation,
      };

      // Generate report_code on first save
      if (!reportCode) {
        const code = await generateReportCode(form.year);
        draftData.report_code = code;
        setReportCode(code);
      }

      console.log("[GHG autosave] payload:", { reportId, companyId, year: form.year, step, reportCode });

      if (reportId) {
        // Update existing report
        const { error } = await supabase.from("ghg_reports").update(draftData).eq("id", reportId);
        if (error) {
          console.error("[GHG autosave] update error:", error);
          setAutoSaveStatus("error");
          return;
        }
      } else {
        // Upsert by company_id + year (handles both new insert and conflict)
        const { data, error } = await supabase
          .from("ghg_reports")
          .upsert(draftData, { onConflict: "company_id,reference_year" })
          .select("id")
          .single();
        if (error) {
          console.error("[GHG autosave] upsert error:", error);
          setAutoSaveStatus("error");
          return;
        }
        if (data) {
          console.log("[GHG autosave] upserted report:", data.id);
          setReportId(data.id);
        }
      }
      setAutoSaveStatus("saved");
      setTimeout(() => setAutoSaveStatus((s) => (s === "saved" ? "idle" : s)), 2000);
    } catch (err) {
      console.error("[GHG autosave] exception:", err);
      setAutoSaveStatus("error");
    }
  }, [form, step, reportId, companyId, reportCode]);

  useEffect(() => {
    if (!formInitialized.current) {
      formInitialized.current = true;
      return;
    }
    setAutoSaveStatus("pending");
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      autoSave();
    }, 2000);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [form, step, autoSave]);

  // ─── Step validation ─────────────────────────────
  // Auto-save on step change
  const goToStep = useCallback(
    async (s: number) => {
      // Only warn when going forward — never block
      if (s > step) {
        setValidationWarning(null);
      }
      await saveToDb();
      setStep(s);
    },
    [saveToDb, step]
  );

  // ─── Update helpers ───────────────────────────────
  const updateForm = <K extends keyof GhgFormData>(key: K, value: GhgFormData[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (reportSaved) setReportSaved(false);
    if (editingCompleted) setEditingCompleted(false);
  };

  const updateStationary = (idx: number, patch: Partial<StationarySource>) => {
    setForm((prev) => ({
      ...prev,
      stationary_sources: prev.stationary_sources.map((s, i) => (i === idx ? { ...s, ...patch } : s)),
    }));
  };

  const updateVehicle = (idx: number, patch: Partial<FleetVehicle>) => {
    setForm((prev) => ({
      ...prev,
      fleet_vehicles: prev.fleet_vehicles.map((v, i) => (i === idx ? { ...v, ...patch } : v)),
    }));
  };

  const updateHfc = (idx: number, patch: Partial<HfcGas>) => {
    setForm((prev) => ({
      ...prev,
      hfc_gases: prev.hfc_gases.map((h, i) => (i === idx ? { ...h, ...patch } : h)),
    }));
  };

  const updatePod = (idx: number, patch: Partial<ElectricityPod>) => {
    setForm((prev) => ({
      ...prev,
      electricity_pods: prev.electricity_pods.map((p, i) => (i === idx ? { ...p, ...patch } : p)),
    }));
  };

  const updateEntity = (idx: number, patch: Partial<OrganizationalEntity>) => {
    setForm((prev) => ({
      ...prev,
      entities: prev.entities.map((e, i) => (i === idx ? { ...e, ...patch } : e)),
    }));
  };

  const updateMonthly = (
    arr: "stationary_sources" | "electricity_pods",
    idx: number,
    monthIdx: number,
    value: number
  ) => {
    setForm((prev) => {
      const list = [...prev[arr]];
      const item = { ...list[idx], monthly: [...list[idx].monthly] };
      item.monthly[monthIdx] = value;
      list[idx] = item;
      return { ...prev, [arr]: list };
    });
  };

  // ─── Calculate summary for review ─────────────────
  function computeSummary() {
    const rows: {
      source: string;
      scope: string;
      quantity: number;
      unit: string;
      ef: number;
      efUnit: string;
      tco2e: number;
      uncertainty: number;
    }[] = [];

    form.stationary_sources.forEach((s) => {
      const total = s.monthly.reduce((a, b) => a + (b || 0), 0);
      const stdEf = getStandardEf("stazionario", s.fuel_type);
      const ef = s.ef_mode === "custom" && s.ef_value != null ? s.ef_value : stdEf.value;
      const efUnc = s.ef_mode === "custom" ? 5 : stdEf.uncertainty;
      const fuelLabel = STATIONARY_FUEL_OPTIONS.find((f) => f.value === s.fuel_type)?.label || s.fuel_type;
      const isBio = BIOGENIC_FUELS.has(s.fuel_type);
      rows.push({
        source: `${fuelLabel} — ${s.source_name || "Fonte"}${isBio ? " [Biogenico]" : ""}`,
        scope: isBio ? "Biogenico" : "Scope 1",
        quantity: total,
        unit: s.unit,
        ef,
        efUnit: stdEf.unit,
        tco2e: calcTco2e(total, ef),
        uncertainty: calcUncertainty(s.data_quality, efUnc),
      });
    });

    form.fleet_vehicles.forEach((v) => {
      const isElectric = v.fuel_type === "electric_car_it";
      const vc = getVehicleCalc(v);
      const ef = v.ef_mode === "custom" && v.ef_value != null ? v.ef_value : vc.ef.value;
      const efUnc = v.ef_mode === "custom" ? 5 : vc.ef.uncertainty;
      const fuelLabel = FUEL_TYPE_OPTIONS.find((o) => o.value === v.fuel_type)?.label ?? v.fuel_type;
      rows.push({
        source: `${fuelLabel} — ${v.plate || "Veicolo"}`,
        scope: isElectric ? "Scope 2" : "Scope 1",
        quantity: vc.quantity,
        unit: vc.method === "km" ? "km" : "litri",
        ef,
        efUnit: vc.ef.unit,
        tco2e: calcTco2e(vc.quantity, ef),
        uncertainty: calcUncertainty(v.data_quality, efUnc),
      });
    });

    form.hfc_gases.forEach((h) => {
      const stdEf = getStandardEf("hfc", h.gas_name);
      const ef = h.ef_mode === "custom" && h.ef_value != null ? h.ef_value : stdEf.value;
      const efUnc = h.ef_mode === "custom" ? 10 : stdEf.uncertainty;
      const kg = h.kg_annual || 0;
      rows.push({
        source: `HFC — ${h.gas_name}`,
        scope: "Scope 1",
        quantity: kg,
        unit: "kg",
        ef,
        efUnit: "tCO₂e/kg",
        tco2e: calcTco2e(kg, ef),
        uncertainty: calcUncertainty(h.data_quality, efUnc),
      });
    });

    form.electricity_pods.forEach((p) => {
      const totalConsumo = p.monthly.reduce((a, b) => a + (b || 0), 0);
      const autocons = Math.min(p.fv_autoconsumato_kwh || 0, totalConsumo);
      const qty = Math.max(0, totalConsumo - autocons);
      const stdEf = getStandardEf("elettricita", p.country);
      const ef = p.ef_mode === "custom" && p.ef_value != null ? p.ef_value : stdEf.value;
      const efUnc = p.ef_mode === "custom" ? 5 : stdEf.uncertainty;
      const locationTco2e = calcTco2e(qty, ef);
      const marketTco2e = calcMarketEmissions(p, qty, ef, totalConsumo);
      const siteLabel = p.site_name || p.pod_code || "Sede";
      const countryLabel = COUNTRY_EF_OPTIONS.find((o) => o.value === p.country)?.label || p.country;
      rows.push({
        source: `Elettricità — ${siteLabel} (${countryLabel}) [Location]`,
        scope: "Scope 2",
        quantity: qty,
        unit: "kWh",
        ef,
        efUnit: stdEf.unit,
        tco2e: locationTco2e,
        uncertainty: calcUncertainty(p.data_quality, efUnc),
      });
      {
        rows.push({
          source: `Elettricità — ${siteLabel} (${countryLabel}) [Market]`,
          scope: "Scope 2",
          quantity: qty,
          unit: "kWh",
          ef: marketTco2e / (qty || 1),
          efUnit: stdEf.unit,
          tco2e: marketTco2e,
          uncertainty: calcUncertainty(p.data_quality, efUnc),
        });
      }
    });

    return rows;
  }

  // ─── Render ───────────────────────────────────────
  const STEPS = [
    "Contesto ISO",
    "Perimetro",
    "Comb. stazionaria",
    "Comb. mobile",
    "HFC refrigeranti",
    "Elettricità",
    "Revisione",
  ];
  const TOTAL_STEPS = STEPS.length;

  return (
    <div className="space-y-6" style={{ fontFamily: "Arial, sans-serif" }}>
      {/* Draft resume banner */}
      {draftBanner?.show && (
        <div className="bg-green-50 border border-green-300 rounded-lg px-4 py-3 flex items-center justify-between">
          <p className="text-sm text-green-800">
            Hai una bozza {draftBanner.code || `anno ${draftBanner.formData.year}`} salvata (step {draftBanner.stepReached}/6) — vuoi riprenderla?
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setForm(draftBanner.formData);
                setStep(draftBanner.stepReached);
                setReportId(draftBanner.draftId);
                if (draftBanner.code) setReportCode(draftBanner.code);
                setDraftBanner(null);
                formInitialized.current = false;
                setTimeout(() => { formInitialized.current = true; }, 100);
              }}
              className="text-white px-3 py-1.5 rounded-md text-sm font-medium"
              style={{ backgroundColor: GHG_GREEN }}
            >
              Riprendi bozza
            </button>
            <button
              type="button"
              onClick={() => setDraftBanner(null)}
              className="border border-gray-300 text-gray-600 px-3 py-1.5 rounded-md text-sm hover:bg-gray-50"
            >
              Inizia da capo
            </button>
          </div>
        </div>
      )}

      {/* Edit completed report warning */}
      {editingCompleted && (
        <div className="bg-amber-50 border border-amber-300 rounded-lg px-4 py-3 text-sm text-amber-800">
          Stai modificando un report completato — le modifiche riporteranno lo stato a Bozza fino al nuovo salvataggio definitivo
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--primary)]">
            Calcolo GHG — {companyName}
          </h1>
          {reportCode && <p className="text-xs text-[var(--muted)]">{reportCode}</p>}
          <p className="text-sm text-[var(--muted)] mt-1">
            Anno {form.year} · Step {step}/6
            {lastSaved && (
              <span className="ml-3">
                Salvato: {lastSaved.toLocaleTimeString("it-IT")}
              </span>
            )}
            {saving && <span className="ml-3 text-[#27AE60]">Salvataggio...</span>}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Autosave indicator */}
          {autoSaveStatus === "pending" && (
            <span className="text-xs text-gray-400">Salvataggio...</span>
          )}
          {autoSaveStatus === "saving" && (
            <span className="text-xs text-gray-400">Salvataggio...</span>
          )}
          {autoSaveStatus === "saved" && (
            <span className="text-xs text-green-600">💾 Salvato</span>
          )}
          {autoSaveStatus === "error" && (
            <span className="text-xs text-red-600">⚠️ Errore</span>
          )}
          <Link
            href={`/clients/${companyId}`}
            className="border border-[var(--border)] text-[var(--muted)] px-4 py-2 rounded-md text-sm hover:bg-gray-50 transition-colors"
          >
            ← Torna alla scheda cliente
          </Link>
        </div>
      </div>

      {/* Breadcrumb */}
      <nav className="text-xs text-[var(--muted)] flex items-center gap-1 -mt-4">
        <Link href="/clients" className="hover:underline">Clienti</Link>
        <span>&gt;</span>
        <Link href={`/clients/${companyId}`} className="hover:underline">{companyName || "Cliente"}</Link>
        <span>&gt;</span>
        <span className="text-[var(--foreground)]">Calcolo GHG {form.year}{reportCode && ` · ${reportCode}`}</span>
      </nav>

      {/* Step indicators */}
      <div className="flex gap-1">
        {STEPS.map((s, i) => (
          <button
            key={i}
            onClick={() => goToStep(i + 1)}
            className={`flex-1 py-2 text-xs font-medium rounded-md transition-colors ${
              step === i + 1
                ? "text-white"
                : "bg-gray-100 text-gray-500 hover:bg-gray-200"
            }`}
            style={step === i + 1 ? { backgroundColor: GHG_GREEN } : {}}
          >
            {i + 1}. {s}
          </button>
        ))}
      </div>

      {/* Step 1: Contesto inventario ISO 14064-1 */}
      {step === 1 && (
        <StepCard title="Step 1 — Contesto inventario ISO 14064-1">
          <p className="text-xs text-[var(--muted)] mb-4">
            Questi campi alimentano i capitoli 1, 2 e 3 del report ISO 14064-1:2019.
            I campi con <span className="text-xs bg-green-100 text-green-800 px-1 rounded">ISO</span> sono richiesti per la certificazione.
          </p>

          {/* CAMPO 1 — Anno di riferimento */}
          <div>
            <label className="text-sm font-medium text-[var(--foreground)] mb-1.5 flex items-center gap-2">
              Anno di riferimento baseline <span className="text-red-400">*</span>
              <span className="text-[10px] bg-green-100 text-green-800 px-1.5 py-0.5 rounded font-mono">ISO §6.4.1</span>
            </label>
            <select
              value={form.reference_year ?? form.year}
              onChange={(e) => updateForm("reference_year", Number(e.target.value))}
              className="w-full max-w-xs border border-[var(--border)] rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#27AE60]/30 focus:border-[#27AE60]"
            >
              {Array.from({ length: new Date().getFullYear() - 2014 }, (_, i) => new Date().getFullYear() - i).map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
            <p className="text-xs text-[var(--muted)] mt-1.5">
              Prima annualità? Seleziona l&apos;anno corrente — diventerà il tuo baseline per tutti i confronti futuri.
            </p>
          </div>

          {/* CAMPO 2 — Motivazione anno di riferimento */}
          <div>
            <label className="text-sm font-medium text-[var(--foreground)] mb-1.5 flex items-center gap-2">
              Motivazione scelta anno di riferimento <span className="text-red-400">*</span>
              <span className="text-[10px] bg-green-100 text-green-800 px-1.5 py-0.5 rounded font-mono">ISO §6.4.1</span>
            </label>
            <textarea
              value={form.reference_year_rationale}
              onChange={(e) => updateForm("reference_year_rationale", e.target.value.slice(0, 300))}
              rows={2}
              maxLength={300}
              className="w-full border border-[var(--border)] rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#27AE60]/30 focus:border-[#27AE60] resize-none"
            />
            <p className="text-xs text-[var(--muted)] mt-0.5 text-right">{form.reference_year_rationale.length}/300</p>
          </div>

          {/* CAMPO 3 — Approccio di consolidamento */}
          <div>
            <label className="text-sm font-medium text-[var(--foreground)] mb-2 flex items-center gap-2">
              Approccio di consolidamento
              <span className="text-[10px] bg-green-100 text-green-800 px-1.5 py-0.5 rounded font-mono">ISO §5.1</span>
            </label>
            <div className="space-y-2">
              {([
                { value: "operational", label: "Controllo operativo", desc: "Contabilizza tutte le emissioni delle installazioni su cui hai piena autorità operativa (consigliato per PMI)" },
                { value: "financial", label: "Controllo finanziario", desc: "Per gruppi societari con controllate consolidate nel bilancio" },
                { value: "equity_share", label: "Equa ripartizione", desc: "Per joint venture o consorzi — emissioni proporzionali alla quota" },
              ] as const).map((opt) => (
                <label
                  key={opt.value}
                  className={`flex items-start gap-3 border rounded-md px-3 py-2.5 cursor-pointer transition-colors ${
                    form.consolidation_approach === opt.value
                      ? "border-[#27AE60] bg-[#27AE60]/5"
                      : "border-[var(--border)] hover:bg-gray-50"
                  }`}
                >
                  <input
                    type="radio"
                    name="iso_consolidation_approach"
                    value={opt.value}
                    checked={form.consolidation_approach === opt.value}
                    onChange={() => updateForm("consolidation_approach", opt.value as ConsolidationApproach)}
                    className="mt-0.5 accent-[#27AE60]"
                  />
                  <div>
                    <span className="text-sm font-medium text-[var(--foreground)]">{opt.label}</span>
                    <p className="text-xs text-[var(--muted)] mt-0.5">{opt.desc}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* CAMPO 4 — Installazioni */}
          <div>
            <label className="text-sm font-medium text-[var(--foreground)] mb-2 flex items-center gap-2">
              Installazioni incluse nell&apos;inventario
              <span className="text-[10px] bg-green-100 text-green-800 px-1.5 py-0.5 rounded font-mono">ISO §5.1</span>
            </label>
            <p className="text-xs text-[var(--muted)] mb-2">Elenca tutti i siti/stabilimenti inclusi nei confini organizzativi.</p>
            <div className="space-y-2">
              {form.installations.map((inst, ii) => (
                <div key={ii} className="flex gap-2 items-start">
                  <input
                    type="text"
                    value={inst.name}
                    onChange={(e) => {
                      const next = [...form.installations];
                      next[ii] = { ...next[ii], name: e.target.value };
                      updateForm("installations", next);
                    }}
                    placeholder="Nome installazione"
                    className="flex-1 border border-[var(--border)] rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#27AE60]/30 focus:border-[#27AE60]"
                  />
                  <input
                    type="text"
                    value={inst.address}
                    onChange={(e) => {
                      const next = [...form.installations];
                      next[ii] = { ...next[ii], address: e.target.value };
                      updateForm("installations", next);
                    }}
                    placeholder="Indirizzo"
                    className="flex-1 border border-[var(--border)] rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#27AE60]/30 focus:border-[#27AE60]"
                  />
                  {form.installations.length > 1 && (
                    <button
                      type="button"
                      onClick={() => updateForm("installations", form.installations.filter((_, i) => i !== ii))}
                      className="text-red-500 text-xs hover:underline mt-2"
                    >
                      Rimuovi
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => updateForm("installations", [...form.installations, { name: "", address: "" }])}
              className="mt-2 text-sm font-medium hover:underline"
              style={{ color: GHG_GREEN }}
            >
              + Aggiungi installazione
            </button>
          </div>

          {/* CAMPO 5 — Stato verifica */}
          <div>
            <label className="text-sm font-medium text-[var(--foreground)] mb-1.5 flex items-center gap-2">
              Stato verifica indipendente
              <span className="text-[10px] bg-green-100 text-green-800 px-1.5 py-0.5 rounded font-mono">ISO §9.3.1s</span>
            </label>
            <select
              value={form.verification_status}
              onChange={(e) => updateForm("verification_status", e.target.value as VerificationStatus)}
              className="w-full max-w-md border border-[var(--border)] rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#27AE60]/30 focus:border-[#27AE60]"
            >
              <option value="non_verificato">Non verificato — inventario non sottoposto a verifica indipendente</option>
              <option value="verifica_limitata">Verifica con garanzia limitata (limited assurance)</option>
              <option value="verifica_ragionevole">Verifica con garanzia ragionevole (reasonable assurance)</option>
            </select>
          </div>

          {/* CAMPO 6 — Organismo di verifica */}
          {form.verification_status !== "non_verificato" && (
            <div>
              <label className="text-sm font-medium text-[var(--foreground)] mb-1.5 block">
                Organismo di verifica (nome ente accreditato ISO 14065)
              </label>
              <input
                type="text"
                value={form.verification_body}
                onChange={(e) => updateForm("verification_body", e.target.value)}
                placeholder="es. Bureau Veritas, DNV, TÜV..."
                className="w-full max-w-md border border-[var(--border)] rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#27AE60]/30 focus:border-[#27AE60]"
              />
            </div>
          )}

          {/* CAMPO 7 — Scopo inventario */}
          <div>
            <label className="text-sm font-medium text-[var(--foreground)] mb-2 flex items-center gap-2">
              Scopo dell&apos;inventario GHG
              <span className="text-[10px] bg-green-100 text-green-800 px-1.5 py-0.5 rounded font-mono">ISO §3.4.6</span>
            </label>
            <div className="space-y-1.5">
              {([
                { value: "rendicontazione_volontaria", label: "Rendicontazione volontaria" },
                { value: "supply_chain", label: "Richiesta da cliente/supply chain" },
                { value: "bando_finanziamento", label: "Bando o finanziamento" },
                { value: "verifica_terza_parte", label: "Preparazione verifica terza parte" },
                { value: "vsme_reporting", label: "Rendicontazione VSME/ESG" },
                { value: "altro", label: "Altro" },
              ] as const).map((opt) => (
                <label key={opt.value} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.inventory_purpose.includes(opt.value)}
                    onChange={(e) => {
                      const next = e.target.checked
                        ? [...form.inventory_purpose, opt.value]
                        : form.inventory_purpose.filter((v) => v !== opt.value);
                      updateForm("inventory_purpose", next);
                    }}
                    className="accent-[#27AE60]"
                  />
                  <span>{opt.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* ── Impostazioni avanzate (collassabile) ── */}
          <details className="border border-gray-200 rounded-lg overflow-hidden">
            <summary className="px-4 py-3 bg-gray-50 text-sm font-medium cursor-pointer hover:bg-gray-100">
              Impostazioni avanzate — Categorie 3-6 e criteri di materialità
            </summary>
            <div className="px-4 py-4 space-y-5">

              {/* CAMPO 8 — Categorie 3-6 */}
              <div>
                <label className="text-sm font-medium text-[var(--foreground)] mb-1 flex items-center gap-2">
                  Categorie emissioni indirette
                  <span className="text-[10px] bg-green-100 text-green-800 px-1.5 py-0.5 rounded font-mono">ISO §5.2.4</span>
                </label>
                <p className="text-xs text-[var(--muted)] mb-3">
                  La norma richiede di documentare il perché ogni categoria è inclusa o esclusa dall&apos;inventario.
                </p>

                <div className="space-y-4">
                  {([
                    { key: "3", label: "Cat. 3 — Trasporti", desc: "es. pendolarismo, trasporti merci a monte/valle" },
                    { key: "4", label: "Cat. 4 — Prodotti acquistati", desc: "merci, servizi, beni investimento" },
                    { key: "5", label: "Cat. 5 — Uso prodotti dell'organizzazione", desc: "fase d'uso, fine vita" },
                    { key: "6", label: "Cat. 6 — Altre fonti indirette", desc: "" },
                  ] as const).map((cat) => {
                    const statusKey = `category_${cat.key}_status` as keyof GhgFormData;
                    const rationaleKey = `category_${cat.key}_rationale` as keyof GhgFormData;
                    return (
                      <div key={cat.key} className="border border-gray-100 rounded-lg p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="text-sm font-medium">{cat.label}</span>
                            {cat.desc && <span className="text-xs text-[var(--muted)] ml-2">({cat.desc})</span>}
                          </div>
                          <select
                            value={form[statusKey] as string}
                            onChange={(e) => updateForm(statusKey, e.target.value as CategoryStatus)}
                            className="border border-[var(--border)] rounded-md px-2 py-1 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-[#006450]/30"
                          >
                            <option value="non_rendicontato">Non rendicontato</option>
                            <option value="significativo">Significativo</option>
                            <option value="non_significativo_documentato">Non significativo (documentato)</option>
                          </select>
                        </div>
                        <textarea
                          value={form[rationaleKey] as string}
                          onChange={(e) => updateForm(rationaleKey, e.target.value)}
                          rows={2}
                          placeholder="Motivazione inclusione/esclusione..."
                          className="w-full border border-[var(--border)] rounded-md px-3 py-2 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-[#27AE60]/30 focus:border-[#27AE60] resize-none"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* CAMPO 9 — Criteri di materialità */}
              <div>
                <label className="text-sm font-medium text-[var(--foreground)] mb-1.5 flex items-center gap-2">
                  Criteri di materialità per emissioni indirette
                  <span className="text-[10px] bg-green-100 text-green-800 px-1.5 py-0.5 rounded font-mono">ISO §5.2.3</span>
                </label>
                <textarea
                  value={form.materiality_criteria}
                  onChange={(e) => updateForm("materiality_criteria", e.target.value.slice(0, 500))}
                  rows={3}
                  maxLength={500}
                  className="w-full border border-[var(--border)] rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#27AE60]/30 focus:border-[#27AE60] resize-none"
                />
                <p className="text-xs text-[var(--muted)] mt-0.5 text-right">{form.materiality_criteria.length}/500</p>
              </div>

            </div>
          </details>
        </StepCard>
      )}

      {/* Step 2: Perimetro */}
      {step === 2 && (
        <StepCard title="Step 2 — Perimetro del report">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-[var(--foreground)] mb-1.5 block">
                Anno di riferimento <span className="text-red-400">*</span>
              </label>
              <input
                type="number"
                value={form.year}
                onChange={(e) => updateForm("year", Number(e.target.value))}
                min={2015}
                max={2099}
                className="w-full border border-[var(--border)] rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#27AE60]/30 focus:border-[#27AE60]"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-[var(--foreground)] mb-1.5 block">
                Tipo perimetro <span className="text-red-400">*</span>
              </label>
              <select
                value={form.perimeter}
                onChange={(e) => updateForm("perimeter", e.target.value as "individuale" | "consolidato")}
                className="w-full border border-[var(--border)] rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#27AE60]/30 focus:border-[#27AE60]"
              >
                {PERIMETER_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Anno base — ISO 14064-1 §5.3 */}
          <div>
            <label className="text-sm font-medium text-[var(--foreground)] mb-1.5 block">
              Anno base <span className="text-red-400">*</span>
            </label>
            <input
              type="number"
              value={form.base_year}
              onChange={(e) => updateForm("base_year", Number(e.target.value))}
              min={2000}
              max={form.year}
              className="w-full max-w-xs border border-[var(--border)] rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#27AE60]/30 focus:border-[#27AE60]"
            />

            {form.base_year === form.year ? (
              <p className="text-xs text-[var(--muted)] mt-2 italic">
                Primo anno di rendicontazione — nessun ricalcolo necessario
              </p>
            ) : (
              <div className="mt-3 space-y-2">
                <label className="text-xs font-medium text-[var(--foreground)] block">
                  Condizioni di ricalcolo dell&apos;anno base
                </label>
                {[
                  "Acquisizione o dismissione di società/asset",
                  "Cambiamento significativo del perimetro organizzativo",
                  "Cambiamento della metodologia di calcolo",
                  "Errore materiale nell'inventario precedente",
                ].map((cond) => (
                  <label key={cond} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.base_year_recalculation.includes(cond)}
                      onChange={(e) => {
                        const next = e.target.checked
                          ? [...form.base_year_recalculation, cond]
                          : form.base_year_recalculation.filter((c) => c !== cond);
                        updateForm("base_year_recalculation", next);
                      }}
                      className="accent-[#27AE60]"
                    />
                    <span className="text-[var(--foreground)]">{cond}</span>
                  </label>
                ))}
                <label className="flex items-start gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.base_year_recalculation.includes("altro")}
                    onChange={(e) => {
                      const next = e.target.checked
                        ? [...form.base_year_recalculation, "altro"]
                        : form.base_year_recalculation.filter((c) => c !== "altro");
                      updateForm("base_year_recalculation", next);
                      if (!e.target.checked) updateForm("base_year_recalculation_notes", "");
                    }}
                    className="accent-[#27AE60] mt-0.5"
                  />
                  <span className="text-[var(--foreground)]">Altro</span>
                </label>
                {form.base_year_recalculation.includes("altro") && (
                  <input
                    type="text"
                    value={form.base_year_recalculation_notes}
                    onChange={(e) => updateForm("base_year_recalculation_notes", e.target.value)}
                    placeholder="Specificare..."
                    className="w-full border border-[var(--border)] rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#27AE60]/30 focus:border-[#27AE60]"
                  />
                )}
              </div>
            )}

            <p className="text-xs text-[var(--muted)] mt-3 italic">
              L&apos;anno base è il riferimento per misurare i progressi nel tempo.
              Va ricalcolato se si verificano cambiamenti strutturali significativi — ISO 14064-1 §5.3
            </p>
          </div>

          {/* Approccio al perimetro — configurato in Step 1 */}
          <div className="bg-gray-50 rounded-md px-3 py-2">
            <span className="text-xs text-[var(--muted)]">Approccio di consolidamento (da Step 1): </span>
            <span className="text-sm font-medium">{CONSOLIDATION_APPROACH_OPTIONS.find((o) => o.value === form.consolidation_approach)?.label || "—"}</span>
          </div>

          {/* Entità nel perimetro — solo se Consolidato */}
          {form.perimeter === "consolidato" && (
            <div>
              <label className="text-sm font-medium text-[var(--foreground)] mb-2 block">
                Entità nel perimetro
              </label>

              <div className="space-y-3">
                {form.entities.map((ent, ei) => (
                  <div key={ei} className="border border-gray-200 rounded-lg p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-[var(--muted)]">Entità {ei + 1}</span>
                      <button
                        type="button"
                        onClick={() =>
                          updateForm("entities", form.entities.filter((_, i) => i !== ei))
                        }
                        className="text-red-500 text-xs hover:underline"
                      >
                        Rimuovi
                      </button>
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                      <div className="col-span-1">
                        <label className="text-xs font-medium text-[var(--foreground)] mb-1 block">
                          Nome società
                        </label>
                        <input
                          type="text"
                          value={ent.name}
                          onChange={(e) => updateEntity(ei, { name: e.target.value })}
                          placeholder="Ragione sociale"
                          className="w-full border border-[var(--border)] rounded-md px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#27AE60]/30 focus:border-[#27AE60]"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-[var(--foreground)] mb-1 block">
                          Quota proprietà %
                        </label>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step="any"
                          value={ent.ownership_pct}
                          onChange={(e) => updateEntity(ei, { ownership_pct: Number(e.target.value) || 0 })}
                          className="w-full border border-[var(--border)] rounded-md px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#27AE60]/30 focus:border-[#27AE60]"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-[var(--foreground)] mb-1 block">
                          Tipo controllo
                        </label>
                        <select
                          value={ent.control_type}
                          onChange={(e) => updateEntity(ei, { control_type: e.target.value as EntityControlType })}
                          className="w-full border border-[var(--border)] rounded-md px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#27AE60]/30 focus:border-[#27AE60]"
                        >
                          {ENTITY_CONTROL_TYPE_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <span className="text-xs font-medium text-[var(--foreground)]">Inclusa nel perimetro</span>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={ent.included}
                          onClick={() => updateEntity(ei, { included: !ent.included })}
                          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                            ent.included ? "bg-[#27AE60]" : "bg-gray-300"
                          }`}
                        >
                          <span
                            className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                              ent.included ? "translate-x-4" : "translate-x-0.5"
                            }`}
                          />
                        </button>
                        <span className="text-xs text-[var(--muted)]">
                          {ent.included ? "Sì" : "No"}
                        </span>
                      </label>
                    </div>

                    {!ent.included && (
                      <div>
                        <label className="text-xs font-medium text-[var(--foreground)] mb-1 block">
                          Motivazione esclusione
                        </label>
                        <input
                          type="text"
                          value={ent.exclusion_reason}
                          onChange={(e) => updateEntity(ei, { exclusion_reason: e.target.value })}
                          placeholder="es. Entità non materiale (<1% emissioni totali)"
                          className="w-full border border-[var(--border)] rounded-md px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#27AE60]/30 focus:border-[#27AE60]"
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={() => updateForm("entities", [...form.entities, newEntity()])}
                className="mt-2 text-sm font-medium hover:underline"
                style={{ color: GHG_GREEN }}
              >
                + Aggiungi entità
              </button>

              <p className="text-xs text-[var(--muted)] mt-3 italic">
                Le entità escluse devono essere documentate con motivazione
                e stima dell&apos;impatto secondo ISO 14064-1 §5.2.4
              </p>
            </div>
          )}

          <div>
            <label className="text-sm font-medium text-[var(--foreground)] mb-1.5 block">
              Società incluse nel perimetro
            </label>
            <textarea
              value={form.included_entities}
              onChange={(e) => updateForm("included_entities", e.target.value)}
              rows={3}
              placeholder="Elencare le società incluse nel perimetro di consolidamento"
              className="w-full border border-[var(--border)] rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#27AE60]/30 focus:border-[#27AE60] resize-none"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-[var(--foreground)] mb-1.5 block">
              Note
            </label>
            <textarea
              value={form.notes}
              onChange={(e) => updateForm("notes", e.target.value)}
              rows={3}
              placeholder="Note aggiuntive sul perimetro o esclusioni"
              className="w-full border border-[var(--border)] rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#27AE60]/30 focus:border-[#27AE60] resize-none"
            />
          </div>
        </StepCard>
      )}

      {/* Step 2: Combustione stazionaria */}
      {step === 3 && (
        <StepCard title="Step 3 — Scope 1: Combustione stazionaria">
          {validationWarning?.step === 3 && (
            <div className="bg-amber-50 border border-amber-200 rounded-md px-4 py-3 flex items-center justify-between mb-2">
              <p className="text-sm text-amber-800">{validationWarning.message}</p>
              <div className="flex gap-2">
                <button type="button" onClick={() => { setValidationWarning(null); goToStep(step + 1); }}
                  className="text-xs text-white px-3 py-1 rounded-md" style={{ backgroundColor: GHG_GREEN }}>
                  Continua →
                </button>
                <button type="button" onClick={() => setValidationWarning(null)}
                  className="text-xs text-amber-700 px-3 py-1 rounded-md border border-amber-300 hover:bg-amber-100">
                  Rimani qui
                </button>
              </div>
            </div>
          )}
          {form.stationary_sources.map((src, si) => {
            const showIncompleteWarning = si > 0 && !isStationaryEmpty(src) && !isStationaryComplete(src);
            const fuelOpt = STATIONARY_FUEL_OPTIONS.find((f) => f.value === src.fuel_type);
            const isBiogenic = BIOGENIC_FUELS.has(src.fuel_type);
            const total = src.monthly.reduce((a, b) => a + (b || 0), 0);
            const stdEf = getStandardEf("stazionario", src.fuel_type);
            const ef = src.ef_mode === "custom" && src.ef_value != null ? src.ef_value : stdEf.value;
            const tco2e = total * ef;

            return (
            <div key={si} className={`border rounded-lg p-4 space-y-4 ${showIncompleteWarning ? "border-yellow-300" : "border-gray-200"}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-[var(--foreground)]">
                    Fonte {si + 1}
                  </h3>
                  {showIncompleteWarning && (
                    <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full">
                      Incompleta — verrà ignorata nel calcolo
                    </span>
                  )}
                  {isBiogenic && (
                    <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">
                      Biogenico
                    </span>
                  )}
                </div>
                {form.stationary_sources.length > 1 && (
                  <button
                    type="button"
                    onClick={() =>
                      updateForm(
                        "stationary_sources",
                        form.stationary_sources.filter((_, i) => i !== si)
                      )
                    }
                    className="text-red-500 text-xs hover:underline"
                  >
                    Rimuovi
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-[var(--foreground)] mb-1.5 block">
                    Nome fonte
                  </label>
                  <input
                    type="text"
                    value={src.source_name}
                    onChange={(e) => updateStationary(si, { source_name: e.target.value })}
                    placeholder="es. Caldaia sede Milano"
                    className="w-full border border-[var(--border)] rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#27AE60]/30 focus:border-[#27AE60]"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-[var(--foreground)] mb-1.5 block">
                    Combustibile
                  </label>
                  <select
                    value={src.fuel_type}
                    onChange={(e) => {
                      const ft = e.target.value as StationaryFuelType;
                      const opt = STATIONARY_FUEL_OPTIONS.find((f) => f.value === ft);
                      updateStationary(si, { fuel_type: ft, unit: opt?.unit || "kg" });
                    }}
                    className="w-full border border-[var(--border)] rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#27AE60]/30 focus:border-[#27AE60]"
                  >
                    {STATIONARY_FUEL_GROUPS.map((g) => (
                      <optgroup key={g.label} label={g.label}>
                        {g.options.map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </div>
              </div>

              {/* Monthly inputs */}
              <div>
                <label className="text-sm font-medium text-[var(--foreground)] mb-2 block">
                  Consumi mensili ({fuelOpt?.unit || src.unit})
                </label>
                <div className="grid grid-cols-6 gap-2">
                  {MONTHS.map((m, mi) => (
                    <div key={mi}>
                      <label className="text-xs text-[var(--muted)] block mb-1">{m}</label>
                      <input
                        type="number"
                        min={0}
                        step="any"
                        value={src.monthly[mi] || ""}
                        onChange={(e) =>
                          updateMonthly("stationary_sources", si, mi, Number(e.target.value) || 0)
                        }
                        className="w-full border border-[var(--border)] rounded-md px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#27AE60]/30 focus:border-[#27AE60]"
                      />
                    </div>
                  ))}
                </div>
                <p className="text-xs text-[var(--muted)] mt-2">
                  Totale annuo: {total.toLocaleString("it-IT")} {fuelOpt?.unit || src.unit}
                  {total > 0 && <> · <strong>{itN(tco2e, 4)} tCO₂e</strong></>}
                </p>
                {(() => {
                  const gb = calcGasBreakdown(src.fuel_type, total);
                  return gb.hasDetail && total > 0 ? (
                    <p className="text-[10px] text-[var(--muted)]">
                      ↳ CO₂: {itN(gb.co2, 3)} | CH₄: {itN(gb.ch4, 3)} | N₂O: {itN(gb.n2o, 3)} tCO₂e
                    </p>
                  ) : null;
                })()}
              </div>

              {isBiogenic && total > 0 && (
                <div className="bg-orange-50 border border-orange-200 rounded-md px-3 py-2 text-xs text-orange-800 space-y-1">
                  <p>Emissioni biogeniche: <strong>{itN(tco2e, 4)} tCO₂e</strong> (informativo — non in inventario fossile)</p>
                  <p className="italic">ISO 14064-1 §6.5 — le emissioni biogeniche vanno riportate separatamente</p>
                </div>
              )}

              <QualityAndEf
                dataQuality={src.data_quality}
                efMode={src.ef_mode}
                efValue={src.ef_value}
                efReference={src.ef_reference}
                standardEf={stdEf}
                onChangeQuality={(v) => updateStationary(si, { data_quality: v })}
                onChangeEfMode={(v) => updateStationary(si, { ef_mode: v })}
                onChangeEfValue={(v) => updateStationary(si, { ef_value: v })}
                onChangeEfReference={(v) => updateStationary(si, { ef_reference: v })}
                sourceType="stationary"
                fuelType={src.fuel_type}
              />
            </div>
            );
          })}

          <button
            type="button"
            onClick={() => updateForm("stationary_sources", [...form.stationary_sources, newStationarySource()])}
            className="text-sm font-medium hover:underline"
            style={{ color: GHG_GREEN }}
          >
            + Aggiungi fonte
          </button>
        </StepCard>
      )}

      {/* Step 3: Combustione mobile */}
      {step === 4 && (
        <StepCard title="Step 4 — Scope 1: Combustione mobile">
          {form.fleet_vehicles.length === 0 && (
            <p className="text-sm text-[var(--muted)]">
              Nessun veicolo inserito. Aggiungi un veicolo per calcolare le emissioni da trasporto.
            </p>
          )}

          {form.fleet_vehicles.map((v, vi) => {
            const showVehicleWarning = vi > 0 && !isVehicleEmpty(v) && !isVehicleComplete(v);
            return (
            <div key={vi} className={`border rounded-lg p-4 space-y-4 ${showVehicleWarning ? "border-yellow-300" : "border-gray-200"}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-[var(--foreground)]">
                    Veicolo {vi + 1}
                  </h3>
                  {showVehicleWarning && (
                    <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full">
                      Incompleto — verrà ignorato nel calcolo
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() =>
                    updateForm(
                      "fleet_vehicles",
                      form.fleet_vehicles.filter((_, i) => i !== vi)
                    )
                  }
                  className="text-red-500 text-xs hover:underline"
                >
                  Rimuovi
                </button>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <label className="text-sm font-medium text-[var(--foreground)] mb-1.5 block">
                    Targa
                  </label>
                  <input
                    type="text"
                    value={v.plate}
                    onChange={(e) => updateVehicle(vi, { plate: e.target.value.toUpperCase() })}
                    placeholder="AA000BB"
                    className="w-full border border-[var(--border)] rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#27AE60]/30 focus:border-[#27AE60]"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-[var(--foreground)] mb-1.5 block">
                    Tipo mezzo / Motorizzazione
                  </label>
                  <select
                    value={v.fuel_type}
                    onChange={(e) => updateVehicle(vi, { fuel_type: e.target.value as FuelType })}
                    className="w-full border border-[var(--border)] rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#27AE60]/30 focus:border-[#27AE60]"
                  >
                    {MOBILE_FUEL_GROUPS.map((g) => (
                      <optgroup key={g.label} label={g.label}>
                        {g.options.map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </div>
                {v.fuel_type === "electric_car_it" ? (
                  <>
                    <div>
                      <label className="text-sm font-medium text-[var(--foreground)] mb-1.5 block">
                        km percorsi annui
                      </label>
                      <input
                        type="number"
                        min={0}
                        step="any"
                        value={v.km_annual ?? ""}
                        onChange={(e) =>
                          updateVehicle(vi, {
                            km_annual: e.target.value ? Number(e.target.value) : null,
                          })
                        }
                        className="w-full border border-[var(--border)] rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#27AE60]/30 focus:border-[#27AE60]"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-[var(--foreground)] mb-1.5 block">
                        kWh annui (alternativo)
                      </label>
                      <input
                        type="number"
                        min={0}
                        step="any"
                        value={v.liters_annual ?? ""}
                        onChange={(e) =>
                          updateVehicle(vi, {
                            liters_annual: e.target.value ? Number(e.target.value) : null,
                          })
                        }
                        placeholder="kWh consumati"
                        className="w-full border border-[var(--border)] rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#27AE60]/30 focus:border-[#27AE60]"
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <label className="text-sm font-medium text-[var(--foreground)] mb-1.5 block">
                        Litri annui
                      </label>
                      <input
                        type="number"
                        min={0}
                        step="any"
                        value={v.liters_annual ?? ""}
                        onChange={(e) =>
                          updateVehicle(vi, {
                            liters_annual: e.target.value ? Number(e.target.value) : null,
                          })
                        }
                        className="w-full border border-[var(--border)] rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#27AE60]/30 focus:border-[#27AE60]"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-[var(--foreground)] mb-1.5 block">
                        Km annui (alternativo)
                      </label>
                      <input
                        type="number"
                        min={0}
                        step="any"
                        value={v.km_annual ?? ""}
                        onChange={(e) =>
                          updateVehicle(vi, {
                            km_annual: e.target.value ? Number(e.target.value) : null,
                          })
                        }
                        className="w-full border border-[var(--border)] rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#27AE60]/30 focus:border-[#27AE60]"
                      />
                    </div>
                  </>
                )}
              </div>

              {v.fuel_type === "electric_car_it" && (
                <div className="bg-blue-50 border border-blue-200 rounded-md px-4 py-3 text-sm text-blue-800">
                  Scope 1 = 0. Le emissioni sono conteggiate in Scope 2 (elettricità) tramite il fattore del mix italiano: 0.000050 tCO₂e/km
                </div>
              )}

              {/* Calculation method indicator + gas breakdown */}
              {(() => {
                const vc = getVehicleCalc(v);
                if (vc.quantity <= 0) return null;
                return (
                  <div className="space-y-0.5">
                    <p className="text-[10px] text-[var(--muted)]">
                      Calcolo basato su {vc.method === "km" ? "km percorsi" : "litri"}
                      {vc.method === "km" && ` (${vc.ef.value} ${vc.ef.unit})`}
                    </p>
                    {v.fuel_type !== "electric_car_it" && vc.method === "litri" && (() => {
                      const gb = calcGasBreakdown(v.fuel_type, vc.quantity);
                      return gb.hasDetail ? (
                        <p className="text-[10px] text-[var(--muted)]">
                          ↳ CO₂: {itN(gb.co2, 3)} | CH₄: {itN(gb.ch4, 3)} | N₂O: {itN(gb.n2o, 3)} tCO₂e
                        </p>
                      ) : null;
                    })()}
                  </div>
                );
              })()}

              <div>
                <label className="text-sm font-medium text-[var(--foreground)] mb-1.5 block">
                  Categoria uso
                </label>
                <select
                  value={v.usage_category}
                  onChange={(e) =>
                    updateVehicle(vi, { usage_category: e.target.value as UsageCategory })
                  }
                  className="w-full max-w-xs border border-[var(--border)] rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#27AE60]/30 focus:border-[#27AE60]"
                >
                  {USAGE_CATEGORY_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>

              <QualityAndEf
                dataQuality={v.data_quality}
                efMode={v.ef_mode}
                efValue={v.ef_value}
                efReference={v.ef_reference}
                standardEf={getStandardEf("carburante", v.fuel_type)}
                onChangeQuality={(val) => updateVehicle(vi, { data_quality: val })}
                onChangeEfMode={(val) => updateVehicle(vi, { ef_mode: val })}
                onChangeEfValue={(val) => updateVehicle(vi, { ef_value: val })}
                onChangeEfReference={(val) => updateVehicle(vi, { ef_reference: val })}
                sourceType="mobile"
                fuelType={v.fuel_type}
              />
            </div>
            );
          })}

          <button
            type="button"
            onClick={() =>
              updateForm("fleet_vehicles", [...form.fleet_vehicles, newVehicle()])
            }
            className="text-sm font-medium hover:underline"
            style={{ color: GHG_GREEN }}
          >
            + Aggiungi veicolo
          </button>
        </StepCard>
      )}

      {/* Step 4: HFC refrigeranti */}
      {step === 5 && (
        <StepCard title="Step 5 — Scope 1: HFC refrigeranti">
          {form.hfc_gases.length === 0 && (
            <p className="text-sm text-[var(--muted)]">
              Nessun gas refrigerante inserito. Aggiungi un gas se l&apos;azienda utilizza impianti di climatizzazione o refrigerazione.
            </p>
          )}

          {form.hfc_gases.map((h, hi) => (
            <div key={hi} className="border border-gray-200 rounded-lg p-4 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-[var(--foreground)]">
                  Gas {hi + 1}
                </h3>
                <button
                  type="button"
                  onClick={() =>
                    updateForm(
                      "hfc_gases",
                      form.hfc_gases.filter((_, i) => i !== hi)
                    )
                  }
                  className="text-red-500 text-xs hover:underline"
                >
                  Rimuovi
                </button>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-[var(--foreground)] mb-1.5 block">
                    Tipo gas
                  </label>
                  <select
                    value={h.gas_name}
                    onChange={(e) => updateHfc(hi, { gas_name: e.target.value })}
                    className="w-full border border-[var(--border)] rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#27AE60]/30 focus:border-[#27AE60]"
                  >
                    {HFC_GAS_GROUPS.map((group) => (
                      <optgroup key={group.label} label={group.label}>
                        {group.options.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label} (GWP: {o.gwp})
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium text-[var(--foreground)] mb-1.5 block">
                    kg totali annui (ricariche)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step="any"
                    value={h.kg_annual ?? ""}
                    onChange={(e) =>
                      updateHfc(hi, {
                        kg_annual: e.target.value ? Number(e.target.value) : null,
                      })
                    }
                    className="w-full border border-[var(--border)] rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#27AE60]/30 focus:border-[#27AE60]"
                  />
                </div>
              </div>

              <QualityAndEf
                dataQuality={h.data_quality}
                efMode={h.ef_mode}
                efValue={h.ef_value}
                efReference={h.ef_reference}
                standardEf={getStandardEf("hfc", h.gas_name)}
                onChangeQuality={(val) => updateHfc(hi, { data_quality: val })}
                onChangeEfMode={(val) => updateHfc(hi, { ef_mode: val })}
                onChangeEfValue={(val) => updateHfc(hi, { ef_value: val })}
                onChangeEfReference={(val) => updateHfc(hi, { ef_reference: val })}
                sourceType="hfc"
                fuelType={h.gas_name}
              />
            </div>
          ))}

          <button
            type="button"
            onClick={() => updateForm("hfc_gases", [...form.hfc_gases, newHfc()])}
            className="text-sm font-medium hover:underline"
            style={{ color: GHG_GREEN }}
          >
            + Aggiungi gas refrigerante
          </button>
        </StepCard>
      )}

      {/* Step 5: Elettricità */}
      {step === 6 && (() => {
        // Pre-compute totals for footer
        const totalLocation = form.electricity_pods.reduce((sum, p) => {
          const tc = p.monthly.reduce((a, b) => a + (b || 0), 0);
          const ac = p.has_fv ? Math.min(p.fv_autoconsumato_kwh || 0, tc) : 0;
          const nkwh = Math.max(0, tc - ac);
          const pEf = p.ef_mode === "custom" && p.ef_value != null
            ? p.ef_value : getCountryEf(p.country).value;
          return sum + nkwh * pEf;
        }, 0);
        const totalMarket = form.electricity_pods.reduce((sum, p) => {
          const tc = p.monthly.reduce((a, b) => a + (b || 0), 0);
          const ac = p.has_fv ? Math.min(p.fv_autoconsumato_kwh || 0, tc) : 0;
          const nkwh = Math.max(0, tc - ac);
          const pEf = p.ef_mode === "custom" && p.ef_value != null
            ? p.ef_value : getCountryEf(p.country).value;
          return sum + calcMarketEmissions(p, nkwh, pEf, tc);
        }, 0);
        return (
        <StepCard title="Step 6 — Scope 2: Elettricità">
          <p className="text-xs text-[var(--muted)] -mt-2 mb-4 italic">
            Le emissioni elettricità sono Scope 2 (location-based).
            Per sedi estere viene usato il fattore nazionale IEA 2023.
          </p>

          {form.electricity_pods.map((pod, pi) => {
            const annualKwh = pod.monthly.reduce((a, b) => a + (b || 0), 0);
            const autocons = pod.has_fv ? Math.min(pod.fv_autoconsumato_kwh || 0, annualKwh) : 0;
            const netKwh = Math.max(0, annualKwh - autocons);
            const fvImmesso = pod.has_fv ? Math.max(0, (pod.fv_production_kwh || 0) - (pod.fv_autoconsumato_kwh || 0)) : 0;
            const countryOpt = COUNTRY_EF_OPTIONS.find((o) => o.value === pod.country);
            const stdEf = getCountryEf(pod.country);
            const ef = pod.ef_mode === "custom" && pod.ef_value != null ? pod.ef_value : stdEf.value;
            const locationSub = netKwh * ef;
            const marketSub = calcMarketEmissions(pod, netKwh, ef, annualKwh);
            const showPodWarning = pi > 0 && !isPodEmpty(pod) && !isPodComplete(pod);

            return (
            <div key={pi} className={`border rounded-lg p-4 space-y-4 ${showPodWarning ? "border-yellow-300" : "border-gray-200"}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-[var(--foreground)]">
                    Sede {pi + 1}
                  </h3>
                  {showPodWarning && (
                    <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full">
                      Incompleta — verrà ignorata nel calcolo
                    </span>
                  )}
                </div>
                {form.electricity_pods.length > 1 && (
                  <button
                    type="button"
                    onClick={() =>
                      updateForm(
                        "electricity_pods",
                        form.electricity_pods.filter((_, i) => i !== pi)
                      )
                    }
                    className="text-red-500 text-xs hover:underline"
                  >
                    Rimuovi
                  </button>
                )}
              </div>

              {/* Row 1: Nome sede + Paese */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-[var(--foreground)] mb-1.5 block">
                    Nome sede
                  </label>
                  <input
                    type="text"
                    value={pod.site_name}
                    onChange={(e) => updatePod(pi, { site_name: e.target.value })}
                    placeholder="es. Ufficio Milano"
                    className="w-full border border-[var(--border)] rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#27AE60]/30 focus:border-[#27AE60]"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-[var(--foreground)] mb-1.5 block">
                    Paese
                  </label>
                  <select
                    value={pod.country}
                    onChange={(e) => updatePod(pi, { country: e.target.value })}
                    className="w-full border border-[var(--border)] rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#27AE60]/30 focus:border-[#27AE60]"
                  >
                    {COUNTRY_EF_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* EF from country */}
              <div className="bg-gray-50 rounded-md px-3 py-2 text-xs text-[var(--muted)]">
                Fattore emissione location-based ({countryOpt?.label || pod.country}): <strong>{itN(stdEf.value, 7)}</strong> {stdEf.unit}
              </div>

              {/* Row 2: POD + Tipo contratto */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-[var(--foreground)] mb-1.5 block">
                    Codice POD
                  </label>
                  <input
                    type="text"
                    value={pod.pod_code}
                    onChange={(e) => updatePod(pi, { pod_code: e.target.value })}
                    placeholder="IT001E..."
                    className="w-full border border-[var(--border)] rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#27AE60]/30 focus:border-[#27AE60]"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-[var(--foreground)] mb-1.5 block">
                    Tipo contratto
                  </label>
                  <select
                    value={pod.contract_type}
                    onChange={(e) =>
                      updatePod(pi, { contract_type: e.target.value as ContractType })
                    }
                    className="w-full border border-[var(--border)] rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#27AE60]/30 focus:border-[#27AE60]"
                  >
                    {CONTRACT_TYPE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Monthly kWh */}
              <div>
                <label className="text-sm font-medium text-[var(--foreground)] mb-2 block">
                  Consumi mensili (kWh)
                </label>
                <div className="grid grid-cols-6 gap-2">
                  {MONTHS.map((m, mi) => (
                    <div key={mi}>
                      <label className="text-xs text-[var(--muted)] block mb-1">{m}</label>
                      <input
                        type="number"
                        min={0}
                        step="any"
                        value={pod.monthly[mi] || ""}
                        onChange={(e) =>
                          updateMonthly("electricity_pods", pi, mi, Number(e.target.value) || 0)
                        }
                        className="w-full border border-[var(--border)] rounded-md px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#27AE60]/30 focus:border-[#27AE60]"
                      />
                    </div>
                  ))}
                </div>
                <p className="text-xs text-[var(--muted)] mt-2">
                  Totale annuo: {annualKwh.toLocaleString("it-IT")} kWh
                </p>
              </div>

              {/* Fotovoltaico — ISO 14064-1 */}
              <div className="border border-gray-200 rounded-md p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide">Fotovoltaico</h4>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-[var(--foreground)]">Hai un impianto FV in questa sede?</span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={pod.has_fv}
                      onClick={() => updatePod(pi, { has_fv: !pod.has_fv })}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                        pod.has_fv ? "bg-[#27AE60]" : "bg-gray-300"
                      }`}
                    >
                      <span
                        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                          pod.has_fv ? "translate-x-4" : "translate-x-0.5"
                        }`}
                      />
                    </button>
                    <span className="text-xs text-[var(--muted)]">{pod.has_fv ? "Sì" : "No"}</span>
                  </div>
                </div>

                {pod.has_fv && (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-medium text-[var(--foreground)] mb-1 block">
                          Produzione FV totale annua (kWh)
                        </label>
                        <input
                          type="number"
                          min={0}
                          step="any"
                          value={pod.fv_production_kwh || ""}
                          onChange={(e) =>
                            updatePod(pi, {
                              fv_production_kwh: e.target.value ? Number(e.target.value) : 0,
                            })
                          }
                          placeholder="0"
                          className="w-full border border-[var(--border)] rounded-md px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#27AE60]/30 focus:border-[#27AE60]"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-[var(--foreground)] mb-1 block">
                          di cui autoconsumato (kWh)
                        </label>
                        <input
                          type="number"
                          min={0}
                          max={Math.min(pod.fv_production_kwh || 0, annualKwh)}
                          step="any"
                          value={pod.fv_autoconsumato_kwh || ""}
                          onChange={(e) => {
                            const val = e.target.value ? Number(e.target.value) : 0;
                            const cap = Math.min(pod.fv_production_kwh || 0, annualKwh);
                            updatePod(pi, { fv_autoconsumato_kwh: Math.min(val, cap) });
                          }}
                          placeholder="0"
                          className="w-full border border-[var(--border)] rounded-md px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#27AE60]/30 focus:border-[#27AE60]"
                        />
                      </div>
                    </div>

                    {/* Immesso in rete (calculated) */}
                    {(pod.fv_production_kwh || 0) > 0 && (
                      <p className="text-xs text-[var(--muted)]">
                        Immesso in rete: <strong>{fvImmesso.toLocaleString("it-IT")} kWh</strong>
                      </p>
                    )}

                    {/* GO vendute toggle */}
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-[var(--foreground)]">GO emesse e vendute a terzi</span>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={pod.fv_go_vendute}
                        onClick={() => updatePod(pi, { fv_go_vendute: !pod.fv_go_vendute })}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                          pod.fv_go_vendute ? "bg-orange-500" : "bg-gray-300"
                        }`}
                      >
                        <span
                          className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                            pod.fv_go_vendute ? "translate-x-4" : "translate-x-0.5"
                          }`}
                        />
                      </button>
                      <span className="text-xs text-[var(--muted)]">{pod.fv_go_vendute ? "Sì" : "No"}</span>
                    </div>

                    {pod.fv_go_vendute && (
                      <div className="bg-orange-50 border border-orange-200 rounded-md px-3 py-2 text-xs text-orange-800">
                        GO vendute a terzi: il claim verde è stato ceduto.
                        Usato residual mix nazionale per tutto il consumo.
                      </div>
                    )}
                  </>
                )}
              </div>

              <QualityAndEf
                dataQuality={pod.data_quality}
                efMode={pod.ef_mode}
                efValue={pod.ef_value}
                efReference={pod.ef_reference}
                standardEf={stdEf}
                onChangeQuality={(val) => updatePod(pi, { data_quality: val })}
                onChangeEfMode={(val) => updatePod(pi, { ef_mode: val })}
                onChangeEfValue={(val) => updatePod(pi, { ef_value: val })}
                onChangeEfReference={(val) => updatePod(pi, { ef_reference: val })}
                sourceType="electricity"
              />

              {/* Location-based subtotal */}
              <div className="bg-[#27AE60]/5 rounded-md px-3 py-2 flex justify-between items-center">
                <span className="text-sm text-[var(--foreground)]">
                  Emissioni location-based ({netKwh.toLocaleString("it-IT")} kWh netti)
                </span>
                <span className="text-sm font-semibold" style={{ color: GHG_GREEN }}>
                  {itN(locationSub, 4)} tCO₂e
                </span>
              </div>

              {/* ── Market-based section ── */}
              <div className="border-t border-dashed border-gray-300 pt-4 space-y-3">
                <h4 className="text-sm font-semibold text-[var(--foreground)]">Market-based</h4>

                <div>
                  <label className="text-sm font-medium text-[var(--foreground)] mb-1.5 block">
                    Strumento
                  </label>
                  <select
                    value={pod.market_instrument}
                    onChange={(e) =>
                      updatePod(pi, { market_instrument: e.target.value as MarketInstrument })
                    }
                    className="w-full border border-[var(--border)] rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#27AE60]/30 focus:border-[#27AE60]"
                  >
                    {MARKET_INSTRUMENT_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>

                {/* GO / REC / I-REC: certified MWh */}
                {(pod.market_instrument === "go" ||
                  pod.market_instrument === "rec" ||
                  pod.market_instrument === "i_rec") && (
                  <div>
                    <label className="text-sm font-medium text-[var(--foreground)] mb-1.5 block">
                      MWh certificati
                    </label>
                    <input
                      type="number"
                      min={0}
                      step="any"
                      value={pod.market_certified_kwh ? pod.market_certified_kwh / 1000 : ""}
                      onChange={(e) =>
                        updatePod(pi, {
                          market_certified_kwh: e.target.value
                            ? Number(e.target.value) * 1000
                            : 0,
                        })
                      }
                      placeholder="MWh coperti da certificato"
                      className="w-full max-w-xs border border-[var(--border)] rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#27AE60]/30 focus:border-[#27AE60]"
                    />
                    <p className="text-xs text-[var(--muted)] mt-1">
                      = {Math.min(pod.market_certified_kwh, netKwh).toLocaleString("it-IT")} kWh certificati
                      su {netKwh.toLocaleString("it-IT")} kWh netti
                    </p>
                  </div>
                )}

                {/* PPA: coverage slider */}
                {pod.market_instrument === "ppa" && (
                  <div>
                    <label className="text-sm font-medium text-[var(--foreground)] mb-1.5 block">
                      Copertura PPA: {pod.market_ppa_coverage}%
                    </label>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={1}
                      value={pod.market_ppa_coverage}
                      onChange={(e) =>
                        updatePod(pi, { market_ppa_coverage: Number(e.target.value) })
                      }
                      className="w-full max-w-xs accent-[#27AE60]"
                    />
                    <p className="text-xs text-[var(--muted)] mt-1">
                      {Math.round(netKwh * pod.market_ppa_coverage / 100).toLocaleString("it-IT")} kWh
                      coperti da PPA
                    </p>
                  </div>
                )}

                {/* Supplier rate: custom EF */}
                {pod.market_instrument === "supplier_rate" && (
                  <div>
                    <label className="text-sm font-medium text-[var(--foreground)] mb-1.5 block">
                      Fattore fornitore (tCO₂e/kWh)
                    </label>
                    <input
                      type="number"
                      min={0}
                      step="any"
                      value={pod.market_supplier_ef || ""}
                      onChange={(e) =>
                        updatePod(pi, {
                          market_supplier_ef: e.target.value ? Number(e.target.value) : 0,
                        })
                      }
                      placeholder="es. 0.000150"
                      className="w-full max-w-xs border border-[var(--border)] rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#27AE60]/30 focus:border-[#27AE60]"
                    />
                  </div>
                )}

                {/* Market emissions result */}
                <div className="bg-blue-50 rounded-md px-3 py-2 flex justify-between items-center">
                  <span className="text-sm text-[var(--foreground)]">
                    Emissioni market-based
                    {pod.market_instrument === "none" && (
                      <span className="text-xs text-[var(--muted)] ml-1">(residual mix AIB 2023)</span>
                    )}
                  </span>
                  <span className="text-sm font-semibold text-blue-700">
                    {itN(marketSub, 4)} tCO₂e
                  </span>
                </div>
              </div>

              {/* Avoided emissions from FV fed to grid */}
              {fvImmesso > 0 && (
                <div className="bg-gray-50 rounded-md px-3 py-2 space-y-1">
                  <p className="text-sm text-[var(--foreground)]">
                    ⚡ Emissioni evitate da FV immesso in rete:{" "}
                    <strong>{itN(fvImmesso * stdEf.value, 4)} tCO₂e</strong>
                  </p>
                  <p className="text-xs text-[var(--muted)] italic">
                    Riportate a fini informativi — non sottratte dall&apos;inventario GHG secondo ISO 14064-1 §6.5
                  </p>
                </div>
              )}
            </div>
            );
          })}

          <button
            type="button"
            onClick={() =>
              updateForm("electricity_pods", [...form.electricity_pods, newPod()])
            }
            className="text-sm font-medium hover:underline"
            style={{ color: GHG_GREEN }}
          >
            + Aggiungi sede
          </button>

          {/* Riepilogo Scope 2 */}
          {form.electricity_pods.length > 0 && (
            <div className="mt-4 border-t border-gray-200 pt-4 space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm font-semibold text-[var(--foreground)]">
                  Totale Scope 2 location-based
                </span>
                <span className="text-base font-bold" style={{ color: GHG_GREEN }}>
                  {itN(totalLocation, 4)} tCO₂e
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm font-semibold text-[var(--foreground)]">
                  Totale Scope 2 market-based
                </span>
                <span className="text-base font-bold text-blue-700">
                  {itN(totalMarket, 4)} tCO₂e
                </span>
              </div>

              {/* ISO 14064-1 + AIB note */}
              <div className="mt-3 bg-blue-50 border border-blue-200 rounded-md px-3 py-2 text-xs text-blue-800 space-y-1">
                <p>
                  Market-based calcolato con residual mix AIB 2023
                  per sedi senza strumenti di acquisto energetico certificati.
                </p>
                <p>
                  ISO 14064-1 richiede di riportare entrambi i metodi quando disponibili.
                  Il market-based riflette le scelte di acquisto energetico dell&apos;organizzazione.
                </p>
              </div>
            </div>
          )}
        </StepCard>
        );
      })()}

      {/* Step 6: Revisione */}
      {step === 7 && (() => {
        const approachLabel = CONSOLIDATION_APPROACH_OPTIONS.find(
          (o) => o.value === form.consolidation_approach
        )?.label || form.consolidation_approach;
        const nStationary = form.stationary_sources.filter((s) => isStationaryComplete(s)).length;
        const nVehicles = form.fleet_vehicles.filter((v) => isVehicleComplete(v)).length;
        const nHfc = form.hfc_gases.filter((h) => (h.kg_annual ?? 0) > 0).length;
        const nPods = form.electricity_pods.filter((p) => isPodComplete(p)).length;
        const hasIncomplete = form.stationary_sources.some((s, i) => i > 0 && !isStationaryEmpty(s) && !isStationaryComplete(s))
          || form.fleet_vehicles.some((v, i) => i > 0 && !isVehicleEmpty(v) && !isVehicleComplete(v))
          || form.electricity_pods.some((p, i) => i > 0 && !isPodEmpty(p) && !isPodComplete(p));

        // STATE A — Before generate
        if (!calcGenerated) {
          return (
            <StepCard title="Step 7 — Revisione e calcolo GHG">
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-green-600">&#10003;</span>
                  <span>Perimetro: {form.year} (base: {form.base_year}), {form.perimeter === "consolidato" ? "Consolidato" : "Individuale"}, {approachLabel}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <span className={nStationary > 0 ? "text-green-600" : "text-yellow-500"}>{nStationary > 0 ? "✅" : "⚠️"}</span>
                  <span>Combustione stazionaria: {nStationary} fonti</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <span className={nVehicles > 0 ? "text-green-600" : "text-yellow-500"}>{nVehicles > 0 ? "✅" : "⚠️"}</span>
                  <span>Combustione mobile: {nVehicles} mezzi</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <span className={nHfc > 0 ? "text-green-600" : "text-yellow-500"}>{nHfc > 0 ? "✅" : "⚠️"}</span>
                  <span>HFC refrigeranti: {nHfc} gas</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <span className={nPods > 0 ? "text-green-600" : "text-yellow-500"}>{nPods > 0 ? "✅" : "⚠️"}</span>
                  <span>Elettricità: {nPods} sedi</span>
                </div>
                {hasIncomplete && (
                  <p className="text-xs text-yellow-600 italic mt-2">
                    Alcuni campi incompleti — il calcolo userà solo i dati disponibili
                  </p>
                )}
              </div>

              <div className="flex justify-center pt-4">
                <button
                  type="button"
                  onClick={() => setCalcGenerated(true)}
                  className="text-white px-8 py-3 rounded-lg text-sm font-semibold transition-colors"
                  style={{ backgroundColor: GHG_GREEN }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = GHG_GREEN_HOVER)}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = GHG_GREEN)}
                >
                  Genera calcolo GHG
                </button>
              </div>
            </StepCard>
          );
        }

        // STATE B — After generate
        const summary = computeSummary();
        const fossilScope1 = summary.filter((r) => r.scope === "Scope 1");
        const biogenicRows = summary.filter((r) => r.scope === "Biogenico");
        const scope2Rows = summary.filter((r) => r.scope === "Scope 2");
        const totalScope1 = fossilScope1.reduce((a, r) => a + r.tco2e, 0);
        const totalBiogenic = biogenicRows.reduce((a, r) => a + r.tco2e, 0);
        // Sub-totals by category
        const stazionarioTot = fossilScope1
          .filter((r) => r.source.includes("Gas naturale") || STATIONARY_FUEL_OPTIONS.some((f) => r.source.startsWith(f.label)))
          .reduce((a, r) => a + r.tco2e, 0);
        const mobileTot = fossilScope1
          .filter((r) => FUEL_TYPE_OPTIONS.some((f) => r.source.startsWith(f.label)) || r.source.includes("Veicolo"))
          .reduce((a, r) => a + r.tco2e, 0);
        const hfcTot = fossilScope1
          .filter((r) => r.source.startsWith("HFC"))
          .reduce((a, r) => a + r.tco2e, 0);
        const locationScope2 = scope2Rows
          .filter((r) => r.source.includes("[Location]"))
          .reduce((a, r) => a + r.tco2e, 0);
        const marketScope2 = scope2Rows
          .filter((r) => r.source.includes("[Market]"))
          .reduce((a, r) => a + r.tco2e, 0);

        const grandTotal = totalScope1 + locationScope2;

        const allForUncertainty = [...fossilScope1, ...scope2Rows.filter((r) => r.source.includes("[Location]"))];
        const totalWeightedUnc = grandTotal > 0
          ? allForUncertainty.reduce((sum, r) => sum + r.tco2e * r.uncertainty, 0) / grandTotal
          : 0;

        // Gas breakdown — ISO 14064-1 §6.2
        const gasBreakdown: GasBreakdown = {
          co2_fossil: 0, ch4: 0, n2o: 0, hfc: hfcTot,
          co2_biogenic: 0, total_co2eq: 0,
        };
        // Stationary sources
        form.stationary_sources.forEach((s) => {
          const total = s.monthly.reduce((a, b) => a + (b || 0), 0);
          if (total <= 0) return;
          const gb = calcGasBreakdown(s.fuel_type, total);
          if (gb.hasDetail) {
            if (BIOGENIC_FUELS.has(s.fuel_type)) {
              gasBreakdown.co2_biogenic += gb.co2;
            } else {
              gasBreakdown.co2_fossil += gb.co2;
            }
            gasBreakdown.ch4 += gb.ch4;
            gasBreakdown.n2o += gb.n2o;
          } else {
            const ef = s.ef_mode === "custom" && s.ef_value != null
              ? s.ef_value : getStandardEf("stazionario", s.fuel_type).value;
            if (BIOGENIC_FUELS.has(s.fuel_type)) {
              gasBreakdown.co2_biogenic += total * ef;
            } else {
              gasBreakdown.co2_fossil += total * ef;
            }
          }
        });
        // Mobile sources
        form.fleet_vehicles.forEach((v) => {
          const isElectric = v.fuel_type === "electric_car_it";
          if (isElectric) return;
          const vc = getVehicleCalc(v);
          if (vc.quantity <= 0) return;
          const gb = calcGasBreakdown(v.fuel_type, vc.quantity);
          if (gb.hasDetail && vc.method === "litri") {
            gasBreakdown.co2_fossil += gb.co2;
            gasBreakdown.ch4 += gb.ch4;
            gasBreakdown.n2o += gb.n2o;
          } else {
            const ef = v.ef_mode === "custom" && v.ef_value != null
              ? v.ef_value : vc.ef.value;
            gasBreakdown.co2_fossil += vc.quantity * ef;
          }
        });
        // Electricity + HFC → reported as CO₂e directly
        gasBreakdown.co2_fossil += locationScope2;
        gasBreakdown.total_co2eq = gasBreakdown.co2_fossil + gasBreakdown.ch4 + gasBreakdown.n2o + gasBreakdown.hfc;

        // Warnings
        const warnings: string[] = [];
        if (hasIncomplete) warnings.push("Alcune fonti/sedi incomplete sono state ignorate nel calcolo");
        summary.forEach((r) => {
          if (r.uncertainty > 15) warnings.push(`${r.source}: incertezza elevata (±${itN(r.uncertainty, 1)}%)`);
        });

        return (
          <StepCard title="Step 7 — Riepilogo emissioni GHG">
            {/* Saved confirmation banner */}
            {reportSaved && (
              <div className="bg-green-50 border border-green-300 rounded-md px-4 py-3 text-sm text-green-800 -mt-1 mb-2">
                Report {reportCode || `GHG ${form.year}`} salvato con successo
              </div>
            )}

            {/* Dati inseriti */}
            <div className="mb-2">
              <h3 className="text-sm font-semibold text-[var(--foreground)] mb-2">Dati inseriti</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-left">
                      <th className="py-1.5 px-2 text-xs text-[var(--muted)] font-medium">Fonte</th>
                      <th className="py-1.5 px-2 text-xs text-[var(--muted)] font-medium">Combustibile</th>
                      <th className="py-1.5 px-2 text-xs text-[var(--muted)] font-medium text-right">Quantità</th>
                      <th className="py-1.5 px-2 text-xs text-[var(--muted)] font-medium">Unità</th>
                      <th className="py-1.5 px-2 text-xs text-[var(--muted)] font-medium text-center">Mesi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {form.stationary_sources.map((s, i) => {
                      const fuelOpt = STATIONARY_FUEL_OPTIONS.find((f) => f.value === s.fuel_type);
                      const total = s.monthly.reduce((a, b) => a + (b || 0), 0);
                      const monthsFilled = s.monthly.filter((v) => v > 0).length;
                      const isBio = BIOGENIC_FUELS.has(s.fuel_type);
                      const incomplete = monthsFilled > 0 && monthsFilled < 12;
                      return (
                        <tr key={`s${i}`} className="border-b border-gray-100">
                          <td className="py-1.5 px-2">
                            {s.source_name || `Fonte ${i + 1}`}
                            {isBio && <span className="ml-1 text-xs text-orange-600">Bio</span>}
                          </td>
                          <td className="py-1.5 px-2">{fuelOpt?.label || s.fuel_type}</td>
                          <td className="py-1.5 px-2 text-right">{total.toLocaleString("it-IT")}</td>
                          <td className="py-1.5 px-2">{fuelOpt?.unit || s.unit}</td>
                          <td className="py-1.5 px-2 text-center">
                            {incomplete ? <span className="text-yellow-600">{monthsFilled}/12</span> : `${monthsFilled}/12`}
                          </td>
                        </tr>
                      );
                    })}
                    {form.fleet_vehicles.map((v, i) => {
                      const fuelLabel = FUEL_TYPE_OPTIONS.find((o) => o.value === v.fuel_type)?.label ?? v.fuel_type;
                      const isElectric = v.fuel_type === "electric_car_it";
                      const qty = isElectric ? (v.km_annual || 0) : (v.liters_annual || 0);
                      return (
                        <tr key={`v${i}`} className="border-b border-gray-100">
                          <td className="py-1.5 px-2">{v.plate || `Veicolo ${i + 1}`}</td>
                          <td className="py-1.5 px-2">{fuelLabel}</td>
                          <td className="py-1.5 px-2 text-right">{qty > 0 ? qty.toLocaleString("it-IT") : "—"}</td>
                          <td className="py-1.5 px-2">{isElectric ? "km" : "litri"}</td>
                          <td className="py-1.5 px-2 text-center">—</td>
                        </tr>
                      );
                    })}
                    {form.hfc_gases.map((h, i) => (
                      <tr key={`h${i}`} className="border-b border-gray-100">
                        <td className="py-1.5 px-2">{h.gas_name}</td>
                        <td className="py-1.5 px-2">HFC</td>
                        <td className="py-1.5 px-2 text-right">{(h.kg_annual ?? 0) > 0 ? (h.kg_annual ?? 0).toLocaleString("it-IT") : "—"}</td>
                        <td className="py-1.5 px-2">kg</td>
                        <td className="py-1.5 px-2 text-center">—</td>
                      </tr>
                    ))}
                    {form.electricity_pods.map((p, i) => {
                      const totalKwh = p.monthly.reduce((a, b) => a + (b || 0), 0);
                      const monthsFilled = p.monthly.filter((v) => v > 0).length;
                      const countryLabel = COUNTRY_EF_OPTIONS.find((o) => o.value === p.country)?.label || p.country;
                      const incomplete = monthsFilled > 0 && monthsFilled < 12;
                      return (
                        <tr key={`e${i}`} className="border-b border-gray-100">
                          <td className="py-1.5 px-2">{p.site_name || `Sede ${i + 1}`}</td>
                          <td className="py-1.5 px-2">Elettricità ({countryLabel})</td>
                          <td className="py-1.5 px-2 text-right">{totalKwh.toLocaleString("it-IT")}</td>
                          <td className="py-1.5 px-2">kWh</td>
                          <td className="py-1.5 px-2 text-center">
                            {incomplete ? <span className="text-yellow-600">{monthsFilled}/12</span> : `${monthsFilled}/12`}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Perimeter info */}
            <div className="bg-gray-50 rounded-lg px-4 py-3 text-sm space-y-1 mb-2">
              <div className="flex gap-2">
                <span className="text-[var(--muted)]">Anno di riferimento:</span>
                <span className="font-medium">{form.year}</span>
              </div>
              <div className="flex gap-2">
                <span className="text-[var(--muted)]">Anno base:</span>
                <span className="font-medium">{form.base_year}</span>
                {form.base_year === form.year && <span className="text-xs text-[var(--muted)]">(primo anno)</span>}
              </div>
              {form.base_year !== form.year && form.base_year_recalculation.length > 0 && (
                <div className="flex gap-2">
                  <span className="text-[var(--muted)]">Condizioni ricalcolo:</span>
                  <span className="font-medium">{form.base_year_recalculation.map((c) => c === "altro" ? form.base_year_recalculation_notes || "Altro" : c).join(", ")}</span>
                </div>
              )}
              <div className="flex gap-2">
                <span className="text-[var(--muted)]">Perimetro:</span>
                <span className="font-medium">{form.perimeter === "consolidato" ? "Consolidato" : "Individuale"} · {approachLabel}</span>
              </div>
            </div>

            {/* Sezione 1 — Scope breakdown */}
            <div className="space-y-2 text-sm">
              <h3 className="font-semibold text-[var(--foreground)]">Scope 1 — Emissioni dirette</h3>
              <div className="pl-4 space-y-1">
                <div className="flex justify-between"><span className="text-[var(--muted)]">Combustione stazionaria</span><span className="font-medium">{itN(stazionarioTot, 2)} tCO₂e</span></div>
                <div className="flex justify-between"><span className="text-[var(--muted)]">Combustione mobile</span><span className="font-medium">{itN(mobileTot, 2)} tCO₂e</span></div>
                <div className="flex justify-between"><span className="text-[var(--muted)]">Emissioni fuggitive HFC</span><span className="font-medium">{itN(hfcTot, 2)} tCO₂e</span></div>
                {totalBiogenic > 0 && (
                  <div className="flex justify-between text-orange-700"><span>Biogeniche (informativo)</span><span className="font-medium">{itN(totalBiogenic, 2)} tCO₂e</span></div>
                )}
              </div>
              <div className="flex justify-between font-semibold border-t border-gray-200 pt-1"><span>Totale Scope 1</span><span style={{ color: GHG_GREEN }}>{itN(totalScope1, 2)} tCO₂e</span></div>

              <h3 className="font-semibold text-[var(--foreground)] pt-2">Scope 2 — Emissioni indirette energia</h3>
              <div className="pl-4 space-y-1">
                <div className="flex justify-between"><span className="text-[var(--muted)]">Location-based</span><span className="font-medium">{itN(locationScope2, 2)} tCO₂e</span></div>
                <div className="flex justify-between"><span className="text-[var(--muted)]">Market-based</span><span className="font-medium text-blue-700">{itN(marketScope2, 2)} tCO₂e</span></div>
              </div>

              <div className="flex justify-between font-bold border-t-2 border-gray-300 pt-2 text-base">
                <span>TOTALE (Scope 1 + Scope 2 location)</span>
                <span style={{ color: GHG_GREEN }}>{itN(grandTotal, 2)} tCO₂e</span>
              </div>
            </div>

            {/* Ripartizione per gas — ISO 14064-1 §6.2 */}
            <div className="mt-4">
              <h3 className="text-sm font-semibold text-[var(--foreground)] mb-2">Ripartizione per gas — ISO 14064-1 §6.2</h3>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left">
                    <th className="py-1.5 px-2 text-xs text-[var(--muted)] font-medium">Gas</th>
                    <th className="py-1.5 px-2 text-xs text-[var(--muted)] font-medium text-right">tCO₂e</th>
                    <th className="py-1.5 px-2 text-xs text-[var(--muted)] font-medium text-right">% sul totale</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-gray-100">
                    <td className="py-1.5 px-2">CO₂ fossile</td>
                    <td className="py-1.5 px-2 text-right">{itN(gasBreakdown.co2_fossil, 3)}</td>
                    <td className="py-1.5 px-2 text-right">{gasBreakdown.total_co2eq > 0 ? itN((gasBreakdown.co2_fossil / gasBreakdown.total_co2eq) * 100, 1) : "0"}%</td>
                  </tr>
                  <tr className="border-b border-gray-100">
                    <td className="py-1.5 px-2">CH₄</td>
                    <td className="py-1.5 px-2 text-right">{itN(gasBreakdown.ch4, 3)}</td>
                    <td className="py-1.5 px-2 text-right">{gasBreakdown.total_co2eq > 0 ? itN((gasBreakdown.ch4 / gasBreakdown.total_co2eq) * 100, 1) : "0"}%</td>
                  </tr>
                  <tr className="border-b border-gray-100">
                    <td className="py-1.5 px-2">N₂O</td>
                    <td className="py-1.5 px-2 text-right">{itN(gasBreakdown.n2o, 3)}</td>
                    <td className="py-1.5 px-2 text-right">{gasBreakdown.total_co2eq > 0 ? itN((gasBreakdown.n2o / gasBreakdown.total_co2eq) * 100, 1) : "0"}%</td>
                  </tr>
                  <tr className="border-b border-gray-100">
                    <td className="py-1.5 px-2">HFC / PFC / SF₆</td>
                    <td className="py-1.5 px-2 text-right">{itN(gasBreakdown.hfc, 3)}</td>
                    <td className="py-1.5 px-2 text-right">{gasBreakdown.total_co2eq > 0 ? itN((gasBreakdown.hfc / gasBreakdown.total_co2eq) * 100, 1) : "0"}%</td>
                  </tr>
                  <tr className="border-t-2 border-gray-300 font-semibold">
                    <td className="py-1.5 px-2">TOTALE</td>
                    <td className="py-1.5 px-2 text-right">{itN(gasBreakdown.total_co2eq, 3)}</td>
                    <td className="py-1.5 px-2 text-right">100%</td>
                  </tr>
                </tbody>
              </table>
              {gasBreakdown.co2_biogenic > 0 && (
                <div className="mt-2 text-xs text-[var(--muted)]">
                  <span>CO₂ biogenica (informativo): <strong>{itN(gasBreakdown.co2_biogenic, 3)} tCO₂e</strong></span>
                  <p className="italic">Non inclusa nel totale — ISO 14064-1 §6.5</p>
                </div>
              )}
            </div>

            {/* Sezione 2 — Uncertainty table */}
            <div className="overflow-x-auto mt-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left">
                    <th className="py-2 px-2 text-xs text-[var(--muted)] font-medium">Fonte</th>
                    <th className="py-2 px-2 text-xs text-[var(--muted)] font-medium text-right">tCO₂e</th>
                    <th className="py-2 px-2 text-xs text-[var(--muted)] font-medium text-center">Incertezza</th>
                    <th className="py-2 px-2 text-xs text-[var(--muted)] font-medium text-center">Qualità</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.map((row, i) => (
                    <tr key={i} className="border-b border-gray-100">
                      <td className="py-1.5 px-2 text-xs">{row.source}</td>
                      <td className="py-1.5 px-2 text-right">{itN(row.tco2e, 3)}</td>
                      <td className="py-1.5 px-2 text-center text-xs">±{itN(row.uncertainty, 1)}%</td>
                      <td className="py-1.5 px-2 text-center"><UncertaintyBadge uncertainty={row.uncertainty} /></td>
                    </tr>
                  ))}
                  {summary.length > 0 && (
                    <tr className="border-t-2 border-gray-300 font-semibold">
                      <td className="py-2 px-2">TOTALE</td>
                      <td className="py-2 px-2 text-right">{itN(grandTotal, 3)}</td>
                      <td className="py-2 px-2 text-center">±{itN(totalWeightedUnc, 1)}%</td>
                      <td className="py-2 px-2 text-center"><UncertaintyBadge uncertainty={totalWeightedUnc} /></td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-[var(--muted)] italic mt-2">
              Incertezza calcolata secondo ISO 14064-1 Annex B —
              combinazione quadratica incertezza dato + fattore emissione
            </p>

            {/* Sezione 3 — Warnings */}
            {warnings.length > 0 && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-md px-3 py-2 mt-2">
                <p className="text-xs font-semibold text-yellow-800 mb-1">Note e anomalie</p>
                <ul className="text-xs text-yellow-700 space-y-0.5 list-disc list-inside">
                  {warnings.map((w, i) => <li key={i}>{w}</li>)}
                </ul>
              </div>
            )}

            {/* Action buttons */}
            {reportSaved ? (
              <div className="pt-4 border-t border-gray-200 space-y-3">
                <div className="bg-green-50 border border-green-200 rounded-md px-4 py-3 text-center">
                  <p className="text-sm font-medium text-green-800">
                    Report {reportCode || `GHG ${form.year}`} salvato con successo
                  </p>
                </div>
                <div className="flex justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => { setCalcGenerated(false); setReportSaved(false); }}
                    className="border border-[var(--border)] text-[var(--muted)] px-4 py-2 rounded-md text-sm hover:bg-gray-50"
                  >
                    ← Modifica dati
                  </button>
                  <Link
                    href={`/clients/${companyId}`}
                    className="text-white px-4 py-2 rounded-md text-sm font-medium inline-block"
                    style={{ backgroundColor: GHG_GREEN }}
                  >
                    Torna alla scheda cliente
                  </Link>
                  <button
                    type="button"
                    disabled
                    className="border border-[var(--border)] text-gray-400 px-4 py-2 rounded-md text-sm cursor-not-allowed"
                    title="In arrivo"
                  >
                    Genera PDF
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex justify-center items-center gap-3 pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setCalcGenerated(false)}
                  className="border border-[var(--border)] text-[var(--muted)] px-4 py-2 rounded-md text-sm hover:bg-gray-50"
                >
                  ← Modifica dati
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={async () => {
                    setSaving(true);
                    try {
                      await saveToDb();
                      if (reportId) {
                        const summ = computeSummary();
                        const s1Tot = summ.filter((r) => r.scope === "Scope 1").reduce((a, r) => a + r.tco2e, 0);
                        const s2Rows = summ.filter((r) => r.scope === "Scope 2");
                        const s2LB = s2Rows.filter((r) => r.source.includes("[Location]")).reduce((a, r) => a + r.tco2e, 0);
                        const s2MB = s2Rows.filter((r) => r.source.includes("[Market]")).reduce((a, r) => a + r.tco2e, 0);
                        await supabase
                          .from("ghg_reports")
                          .update({
                            status: "completato",
                            scope1_total: s1Tot,
                            scope2_lb_total: s2LB,
                            scope2_mb_total: s2MB,
                            total_co2eq: s1Tot + s2LB,
                          })
                          .eq("id", reportId);
                      }
                      setReportSaved(true);
                    } finally {
                      setSaving(false);
                    }
                  }}
                  className="text-white px-5 py-2 rounded-md text-sm font-medium transition-colors disabled:opacity-50"
                  style={{ backgroundColor: GHG_GREEN }}
                  onMouseEnter={(e) => { if (!saving) e.currentTarget.style.backgroundColor = GHG_GREEN_HOVER; }}
                  onMouseLeave={(e) => { if (!saving) e.currentTarget.style.backgroundColor = GHG_GREEN; }}
                >
                  {saving ? "Salvataggio in corso..." : "Salva report definitivo"}
                </button>
              </div>
            )}
          </StepCard>
        );
      })()}

      {/* Navigation buttons */}
      <div className="flex justify-between">
        <button
          type="button"
          disabled={step === 1}
          onClick={() => goToStep(step - 1)}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            step === 1
              ? "bg-gray-100 text-gray-400 cursor-not-allowed"
              : "border border-[var(--border)] text-[var(--muted)] hover:bg-gray-50"
          }`}
        >
          ← Precedente
        </button>
        <button
          type="button"
          disabled={step === TOTAL_STEPS}
          onClick={() => goToStep(step + 1)}
          className="text-white px-4 py-2 rounded-md text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ backgroundColor: step === TOTAL_STEPS ? "#999" : GHG_GREEN }}
          onMouseEnter={(e) => {
            if (step < TOTAL_STEPS) e.currentTarget.style.backgroundColor = GHG_GREEN_HOVER;
          }}
          onMouseLeave={(e) => {
            if (step < TOTAL_STEPS) e.currentTarget.style.backgroundColor = GHG_GREEN;
          }}
        >
          Successivo →
        </button>
      </div>
    </div>
  );
}
