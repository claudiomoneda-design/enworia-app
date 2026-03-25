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
                  background: done ? "#E8F9EE" : active ? "#27AE60" : "transparent",
                  border: done ? "none" : active ? "none" : "1.5px solid #8AB5AC",
                  color: done ? "#1A8A47" : active ? "#fff" : "#8AB5AC",
                }}
              >
                {done ? "✓" : i + 1}
              </div>
              <span style={{ fontSize: 10, marginTop: 2, color: done ? "#1A8A47" : active ? "#27AE60" : "#8AB5AC", fontWeight: active ? 500 : 400 }}>
                {s.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div style={{ width: 16, height: 1, background: done ? "#27AE60" : "#E2EAE8", marginBottom: 14 }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function LockBanner({ text, scrollTo }: { text: string; scrollTo?: string }) {
  return (
    <div className="flex items-center gap-3 mt-3 rounded-lg" style={{ background: "#F0F7F5", border: "0.5px solid #C5DDD8", padding: "12px 16px" }}>
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
        <rect x="2" y="6" width="10" height="7" rx="1.5" stroke="#4A6A5E" strokeWidth="1.2"/>
        <path d="M4.5 6V4.5a2.5 2.5 0 015 0V6" stroke="#4A6A5E" strokeWidth="1.2"/>
      </svg>
      <span style={{ fontSize: 13, color: "#4A6A5E", flex: 1 }}>{text}</span>
      {scrollTo && (
        <a href={scrollTo} style={{ fontSize: 12, color: "#27AE60", fontWeight: 500, whiteSpace: "nowrap", textDecoration: "none" }}>
          Vai a GHG →
        </a>
      )}
    </div>
  );
}

function Metric({ label, value, color, highlight }: { label: string; value: string; color: string; highlight?: boolean }) {
  return (
    <div className="text-center" style={highlight ? { background: "#E8F9EE", border: "1px solid #6FCF97", borderRadius: 8, padding: "4px 14px" } : { background: "#F0F7F5", borderRadius: 8, padding: "4px 14px" }}>
      <div style={{ fontSize: 10, color: "#8AB5AC", textTransform: "uppercase" as const, letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 700, color: highlight ? "#1A8A47" : color }}>{value}</div>
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

  const fmtT = (v: number | null) => v != null && v > 0 ? `${Number(v).toFixed(2)} t` : "n.d.";
  const hasValue = (v: number | null) => v != null && v > 0;

  // Unified doc list
  const docs: DocRow[] = [
    ...ghgReports.map((r) => ({ id: r.id, year: r.year, code: r.report_code, type: "GHG" as const, status: r.status, s1: Number(r.scope1_total ?? 0), s2lb: Number(r.scope2_lb_total ?? 0), total: Number(r.total_co2eq ?? 0) || Number(r.scope1_total ?? 0) + Number(r.scope2_lb_total ?? 0) })),
    ...vsmeReports.map((r) => ({ id: r.id, year: r.anno, code: null, type: "VSME" as const, status: r.status, s1: 0, s2lb: 0, total: 0 })),
  ].sort((a, b) => b.year - a.year);

  return (
    <div className="space-y-5 max-w-4xl mx-auto" style={{ fontFamily: "Arial, sans-serif" }}>

      {/* ═══ 1. HEADER ═══ */}
      <div style={{ padding: "28px 0 24px" }}>
        <div className="flex justify-between items-start">
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: -0.4, color: "#1C2B28", margin: 0 }}>
              {c.company_name || "Bozza senza nome"}
            </h1>
            <div className="flex items-center gap-2.5" style={{ marginTop: 6 }}>
              <span style={{ fontSize: 13, color: "#5A9088" }}>
                {c.nace_code ? `ATECO ${c.nace_code}` : ""}{c.nace_code && c.number_of_employees != null ? " · " : ""}{c.number_of_employees != null ? `${c.number_of_employees} dip.` : ""}
              </span>
              <span style={{ background: isComplete(c.form_status || "") ? "#E8F9EE" : "#FFF3DC", color: isComplete(c.form_status || "") ? "#1A8A47" : "#92600A", fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 4 }}>
                {isComplete(c.form_status || "") ? "Completato" : "Bozza"}
              </span>
              <Link href={`/clients/${id}/edit`} style={{ fontSize: 13, color: "#27AE60", textDecoration: "none", fontWeight: 500 }}>
                Modifica dati
              </Link>
            </div>
          </div>
          <Link href="/clients" style={{ fontSize: 13, color: "#5A9088", textDecoration: "none", marginTop: 4 }}>
            ← Tutti i clienti
          </Link>
        </div>
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
      <div id="modulo-ghg" className="bg-white p-5" style={{ borderLeft: "3px solid #27AE60", borderRadius: 12, border: "0.5px solid #E2EAE8", borderLeftWidth: 3, borderLeftColor: "#27AE60", boxShadow: "0 1px 3px rgba(28,43,40,0.08)" }}>
        <div className="flex items-start gap-4">
          <div className="flex items-center justify-center rounded-full text-xs font-bold text-white" style={{ width: 28, height: 28, background: "#27AE60", flexShrink: 0 }}>{hasCompletedGhg ? "✓" : "1"}</div>
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[#1C2B28]">Calcolo GHG Scope 1+2</h3>
              {latestGhg && (
                <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 4, background: isComplete(latestGhg.status) ? "#E8F9EE" : "#FFF3DC", color: isComplete(latestGhg.status) ? "#1A8A47" : "#92600A" }}>
                  {isComplete(latestGhg.status) ? "Completato" : "Bozza"}
                </span>
              )}
            </div>
            <p className="text-xs text-gray-400 mt-1">Emissioni dirette e da energia acquistata — ISO 14064-1</p>

            {latestGhg && (Number(latestGhg.total_co2eq ?? 0) > 0 || Number(latestGhg.scope1_total ?? 0) > 0 || Number(latestGhg.scope2_lb_total ?? 0) > 0) && (
              <div className="flex gap-6 mt-3 py-2.5 px-4 rounded-md" style={{ background: "#F8FAFB" }}>
                <Metric label="Scope 1" value={fmtT(latestGhg.scope1_total)} color={hasValue(latestGhg.scope1_total) ? "#15803d" : "#ccc"} />
                <Metric label="Scope 2 LB" value={fmtT(latestGhg.scope2_lb_total)} color={hasValue(latestGhg.scope2_lb_total) ? "#1d4ed8" : "#ccc"} />
                <Metric label="Totale" value={fmtT(latestGhg.total_co2eq)} color={hasValue(latestGhg.total_co2eq) ? "#3B6D11" : "#ccc"} highlight={hasValue(latestGhg.total_co2eq)} />
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
                className="text-white px-4 py-2 text-sm transition-colors" style={{ backgroundColor: "#27AE60", borderRadius: 8, fontWeight: 600 }}>
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
      <div className="p-5" style={{ borderRadius: 12, border: "0.5px solid #E2EAE8", ...(vsmeBasicUnlocked ? { background: "#fff", borderLeft: "3px solid #27AE60", boxShadow: "0 1px 3px rgba(28,43,40,0.08)" } : { background: "#F4F8F7", opacity: 0.7 }) }}>
        <div className="flex items-start gap-4">
          <div className="flex items-center justify-center rounded-full text-xs font-bold" style={{ width: 28, height: 28, background: vsmeBasicUnlocked ? "#27AE60" : "transparent", border: vsmeBasicUnlocked ? "none" : "1.5px solid #8AB5AC", color: vsmeBasicUnlocked ? "#fff" : "#8AB5AC", flexShrink: 0 }}>{hasCompletedVsmeBasic ? "✓" : "2"}</div>
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold" style={{ color: vsmeBasicUnlocked ? "#1C2B28" : "#666" }}>VSME Basic</h3>
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
              <LockBanner text="Completa prima il calcolo GHG Scope 1+2" scrollTo="#modulo-ghg" />
            )}
          </div>
        </div>
      </div>

      {/* ── MODULO 3: Scope 3 ── */}
      <div className="p-5" style={{ borderRadius: 12, border: "0.5px solid #E2EAE8", ...(scope3Unlocked ? { background: "#fff", borderLeft: "3px solid #27AE60", boxShadow: "0 1px 3px rgba(28,43,40,0.08)" } : { background: "#F4F8F7", opacity: 0.7 }) }}>
        <div className="flex items-start gap-4">
          <div className="flex items-center justify-center rounded-full text-xs font-bold" style={{ width: 28, height: 28, background: scope3Unlocked ? "#27AE60" : "transparent", border: scope3Unlocked ? "none" : "1.5px solid #8AB5AC", color: scope3Unlocked ? "#fff" : "#8AB5AC", flexShrink: 0 }}>3</div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold" style={{ color: scope3Unlocked ? "#1C2B28" : "#666" }}>Scope 3 — Emissioni indirette</h3>
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
              <LockBanner text="Completa prima il calcolo GHG Scope 1+2" scrollTo="#modulo-ghg" />
            )}
          </div>
        </div>
      </div>

      {/* ── MODULO 4: VSME Comprehensive ── */}
      <div className="p-5" style={{ borderRadius: 12, border: "0.5px solid #E2EAE8", ...(vsmeCompUnlocked ? { background: "#fff", borderLeft: "3px solid #27AE60", boxShadow: "0 1px 3px rgba(28,43,40,0.08)" } : { background: "#F4F8F7", opacity: 0.7 }) }}>
        <div className="flex items-start gap-4">
          <div className="flex items-center justify-center rounded-full text-xs font-bold" style={{ width: 28, height: 28, background: vsmeCompUnlocked ? "#27AE60" : "transparent", border: vsmeCompUnlocked ? "none" : "1.5px solid #8AB5AC", color: vsmeCompUnlocked ? "#fff" : "#8AB5AC", flexShrink: 0 }}>4</div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold" style={{ color: vsmeCompUnlocked ? "#1C2B28" : "#666" }}>VSME Comprehensive</h3>
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
      <div className="overflow-hidden" style={{ background: "#fff", borderRadius: 12, border: "0.5px solid #E2EAE8", padding: "0" }}>
        <div style={{ padding: "16px 24px", borderBottom: "0.5px solid #E2EAE8" }}>
          <h2 style={{ fontSize: 13, fontWeight: 600, color: "#1C2B28", margin: 0 }}>Storico documenti</h2>
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
