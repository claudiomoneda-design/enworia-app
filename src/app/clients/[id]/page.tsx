"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import type { Company } from "@/types/database";
import { EU_COUNTRIES, EMPLOYEE_UNITS } from "@/data/constants";

const GHG_GREEN = "#006450";

interface GhgReportRow {
  id: string;
  reference_year: number;
  year: number;
  report_code: string | null;
  status: string;
  modalita: string | null;
  step_corrente: string | null;
  scope1_total: number | null;
  scope2_lb_total: number | null;
  scope2_mb_total: number | null;
  total_co2eq: number | null;
}

interface VsmeReportRow { id: string; anno: number; status: string; }

type DocRow = { id: string; year: number; code: string | null; type: "GHG" | "VSME"; status: string; s1: number; s2lb: number; total: number };

function lbl(value: string, list: readonly { value: string; label: string }[]): string {
  return list.find((i) => i.value === value)?.label ?? value;
}

// ── GHG Stepper steps ───────────────────────────────────────────────────────
const GHG_STEPS = [
  { key: "modalita", label: "Modalità" },
  { key: "perimetro", label: "Perimetro" },
  { key: "stazionaria", label: "Stazionaria" },
  { key: "mobile", label: "Mobile" },
  { key: "hfc", label: "HFC" },
  { key: "elettricita", label: "Elettricità" },
  { key: "revisione", label: "Revisione" },
];

const SCOPE3_STEPS = [
  { key: "significativita", label: "Significatività" },
  { key: "quantificazione", label: "Quantificazione" },
  { key: "revisione_s3", label: "Revisione" },
];

const VSME_STEPS = [
  { key: "dati_generali", label: "Dati generali" },
  { key: "ambiente", label: "Ambiente" },
  { key: "sociale", label: "Sociale" },
  { key: "governance", label: "Governance" },
  { key: "revisione_vsme", label: "Revisione" },
];

function MiniStepper({ steps, currentKey }: { steps: { key: string; label: string }[]; currentKey: string | null }) {
  const currentIdx = steps.findIndex((s) => s.key === currentKey);
  return (
    <div className="flex items-center gap-0 mt-3">
      {steps.map((s, i) => {
        const done = currentIdx > i;
        const active = currentIdx === i;
        return (
          <div key={s.key} className="flex items-center">
            <div className="flex flex-col items-center">
              <div
                className="flex items-center justify-center rounded-full text-[9px] font-bold"
                style={{
                  width: 20, height: 20,
                  background: done ? "#27AE60" : active ? "#1C2B28" : "#E2EAE8",
                  color: done || active ? "#fff" : "#999",
                }}
              >
                {done ? "✓" : i + 1}
              </div>
              <span className="text-[8px] mt-0.5" style={{ color: active ? "#1C2B28" : "#999", fontWeight: active ? 600 : 400 }}>
                {s.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div style={{ width: 16, height: 2, background: done ? "#27AE60" : "#E2EAE8", marginBottom: 12 }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function LockBanner({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2 mt-3 px-3 py-2 rounded-md bg-gray-50 border border-gray-200">
      <span className="text-sm">🔒</span>
      <span className="text-xs text-gray-500">{text}</span>
    </div>
  );
}

function Metric({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="text-center">
      <div className="text-[10px] text-gray-400 uppercase">{label}</div>
      <div className="text-sm font-bold" style={{ color }}>{value}</div>
    </div>
  );
}

// ── Main page ───────────────────────────────────────────────────────────────
export default function ClientDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const [company, setCompany] = useState<Company | null>(null);
  const [ghgReports, setGhgReports] = useState<GhgReportRow[]>([]);
  const [vsmeReports, setVsmeReports] = useState<VsmeReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [companyOpen, setCompanyOpen] = useState(false);

  // GHG modal
  const [ghgModal, setGhgModal] = useState(false);
  const [ghgNewYear, setGhgNewYear] = useState(new Date().getFullYear() - 1);
  const [ghgExisting, setGhgExisting] = useState<GhgReportRow | null>(null);

  // VSME modal
  const [vsmeModal, setVsmeModal] = useState(false);
  const [manualMode, setManualMode] = useState(false);
  const [manualS1, setManualS1] = useState("");
  const [manualS2, setManualS2] = useState("");
  const [manualSource, setManualSource] = useState("");
  const [manualYear, setManualYear] = useState(new Date().getFullYear() - 1);

  useEffect(() => {
    (async () => {
      const [{ data: co }, { data: ghg }, { data: vsme }] = await Promise.all([
        supabase.from("companies").select("*").eq("id", id).single(),
        supabase.from("ghg_reports")
          .select("*")
          .eq("company_id", id).order("reference_year", { ascending: false }),
        supabase.from("vsme_reports").select("id, anno, status").eq("client_id", id).order("anno", { ascending: false }),
      ]);
      if (co) setCompany(co as Company);
      if (ghg) setGhgReports((ghg as GhgReportRow[]).map((r) => ({ ...r, year: r.reference_year || r.year })));
      if (vsme) setVsmeReports(vsme as VsmeReportRow[]);
      setLoading(false);
    })();
  }, [id]);

  if (loading) return <p className="text-gray-400 text-sm py-8">Caricamento...</p>;
  if (!company) return <p className="text-red-600 text-sm py-8">Cliente non trovato.</p>;

  const c = company;
  const latestGhg = ghgReports[0];
  const isComplete = (s: string) => s === "completato" || s === "completed";
  const completedGhg = ghgReports.find((r) => isComplete(r.status));
  const hasCompletedGhg = !!completedGhg;
  const completedVsmeBasic = vsmeReports.find((r) => isComplete(r.status)); // TODO: filter by type when available
  const hasCompletedVsmeBasic = !!completedVsmeBasic;
  // Scope 3 and VSME Basic unlock in parallel after GHG
  const vsmeBasicUnlocked = hasCompletedGhg;
  const scope3Unlocked = hasCompletedGhg;
  // VSME Comprehensive requires both VSME Basic AND Scope 3
  const vsmeCompUnlocked = hasCompletedVsmeBasic && hasCompletedGhg; // Scope 3 check simplified for now

  const fmtT = (v: number | null) => v != null && v > 0 ? `${Number(v).toFixed(2)} t` : "—";

  // Unified doc list
  const docs: DocRow[] = [
    ...ghgReports.map((r) => ({ id: r.id, year: r.year, code: r.report_code, type: "GHG" as const, status: r.status, s1: Number(r.scope1_total ?? 0), s2lb: Number(r.scope2_lb_total ?? 0), total: Number(r.total_co2eq ?? 0) || Number(r.scope1_total ?? 0) + Number(r.scope2_lb_total ?? 0) })),
    ...vsmeReports.map((r) => ({ id: r.id, year: r.anno, code: null, type: "VSME" as const, status: r.status, s1: 0, s2lb: 0, total: 0 })),
  ].sort((a, b) => b.year - a.year);

  return (
    <div className="space-y-5 max-w-4xl mx-auto" style={{ fontFamily: "Arial, sans-serif" }}>

      {/* ═══ 1. HEADER ═══ */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1C2B28]">{c.company_name || "Bozza senza nome"}</h1>
          <div className="flex items-center gap-3 mt-1">
            {c.nace_code && <span className="text-xs text-gray-400">ATECO {c.nace_code}</span>}
            {c.number_of_employees != null && <span className="text-xs text-gray-400">{c.number_of_employees} dip.</span>}
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${c.form_status === "draft" ? "bg-amber-100 text-amber-700" : "bg-green-100 text-green-700"}`}>
              {c.form_status === "draft" ? "Bozza" : "Attivo"}
            </span>
            <Link href={`/clients/${id}/edit`} className="text-xs text-blue-600 hover:underline">Modifica dati</Link>
          </div>
        </div>
        <Link href="/clients" className="text-xs text-gray-400 hover:underline">← Tutti i clienti</Link>
      </div>

      {/* ═══ 2. COMPANY DATA (collapsible) ═══ */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <button type="button" onClick={() => setCompanyOpen(!companyOpen)}
          className="w-full flex items-center justify-between px-5 py-3 hover:bg-gray-50">
          <span className="text-sm font-semibold text-[#1C2B28]">Dati azienda</span>
          <span className="text-gray-400 text-xs">{companyOpen ? "▲" : "▼"}</span>
        </button>
        {companyOpen && (
          <div className="px-5 pb-4 border-t border-gray-100 grid grid-cols-2 gap-x-8 pt-3 text-xs">
            <div className="space-y-1">
              <div><span className="text-gray-400 w-40 inline-block">Ragione sociale</span> {c.company_name}</div>
              <div><span className="text-gray-400 w-40 inline-block">ATECO</span> {c.nace_code ? `${c.nace_code} — ${c.nace_description}` : "—"}</div>
              <div><span className="text-gray-400 w-40 inline-block">Forma giuridica</span> {c.legal_form || "—"}</div>
            </div>
            <div className="space-y-1">
              <div><span className="text-gray-400 w-40 inline-block">Dipendenti</span> {c.number_of_employees ?? "—"} ({lbl(c.employee_unit, EMPLOYEE_UNITS)})</div>
              <div><span className="text-gray-400 w-40 inline-block">Fatturato</span> {c.turnover_eur ? `${Number(c.turnover_eur).toLocaleString("it-IT")} €` : "—"}</div>
              <div><span className="text-gray-400 w-40 inline-block">Sede</span> {c.registered_address || "—"}</div>
            </div>
          </div>
        )}
      </div>

      {/* ═══ 3. QUATTRO MODULI IN SEQUENZA ═══ */}

      {/* ── MODULO 1: GHG Scope 1+2 ── */}
      <div className="bg-white rounded-lg border border-gray-200 p-5">
        <div className="flex items-start gap-4">
          <div className="flex items-center justify-center rounded-full text-xs font-bold text-white" style={{ width: 28, height: 28, background: GHG_GREEN, flexShrink: 0 }}>1</div>
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[#1C2B28]">Calcolo GHG Scope 1+2</h3>
              {latestGhg && (
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${isComplete(latestGhg.status) ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>
                  {isComplete(latestGhg.status) ? "Completato" : "Bozza"}
                </span>
              )}
            </div>
            <p className="text-xs text-gray-400 mt-1">Emissioni dirette e da energia acquistata — ISO 14064-1</p>

            {latestGhg && Number(latestGhg.total_co2eq ?? 0) > 0 && (
              <div className="flex gap-6 mt-3 py-2 px-3 bg-gray-50 rounded-md">
                <Metric label="Scope 1" value={fmtT(latestGhg.scope1_total)} color="#15803d" />
                <Metric label="Scope 2 LB" value={fmtT(latestGhg.scope2_lb_total)} color="#1d4ed8" />
                <Metric label="Totale" value={fmtT(latestGhg.total_co2eq)} color="#1C2B28" />
              </div>
            )}

            <MiniStepper steps={GHG_STEPS} currentKey={latestGhg?.step_corrente || "modalita"} />

            <div className="flex items-center gap-3 mt-4">
              <button type="button"
                onClick={() => {
                  if (latestGhg && !isComplete(latestGhg.status)) {
                    router.push(`/clients/${id}/ghg/${latestGhg.id}/edit`);
                  } else {
                    setGhgModal(true); setGhgExisting(null); setGhgNewYear(new Date().getFullYear() - 1);
                  }
                }}
                className="text-white px-4 py-2 rounded-md text-sm font-medium" style={{ backgroundColor: GHG_GREEN }}>
                {latestGhg && !isComplete(latestGhg.status)
                  ? `Continua → ${GHG_STEPS.find(s => s.key === (latestGhg.step_corrente || "modalita"))?.label || ""}`
                  : "+ Nuovo calcolo GHG"}
              </button>
              {ghgReports.length > 0 && (
                <Link href={`/clients/${id}/ghg`} className="text-xs text-gray-400 hover:underline">Storico ({ghgReports.length})</Link>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── MODULO 2: VSME Basic ── */}
      <div className={`bg-white rounded-lg border p-5 ${vsmeBasicUnlocked ? "border-gray-200" : "border-gray-100 opacity-75"}`}>
        <div className="flex items-start gap-4">
          <div className="flex items-center justify-center rounded-full text-xs font-bold" style={{ width: 28, height: 28, background: vsmeBasicUnlocked ? GHG_GREEN : "#E2EAE8", color: vsmeBasicUnlocked ? "#fff" : "#999", flexShrink: 0 }}>2</div>
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[#1C2B28]">VSME Basic</h3>
              {completedVsmeBasic && <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-green-100 text-green-700">Completato</span>}
            </div>
            <p className="text-xs text-gray-400 mt-1">Report ESG di base per PMI europee · Standard EFRAG VSME</p>

            {vsmeBasicUnlocked ? (
              <>
                <MiniStepper steps={VSME_STEPS} currentKey="dati_generali" />
                <div className="mt-4">
                  <button type="button" onClick={() => { setVsmeModal(true); setManualMode(false); }}
                    className="text-white px-4 py-2 rounded-md text-sm font-medium" style={{ backgroundColor: GHG_GREEN }}>
                    {completedVsmeBasic ? "Modifica VSME Basic" : "Crea VSME Basic"}
                  </button>
                </div>
              </>
            ) : (
              <LockBanner text="Completa prima il calcolo GHG Scope 1+2" />
            )}
          </div>
        </div>
      </div>

      {/* ── MODULO 3: Scope 3 ── */}
      <div className={`bg-white rounded-lg border p-5 ${scope3Unlocked ? "border-gray-200" : "border-gray-100 opacity-75"}`}>
        <div className="flex items-start gap-4">
          <div className="flex items-center justify-center rounded-full text-xs font-bold" style={{ width: 28, height: 28, background: scope3Unlocked ? "#2563eb" : "#E2EAE8", color: scope3Unlocked ? "#fff" : "#999", flexShrink: 0 }}>3</div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-[#1C2B28]">Scope 3 — Emissioni indirette</h3>
            <p className="text-xs text-gray-400 mt-1">Screening significatività e quantificazione · ISO 14064-1</p>

            {scope3Unlocked && completedGhg ? (
              <>
                <MiniStepper steps={SCOPE3_STEPS} currentKey="significativita" />
                <div className="mt-4">
                  <Link href={`/clients/${id}/ghg/${completedGhg.id}/scope3`}
                    className="inline-block text-white px-4 py-2 rounded-md text-sm font-medium" style={{ backgroundColor: "#2563eb" }}>
                    Apri Scope 3 →
                  </Link>
                </div>
              </>
            ) : (
              <LockBanner text="Completa prima il calcolo GHG Scope 1+2" />
            )}
          </div>
        </div>
      </div>

      {/* ── MODULO 4: VSME Comprehensive ── */}
      <div className={`bg-white rounded-lg border p-5 ${vsmeCompUnlocked ? "border-gray-200" : "border-gray-100 opacity-75"}`}>
        <div className="flex items-start gap-4">
          <div className="flex items-center justify-center rounded-full text-xs font-bold" style={{ width: 28, height: 28, background: vsmeCompUnlocked ? "#7c3aed" : "#E2EAE8", color: vsmeCompUnlocked ? "#fff" : "#999", flexShrink: 0 }}>4</div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-[#1C2B28]">VSME Comprehensive</h3>
            <p className="text-xs text-gray-400 mt-1">Report ESG completo con emissioni indirette · Standard EFRAG VSME</p>

            {vsmeCompUnlocked ? (
              <>
                <MiniStepper steps={VSME_STEPS} currentKey="dati_generali" />
                <div className="mt-4">
                  <button type="button" onClick={() => { setVsmeModal(true); setManualMode(false); }}
                    className="text-white px-4 py-2 rounded-md text-sm font-medium" style={{ backgroundColor: "#7c3aed" }}>
                    Crea VSME Comprehensive
                  </button>
                </div>
              </>
            ) : (
              <LockBanner text={
                !hasCompletedVsmeBasic && !hasCompletedGhg ? "Completa prima VSME Basic e Scope 3" :
                !hasCompletedVsmeBasic ? "Completa prima VSME Basic" :
                "Completa prima Scope 3"
              } />
            )}
          </div>
        </div>
      </div>

      {/* ═══ MODALS ═══ */}

      {/* GHG Year Modal */}
      {ghgModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setGhgModal(false)}>
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-[#1C2B28]">Nuovo calcolo GHG</h2>
            <div>
              <label className="text-sm font-medium text-[#1C2B28] mb-1.5 block">Anno di riferimento</label>
              <input type="number" value={ghgNewYear}
                onChange={(e) => { const y = Number(e.target.value); setGhgNewYear(y); setGhgExisting(ghgReports.find((r) => r.year === y) || null); }}
                min={2015} max={2099} className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm" />
            </div>
            {ghgExisting ? (() => {
              const isComp = ghgExisting.status === "completato" || ghgExisting.status === "completed";
              return (
                <div className="space-y-3">
                  <div className={`${isComp ? "bg-blue-50 border-blue-200 text-blue-800" : "bg-amber-50 border-amber-200 text-amber-800"} border rounded-md px-3 py-2 text-sm`}>
                    {isComp ? `Report completato per il ${ghgNewYear}` : `Bozza esistente per il ${ghgNewYear}`}
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => { setGhgModal(false); router.push(`/clients/${id}/ghg/${ghgExisting.id}/edit`); }}
                      className="flex-1 text-white py-2 rounded-md text-sm font-medium" style={{ backgroundColor: GHG_GREEN }}>
                      {isComp ? "Modifica" : "Riprendi bozza"}
                    </button>
                    <button onClick={() => { setGhgModal(false); router.push(`/clients/${id}/ghg/new?anno=${ghgNewYear}`); }}
                      className="flex-1 border border-gray-200 py-2 rounded-md text-sm hover:bg-gray-50">
                      {isComp ? "Nuovo calcolo" : "Inizia da capo"}
                    </button>
                  </div>
                </div>
              );
            })() : (
              <button onClick={() => { setGhgModal(false); router.push(`/clients/${id}/ghg/new?anno=${ghgNewYear}`); }}
                className="w-full text-white py-2 rounded-md text-sm font-medium" style={{ backgroundColor: GHG_GREEN }}>
                Inizia calcolo {ghgNewYear}
              </button>
            )}
            <button onClick={() => setGhgModal(false)} className="w-full text-center text-xs text-gray-400 hover:underline">Annulla</button>
          </div>
        </div>
      )}

      {/* VSME Modal */}
      {vsmeModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setVsmeModal(false)}>
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-[#1C2B28]">Bilancio VSME</h2>
            {!manualMode && completedGhg ? (
              <>
                <div className="bg-green-50 border border-green-200 rounded-md px-4 py-3 text-sm text-green-800 space-y-1">
                  <p className="font-medium">Dati GHG {completedGhg.year}</p>
                  <p>Scope 1: {fmtT(completedGhg.scope1_total)} · Scope 2: {fmtT(completedGhg.scope2_lb_total)}</p>
                </div>
                <button onClick={() => { setVsmeModal(false); router.push(`/clients/${id}/vsme/new?ghg_report_id=${completedGhg.id}`); }}
                  className="w-full text-white py-2 rounded-md text-sm font-medium" style={{ backgroundColor: GHG_GREEN }}>
                  Continua con questi dati →
                </button>
              </>
            ) : !manualMode ? (
              <>
                <div className="bg-amber-50 border border-amber-200 rounded-md px-4 py-3 text-sm text-amber-800">Nessun calcolo GHG completato</div>
                <div className="flex gap-3">
                  <Link href={`/clients/${id}/ghg/new`} onClick={() => setVsmeModal(false)} className="flex-1 text-white text-center py-2 rounded-md text-sm font-medium" style={{ backgroundColor: GHG_GREEN }}>Fai prima il calcolo GHG</Link>
                  <button onClick={() => setManualMode(true)} className="flex-1 border border-gray-200 py-2 rounded-md text-sm hover:bg-gray-50">Inserisci manualmente</button>
                </div>
              </>
            ) : (
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-medium mb-1 block">Scope 1 tCO₂e</label>
                  <input type="number" step="any" value={manualS1} onChange={(e) => setManualS1(e.target.value)} className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm" placeholder="0.00" />
                </div>
                <div>
                  <label className="text-xs font-medium mb-1 block">Scope 2 tCO₂e</label>
                  <input type="number" step="any" value={manualS2} onChange={(e) => setManualS2(e.target.value)} className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm" placeholder="0.00" />
                </div>
                <div>
                  <label className="text-xs font-medium mb-1 block">Fonte</label>
                  <input type="text" value={manualSource} onChange={(e) => setManualSource(e.target.value)} className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm" placeholder="es. Calcolo interno 2024" />
                </div>
                <div>
                  <label className="text-xs font-medium mb-1 block">Anno</label>
                  <input type="number" value={manualYear} onChange={(e) => setManualYear(Number(e.target.value))} className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm" />
                </div>
                <button onClick={() => { setVsmeModal(false); router.push(`/clients/${id}/vsme/new?manual_s1=${manualS1}&manual_s2=${manualS2}&manual_source=${encodeURIComponent(manualSource)}&manual_year=${manualYear}`); }}
                  className="w-full text-white py-2 rounded-md text-sm font-medium" style={{ backgroundColor: GHG_GREEN }}>Continua →</button>
              </div>
            )}
            <button onClick={() => setVsmeModal(false)} className="w-full text-center text-xs text-gray-400 hover:underline">Annulla</button>
          </div>
        </div>
      )}

      {/* ═══ 4. STORICO DOCUMENTI ═══ */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-[#1C2B28]">Storico documenti</h2>
        </div>
        {docs.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-gray-400">Nessun documento — crea il primo calcolo GHG</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left">
                <th className="px-5 py-2 text-xs text-gray-400 font-medium">Codice</th>
                <th className="px-5 py-2 text-xs text-gray-400 font-medium">Anno</th>
                <th className="px-5 py-2 text-xs text-gray-400 font-medium">Tipo</th>
                <th className="px-5 py-2 text-xs text-gray-400 font-medium">Stato</th>
                <th className="px-5 py-2 text-xs text-gray-400 font-medium text-right">S1</th>
                <th className="px-5 py-2 text-xs text-gray-400 font-medium text-right">S2 LB</th>
                <th className="px-5 py-2 text-xs text-gray-400 font-medium text-right">Totale</th>
                <th className="px-5 py-2 text-xs text-gray-400 font-medium">Azioni</th>
              </tr>
            </thead>
            <tbody>
              {docs.map((d) => {
                const isComplete = d.status === "completato" || d.status === "completed";
                return (
                  <tr key={`${d.type}-${d.id}`} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-5 py-2.5 text-xs text-gray-400 font-mono">{d.code || "—"}</td>
                    <td className="px-5 py-2.5 font-medium">{d.year}</td>
                    <td className="px-5 py-2.5"><span className={`text-xs px-2 py-0.5 rounded-full ${d.type === "GHG" ? "bg-blue-100 text-blue-700" : "bg-green-100 text-green-700"}`}>{d.type === "GHG" ? "GHG S.1+2" : "VSME"}</span></td>
                    <td className="px-5 py-2.5"><span className={`text-xs px-2 py-0.5 rounded-full ${isComplete ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>{isComplete ? "Completato" : "Bozza"}</span></td>
                    <td className="px-5 py-2.5 text-right">{d.s1 > 0 ? d.s1.toFixed(2) : "—"}</td>
                    <td className="px-5 py-2.5 text-right">{d.s2lb > 0 ? d.s2lb.toFixed(2) : "—"}</td>
                    <td className="px-5 py-2.5 text-right font-semibold">{d.total > 0 ? d.total.toFixed(2) : "—"}</td>
                    <td className="px-5 py-2.5">
                      <div className="flex gap-2">
                        {d.type === "GHG" && <Link href={isComplete ? `/clients/${id}/ghg/${d.id}/view` : `/clients/${id}/ghg/${d.id}/edit`} className={`text-xs hover:underline ${isComplete ? "text-green-700" : "text-amber-600"}`}>{isComplete ? "Apri" : "Riprendi"}</Link>}
                        {d.type === "VSME" && <Link href={`/clients/${id}/vsme/${d.id}`} className={`text-xs hover:underline ${isComplete ? "text-green-700" : "text-amber-600"}`}>{isComplete ? "Apri" : "Riprendi"}</Link>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
