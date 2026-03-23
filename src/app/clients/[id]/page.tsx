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
  year: number; // alias for compat
  report_code: string | null;
  status: string;
  scope1_total: number | null;
  scope2_lb_total: number | null;
  scope2_mb_total: number | null;
  total_co2eq: number | null;
}

interface VsmeReportRow {
  id: string;
  anno: number;
  status: string;
}

type DocRow = {
  id: string;
  year: number;
  code: string | null;
  type: "GHG" | "VSME";
  status: string;
  s1: number;
  s2lb: number;
  total: number;
};

function lbl(value: string, list: readonly { value: string; label: string }[]): string {
  return list.find((i) => i.value === value)?.label ?? value;
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="grid grid-cols-[180px_1fr] gap-3 py-1.5 border-b border-gray-100 last:border-0">
      <span className="text-xs text-[var(--muted)]">{label}</span>
      <span className="text-xs text-[var(--foreground)]">{value}</span>
    </div>
  );
}

export default function ClientDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const [company, setCompany] = useState<Company | null>(null);
  const [ghgReports, setGhgReports] = useState<GhgReportRow[]>([]);
  const [vsmeReports, setVsmeReports] = useState<VsmeReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [companyOpen, setCompanyOpen] = useState(false);
  const [vsmeModal, setVsmeModal] = useState(false);
  const [manualMode, setManualMode] = useState(false);
  const [manualS1, setManualS1] = useState("");
  const [manualS2, setManualS2] = useState("");
  const [manualSource, setManualSource] = useState("");
  const [manualYear, setManualYear] = useState(new Date().getFullYear() - 1);
  const [ghgModal, setGhgModal] = useState(false);
  const [ghgNewYear, setGhgNewYear] = useState(new Date().getFullYear() - 1);
  const [ghgExisting, setGhgExisting] = useState<GhgReportRow | null>(null);
  const [ghgChecking, setGhgChecking] = useState(false);

  useEffect(() => {
    (async () => {
      const [{ data: co }, { data: ghg }, { data: vsme }] = await Promise.all([
        supabase.from("companies").select("*").eq("id", id).single(),
        supabase
          .from("ghg_reports")
          .select("id, reference_year, report_code, status, scope1_total, scope2_lb_total, scope2_mb_total, total_co2eq")
          .eq("company_id", id)
          .order("reference_year", { ascending: false }),
        supabase
          .from("vsme_reports")
          .select("id, anno, status")
          .eq("client_id", id)
          .order("anno", { ascending: false }),
      ]);
      if (co) setCompany(co as Company);
      if (ghg) setGhgReports((ghg as GhgReportRow[]).map((r) => ({ ...r, year: r.reference_year || r.year })));
      if (vsme) setVsmeReports(vsme as VsmeReportRow[]);
      setLoading(false);
    })();
  }, [id]);

  if (loading) return <p className="text-[var(--muted)] text-sm py-8">Caricamento...</p>;
  if (!company) return <p className="text-red-600 text-sm py-8">Cliente non trovato.</p>;

  const c = company;
  const latestGhg = ghgReports.find((r) => r.status === "completato" || r.status === "completed");
  const hasCompletedGhg = !!latestGhg;

  // Unified document list
  const docs: DocRow[] = [
    ...ghgReports.map((r) => ({
      id: r.id,
      year: r.year,
      code: r.report_code,
      type: "GHG" as const,
      status: r.status,
      s1: Number(r.scope1_total ?? 0),
      s2lb: Number(r.scope2_lb_total ?? 0),
      total: Number(r.total_co2eq ?? 0) || Number(r.scope1_total ?? 0) + Number(r.scope2_lb_total ?? 0),
    })),
    ...vsmeReports.map((r) => ({
      id: r.id,
      year: r.anno,
      code: null,
      type: "VSME" as const,
      status: r.status,
      s1: 0,
      s2lb: 0,
      total: 0,
    })),
  ].sort((a, b) => {
    if (a.year !== b.year) return b.year - a.year;
    const aComplete = a.status === "completato" || a.status === "completed";
    const bComplete = b.status === "completato" || b.status === "completed";
    if (aComplete !== bComplete) return aComplete ? -1 : 1;
    return a.type === "GHG" ? -1 : 1;
  });

  return (
    <div className="space-y-6" style={{ fontFamily: "Arial, sans-serif" }}>
      {/* ═══ 1. HEADER ═══ */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--primary)]">
            {c.company_name || "Bozza senza nome"}
          </h1>
          <div className="flex items-center gap-3 mt-1">
            {c.nace_code && <span className="text-xs text-[var(--muted)]">ATECO {c.nace_code}</span>}
            {c.number_of_employees != null && (
              <span className="text-xs text-[var(--muted)]">{c.number_of_employees} dipendenti</span>
            )}
            <span className={`text-xs px-2 py-0.5 rounded-full ${
              c.form_status === "draft" ? "bg-amber-100 text-amber-700" : "bg-green-100 text-green-700"
            }`}>
              {c.form_status === "draft" ? "Bozza" : "Attivo"}
            </span>
          </div>
        </div>
        <div className="flex gap-2">
          <Link
            href={`/clients/${id}/edit`}
            className="border border-[var(--border)] text-[var(--foreground)] px-3 py-1.5 rounded-md text-sm hover:bg-gray-50 transition-colors"
          >
            Modifica dati
          </Link>
          <Link
            href="/clients"
            className="border border-[var(--border)] text-[var(--muted)] px-3 py-1.5 rounded-md text-sm hover:bg-gray-50 transition-colors"
          >
            ← Tutti i clienti
          </Link>
        </div>
      </div>

      {/* ═══ 2. CARD DATI AZIENDA (collapsible) ═══ */}
      <div className="bg-white rounded-lg border border-[var(--border)] overflow-hidden">
        <button
          type="button"
          onClick={() => setCompanyOpen(!companyOpen)}
          className="w-full flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition-colors"
        >
          <span className="text-sm font-semibold text-[var(--foreground)]">Dati azienda</span>
          <span className="text-[var(--muted)] text-xs">{companyOpen ? "▲" : "▼"}</span>
        </button>
        {companyOpen && (
          <div className="px-5 pb-4 border-t border-gray-100">
            <div className="grid grid-cols-2 gap-x-8 pt-3">
              <div>
                <DetailRow label="Ragione sociale" value={c.company_name} />
                <DetailRow label="Codice fiscale / P.IVA" value={(c as unknown as Record<string, string>).vat_number} />
                <DetailRow label="Codice ATECO" value={c.nace_code ? `${c.nace_code} — ${c.nace_description}` : null} />
                <DetailRow label="Forma giuridica" value={c.legal_form} />
              </div>
              <div>
                <DetailRow label="Dipendenti" value={c.number_of_employees != null ? `${c.number_of_employees} (${lbl(c.employee_unit, EMPLOYEE_UNITS)})` : null} />
                <DetailRow label="Fatturato" value={c.turnover_eur != null ? `${Number(c.turnover_eur).toLocaleString("it-IT")} EUR` : null} />
                <DetailRow label="Sede legale" value={c.registered_address} />
                <DetailRow label="Paese" value={lbl(c.primary_country, EU_COUNTRIES)} />
              </div>
            </div>
            <div className="mt-3 pt-3 border-t border-gray-100">
              <Link
                href={`/clients/${id}/edit`}
                className="text-xs font-medium hover:underline"
                style={{ color: GHG_GREEN }}
              >
                Modifica dati azienda →
              </Link>
            </div>
          </div>
        )}
      </div>

      {/* ═══ 3. THREE ACTION CARDS ═══ */}
      <div className="grid grid-cols-3 gap-4">
        {/* Card 1 — GHG */}
        <div className="bg-white rounded-lg border border-[var(--border)] p-5 flex flex-col">
          <h3 className="text-sm font-semibold text-[var(--foreground)] mb-1">Calcolo GHG Scope 1+2</h3>
          <p className="text-xs text-[var(--muted)] mb-4 flex-1">
            Misura le emissioni dirette (Scope 1) e da energia acquistata (Scope 2) secondo ISO 14064-1
          </p>
          <button
            type="button"
            onClick={() => { setGhgModal(true); setGhgExisting(null); setGhgNewYear(new Date().getFullYear() - 1); }}
            className="text-white text-center px-4 py-2 rounded-md text-sm font-medium transition-colors block w-full"
            style={{ backgroundColor: GHG_GREEN }}
          >
            + Nuovo calcolo GHG
          </button>
          {ghgReports.length > 0 && (
            <Link
              href={`/clients/${id}/ghg`}
              className="text-xs text-[var(--muted)] text-center mt-2 hover:underline"
            >
              Vedi storico ({ghgReports.length} calcoli)
            </Link>
          )}
        </div>

        {/* Card 2 — VSME */}
        <div className="bg-white rounded-lg border border-[var(--border)] p-5 flex flex-col">
          <h3 className="text-sm font-semibold text-[var(--foreground)] mb-1">Bilancio VSME</h3>
          <p className="text-xs text-[var(--muted)] mb-4 flex-1">
            Report ESG completo per PMI europee secondo standard EFRAG VSME
          </p>
          <button
            type="button"
            onClick={() => { setVsmeModal(true); setManualMode(false); }}
            className="text-white text-center px-4 py-2 rounded-md text-sm font-medium transition-colors"
            style={{ backgroundColor: GHG_GREEN }}
          >
            Crea bilancio VSME
          </button>
        </div>

        {/* Card 3 — PDF */}
        <div className="bg-white rounded-lg border border-[var(--border)] p-5 flex flex-col">
          <h3 className="text-sm font-semibold text-[var(--foreground)] mb-1">Report GHG Completo</h3>
          <p className="text-xs text-[var(--muted)] mb-4 flex-1">
            Report ISO 14064-1 completo con verifica incertezza e ripartizione per gas
          </p>
          <button
            type="button"
            disabled={!hasCompletedGhg}
            className="text-white text-center px-4 py-2 rounded-md text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ backgroundColor: GHG_GREEN }}
            title={!hasCompletedGhg ? "Disponibile dopo aver completato un calcolo GHG" : undefined}
          >
            Genera report PDF
          </button>
          {!hasCompletedGhg && (
            <p className="text-[10px] text-[var(--muted)] text-center mt-1">
              Completa prima un calcolo GHG
            </p>
          )}
        </div>
      </div>

      {/* ═══ VSME MODAL ═══ */}
      {vsmeModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setVsmeModal(false)}>
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-[var(--foreground)]">Bilancio VSME</h2>

            {!manualMode && latestGhg ? (
              <>
                <div className="bg-green-50 border border-green-200 rounded-md px-4 py-3 text-sm text-green-800 space-y-1">
                  <p className="font-medium">Trovato calcolo GHG {latestGhg.year}</p>
                  <p>Scope 1: {Number(latestGhg.scope1_total ?? 0).toFixed(2)} tCO₂e</p>
                  <p>Scope 2: {Number(latestGhg.scope2_lb_total ?? 0).toFixed(2)} tCO₂e</p>
                  <p className="text-xs italic mt-1">Questi dati verranno usati nel VSME</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setVsmeModal(false);
                    // Navigate to VSME with GHG data (placeholder route)
                    router.push(`/clients/${id}/vsme/new?ghg_report_id=${latestGhg.id}`);
                  }}
                  className="w-full text-white py-2 rounded-md text-sm font-medium"
                  style={{ backgroundColor: GHG_GREEN }}
                >
                  Continua con questi dati →
                </button>
              </>
            ) : !manualMode ? (
              <>
                <div className="bg-amber-50 border border-amber-200 rounded-md px-4 py-3 text-sm text-amber-800">
                  Nessun calcolo GHG completato per questo cliente
                </div>
                <div className="flex gap-3">
                  <Link
                    href={`/clients/${id}/ghg/new`}
                    onClick={() => setVsmeModal(false)}
                    className="flex-1 text-white text-center py-2 rounded-md text-sm font-medium"
                    style={{ backgroundColor: GHG_GREEN }}
                  >
                    Fai prima il calcolo GHG
                  </Link>
                  <button
                    type="button"
                    onClick={() => setManualMode(true)}
                    className="flex-1 border border-[var(--border)] text-[var(--foreground)] py-2 rounded-md text-sm hover:bg-gray-50"
                  >
                    Inserisci manualmente
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-medium text-[var(--foreground)] mb-1 block">Scope 1 tCO₂e</label>
                    <input type="number" step="any" value={manualS1} onChange={(e) => setManualS1(e.target.value)}
                      className="w-full border border-[var(--border)] rounded-md px-3 py-2 text-sm" placeholder="0.00" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-[var(--foreground)] mb-1 block">Scope 2 tCO₂e</label>
                    <input type="number" step="any" value={manualS2} onChange={(e) => setManualS2(e.target.value)}
                      className="w-full border border-[var(--border)] rounded-md px-3 py-2 text-sm" placeholder="0.00" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-[var(--foreground)] mb-1 block">Fonte dati</label>
                    <input type="text" value={manualSource} onChange={(e) => setManualSource(e.target.value)}
                      className="w-full border border-[var(--border)] rounded-md px-3 py-2 text-sm" placeholder="es. Calcolo interno 2024" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-[var(--foreground)] mb-1 block">Anno di riferimento</label>
                    <input type="number" value={manualYear} onChange={(e) => setManualYear(Number(e.target.value))}
                      className="w-full border border-[var(--border)] rounded-md px-3 py-2 text-sm" />
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setVsmeModal(false);
                    router.push(`/clients/${id}/vsme/new?manual_s1=${manualS1}&manual_s2=${manualS2}&manual_source=${encodeURIComponent(manualSource)}&manual_year=${manualYear}`);
                  }}
                  className="w-full text-white py-2 rounded-md text-sm font-medium"
                  style={{ backgroundColor: GHG_GREEN }}
                >
                  Continua →
                </button>
              </>
            )}

            <button
              type="button"
              onClick={() => setVsmeModal(false)}
              className="w-full text-center text-xs text-[var(--muted)] hover:underline"
            >
              Annulla
            </button>
          </div>
        </div>
      )}

      {/* ═══ GHG YEAR MODAL ═══ */}
      {ghgModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setGhgModal(false)}>
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-[var(--foreground)]">Nuovo calcolo GHG</h2>
            <div>
              <label className="text-sm font-medium text-[var(--foreground)] mb-1.5 block">Anno di riferimento</label>
              <input
                type="number"
                value={ghgNewYear}
                onChange={(e) => {
                  const y = Number(e.target.value);
                  setGhgNewYear(y);
                  setGhgChecking(true);
                  const found = ghgReports.find((r) => r.year === y);
                  setGhgExisting(found || null);
                  setGhgChecking(false);
                }}
                min={2015}
                max={2099}
                className="w-full border border-[var(--border)] rounded-md px-3 py-2 text-sm"
              />
            </div>

            {ghgChecking ? (
              <p className="text-xs text-[var(--muted)]">Verifica...</p>
            ) : ghgExisting ? (() => {
              const isComp = ghgExisting.status === "completato" || ghgExisting.status === "completed";
              return isComp ? (
                <div className="space-y-3">
                  <div className="bg-blue-50 border border-blue-200 rounded-md px-3 py-2 text-sm text-blue-800">
                    Hai già un report completato per il {ghgNewYear}
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => { setGhgModal(false); router.push(`/clients/${id}/ghg/${ghgExisting.id}/edit`); }}
                      className="flex-1 text-white py-2 rounded-md text-sm font-medium" style={{ backgroundColor: GHG_GREEN }}>
                      Modifica esistente
                    </button>
                    <button type="button" onClick={() => { setGhgModal(false); router.push(`/clients/${id}/ghg/new?anno=${ghgNewYear}`); }}
                      className="flex-1 border border-[var(--border)] text-[var(--foreground)] py-2 rounded-md text-sm hover:bg-gray-50">
                      Nuovo calcolo
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="bg-amber-50 border border-amber-200 rounded-md px-3 py-2 text-sm text-amber-800">
                    Hai già una bozza per il {ghgNewYear}
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => { setGhgModal(false); router.push(`/clients/${id}/ghg/${ghgExisting.id}/edit`); }}
                      className="flex-1 text-white py-2 rounded-md text-sm font-medium" style={{ backgroundColor: GHG_GREEN }}>
                      Riprendi bozza
                    </button>
                    <button type="button" onClick={() => { setGhgModal(false); router.push(`/clients/${id}/ghg/new?anno=${ghgNewYear}`); }}
                      className="flex-1 border border-[var(--border)] text-[var(--foreground)] py-2 rounded-md text-sm hover:bg-gray-50">
                      Inizia da capo
                    </button>
                  </div>
                </div>
              );
            })() : (
              <button type="button" onClick={() => { setGhgModal(false); router.push(`/clients/${id}/ghg/new?anno=${ghgNewYear}`); }}
                className="w-full text-white py-2 rounded-md text-sm font-medium" style={{ backgroundColor: GHG_GREEN }}>
                Inizia calcolo {ghgNewYear}
              </button>
            )}

            <button type="button" onClick={() => setGhgModal(false)}
              className="w-full text-center text-xs text-[var(--muted)] hover:underline">
              Annulla
            </button>
          </div>
        </div>
      )}

      {/* ═══ 4. STORICO DOCUMENTI UNIFICATO ═══ */}
      <div className="bg-white rounded-lg border border-[var(--border)] overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-[var(--foreground)]">Storico documenti</h2>
        </div>
        {docs.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <p className="text-sm text-[var(--muted)]">
              Nessun documento ancora — usa i pulsanti sopra per creare il primo calcolo GHG o bilancio VSME
            </p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left">
                <th className="px-5 py-2 text-xs text-[var(--muted)] font-medium">Codice</th>
                <th className="px-5 py-2 text-xs text-[var(--muted)] font-medium">Anno</th>
                <th className="px-5 py-2 text-xs text-[var(--muted)] font-medium">Tipo</th>
                <th className="px-5 py-2 text-xs text-[var(--muted)] font-medium">Stato</th>
                <th className="px-5 py-2 text-xs text-[var(--muted)] font-medium text-right">Scope 1</th>
                <th className="px-5 py-2 text-xs text-[var(--muted)] font-medium text-right">Scope 2 LB</th>
                <th className="px-5 py-2 text-xs text-[var(--muted)] font-medium text-right">Totale</th>
                <th className="px-5 py-2 text-xs text-[var(--muted)] font-medium">Azioni</th>
              </tr>
            </thead>
            <tbody>
              {docs.map((d) => {
                const isComplete = d.status === "completato" || d.status === "completed";
                return (
                  <tr key={`${d.type}-${d.id}`} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-5 py-2.5 text-xs text-[var(--muted)] font-mono">{d.code || "—"}</td>
                    <td className="px-5 py-2.5 font-medium">{d.year}</td>
                    <td className="px-5 py-2.5">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        d.type === "GHG" ? "bg-blue-100 text-blue-700" : "bg-green-100 text-green-700"
                      }`}>
                        {d.type === "GHG" ? "GHG S.1+2" : "VSME"}
                      </span>
                    </td>
                    <td className="px-5 py-2.5">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        isComplete ? "bg-[#006450]/10 text-[#006450]" : "bg-amber-100 text-amber-700"
                      }`}>
                        {isComplete ? "Completato" : "Bozza"}
                      </span>
                    </td>
                    <td className="px-5 py-2.5 text-right">{d.s1 > 0 ? d.s1.toFixed(2) : "—"}</td>
                    <td className="px-5 py-2.5 text-right">{d.s2lb > 0 ? d.s2lb.toFixed(2) : "—"}</td>
                    <td className="px-5 py-2.5 text-right font-semibold">{d.total > 0 ? d.total.toFixed(2) : "—"}</td>
                    <td className="px-5 py-2.5">
                      <div className="flex gap-2">
                        {d.type === "GHG" && isComplete && (
                          <>
                            <Link href={`/clients/${id}/ghg/${d.id}/view`} className="text-[#006450] hover:underline text-xs">Apri</Link>
                            <Link href={`/clients/${id}/ghg/${d.id}/edit`} className="text-amber-600 hover:underline text-xs">Modifica</Link>
                            <span className="text-gray-300 text-xs cursor-not-allowed" title="In arrivo">PDF</span>
                          </>
                        )}
                        {d.type === "GHG" && !isComplete && (
                          <Link href={`/clients/${id}/ghg/${d.id}/edit`} className="text-amber-600 hover:underline text-xs">Riprendi</Link>
                        )}
                        {d.type === "VSME" && isComplete && (
                          <>
                            <Link href={`/clients/${id}/vsme/${d.id}`} className="text-[#006450] hover:underline text-xs">Apri</Link>
                            <Link href={`/clients/${id}/vsme/${d.id}/edit`} className="text-amber-600 hover:underline text-xs">Modifica</Link>
                            <span className="text-gray-300 text-xs cursor-not-allowed" title="In arrivo">PDF</span>
                          </>
                        )}
                        {d.type === "VSME" && !isComplete && (
                          <Link href={`/clients/${id}/vsme/${d.id}`} className="text-amber-600 hover:underline text-xs">Riprendi</Link>
                        )}
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
