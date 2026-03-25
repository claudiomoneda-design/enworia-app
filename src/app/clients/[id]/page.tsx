"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { getClientDashboard, type DashboardData } from "@/lib/getClientDashboard";
import type { Company } from "@/types/database";

const MESI_IT = ['', 'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];

interface GhgReportRow { id: string; reference_year: number; year: number; report_code: string | null; status: string; scope1_total: number | null; scope2_lb_total: number | null; scope2_mb_total: number | null; total_co2eq: number | null }
interface VsmeReportRow { id: string; anno: number; status: string }
type DocRow = { id: string; year: number; code: string | null; type: "GHG" | "VSME"; status: string; s1: number; s2lb: number; total: number }

const isComp = (s: string) => s === "completato" || s === "completed";
const fmtT = (v: number) => v > 0 ? v.toFixed(2) : "—";

// ── Badge component ─────────────────────────────────────────────────────────
function Badge({ value, up }: { value: string; up: boolean }) {
  return (
    <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 4, background: up ? "#FFF3DC" : "#E8F9EE", color: up ? "#C8860A" : "#1A8A47" }}>
      {up ? "↑" : "↓"} {value}
    </span>
  );
}

// ── KPI Card ────────────────────────────────────────────────────────────────
function KpiCard({ label, value, unit, badge, delta, alertBorder, dark }: {
  label: string; value: string; unit?: string; badge?: { text: string; up: boolean } | null; delta?: string | null; alertBorder?: boolean; dark?: boolean
}) {
  return (
    <div style={{
      background: dark ? "#1C2B28" : "#fff",
      borderRadius: 12, padding: "18px 20px",
      border: alertBorder ? "1.5px solid #E8B84B" : dark ? "none" : "0.5px solid #E2EAE8",
      flex: 1, minWidth: 0,
    }}>
      <div style={{ fontSize: 11, color: dark ? "#6FCF97" : "#8AB5AC", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>{label}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
        <span style={{ fontSize: 28, fontWeight: 700, color: dark ? "#fff" : "#1C2B28", fontFamily: "var(--font-dm-mono), monospace" }}>{value}</span>
        {unit && <span style={{ fontSize: 13, color: dark ? "#8AB5AC" : "#8AB5AC" }}>{unit}</span>}
      </div>
      {badge && <div style={{ marginTop: 6 }}><Badge value={badge.text} up={badge.up} /></div>}
      {delta && <div style={{ fontSize: 11, color: delta.startsWith("↑") ? "#C8860A" : "#1A8A47", marginTop: 4 }}>{delta}</div>}
    </div>
  );
}

// ── Mini bar chart ──────────────────────────────────────────────────────────
function MiniChart({ data }: { data: DashboardData["mensili"] }) {
  if (data.length === 0) return null;
  const max = Math.max(...data.map(d => d.tCO2e), 0.001);
  const maxIdx = data.findIndex(d => d.tCO2e === max);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 40, marginTop: 8 }}>
      {data.map((d, i) => (
        <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
          <div style={{
            width: "100%", borderRadius: 2, minHeight: 2,
            height: `${Math.max((d.tCO2e / max) * 32, 2)}px`,
            background: i === maxIdx ? "#27AE60" : "#2A3D39",
            opacity: d.tCO2e > 0 ? 1 : 0.4,
          }} />
          <span style={{ fontSize: 8, color: i === data.length - 1 ? "#27AE60" : "#5A9088", fontWeight: i === data.length - 1 ? 700 : 400 }}>{d.label}</span>
        </div>
      ))}
    </div>
  );
}

// ── Lock Banner ─────────────────────────────────────────────────────────────
function LockText({ text }: { text: string }) {
  return <span style={{ fontSize: 11, color: "#5A9088", marginTop: 4, display: "block" }}>{text}</span>;
}

// ── Main ────────────────────────────────────────────────────────────────────
export default function ClientDetailPage() {
  const { id } = useParams() as { id: string };
  const router = useRouter();
  const [company, setCompany] = useState<Company | null>(null);
  const [dash, setDash] = useState<DashboardData | null>(null);
  const [ghgReports, setGhgReports] = useState<GhgReportRow[]>([]);
  const [vsmeReports, setVsmeReports] = useState<VsmeReportRow[]>([]);
  const [loading, setLoading] = useState(true);

  // GHG modal
  const [ghgModal, setGhgModal] = useState(false);
  const [ghgNewYear, setGhgNewYear] = useState(new Date().getFullYear() - 1);
  const [ghgExisting, setGhgExisting] = useState<GhgReportRow | null>(null);

  useEffect(() => {
    (async () => {
      const [{ data: co }, { data: ghg }, { data: vsme }, dashboard] = await Promise.all([
        supabase.from("companies").select("*").eq("id", id).single(),
        supabase.from("ghg_reports").select("*").eq("company_id", id).order("reference_year", { ascending: false }),
        supabase.from("vsme_reports").select("id, anno, status").eq("client_id", id).order("anno", { ascending: false }),
        getClientDashboard(id),
      ]);
      if (co) setCompany(co as Company);
      if (ghg) setGhgReports((ghg as GhgReportRow[]).map(r => ({ ...r, year: r.reference_year || r.year })));
      if (vsme) setVsmeReports(vsme as VsmeReportRow[]);
      setDash(dashboard);
      setLoading(false);
    })();
  }, [id]);

  if (loading) return <p style={{ color: "#8AB5AC", padding: 32 }}>Caricamento...</p>;
  if (!company) return <p style={{ color: "#C0392B", padding: 32 }}>Cliente non trovato.</p>;

  const c = company;
  const completedGhg = ghgReports.find(r => isComp(r.status));
  const hasCompletedGhg = !!completedGhg;
  const latestGhg = ghgReports[0];
  const completedVsme = vsmeReports.find(r => isComp(r.status));
  const d = dash!;

  const docs: DocRow[] = [
    ...ghgReports.map(r => ({ id: r.id, year: r.year, code: r.report_code, type: "GHG" as const, status: r.status, s1: Number(r.scope1_total ?? 0), s2lb: Number(r.scope2_lb_total ?? 0), total: Number(r.total_co2eq ?? 0) || Number(r.scope1_total ?? 0) + Number(r.scope2_lb_total ?? 0) })),
    ...vsmeReports.map(r => ({ id: r.id, year: r.anno, code: null, type: "VSME" as const, status: r.status, s1: 0, s2lb: 0, total: 0 })),
  ].sort((a, b) => b.year - a.year);

  const now = new Date();
  const meseLabel = MESI_IT[now.getMonth() + 1];
  const annoLabel = now.getFullYear();

  return (
    <div style={{ maxWidth: 960, margin: "0 auto" }}>

      {/* ═══ HEADER ═══ */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "24px 0 20px" }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, letterSpacing: -0.4, color: "#1C2B28", margin: 0 }}>
            Situazione emissioni — {meseLabel} {annoLabel}
          </h1>
          <div style={{ fontSize: 13, color: "#5A9088", marginTop: 4 }}>
            {c.company_name}{c.nace_code ? ` · ATECO ${c.nace_code}` : ""}
            <Link href={`/clients/${id}/edit`} style={{ color: "#27AE60", marginLeft: 12, fontWeight: 500, textDecoration: "none" }}>Modifica dati</Link>
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 11, color: "#8AB5AC" }}>Aggiornamento: {now.toLocaleDateString("it-IT")}</div>
          <Link href="/clients" style={{ fontSize: 12, color: "#5A9088", textDecoration: "none" }}>← Tutti i clienti</Link>
        </div>
      </div>

      {/* ═══ ALERT BAR ═══ */}
      {d.alerts.length > 0 && d.alerts.map((a, i) => (
        <div key={i} style={{ background: "#FFF8EC", border: "1px solid #E8B84B", borderRadius: 10, padding: "14px 18px", marginBottom: 16, display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#E8B84B", flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, color: "#1C2B28", fontWeight: 500 }}>{a.messaggio} — possibile aumento consumi</div>
            <div style={{ fontSize: 11, color: "#92600A", marginTop: 2 }}>↑ +{a.impatto_tco2e} t CO₂e rispetto alla media degli ultimi 6 mesi — verifica prima di chiudere il mese</div>
          </div>
          <button style={{ fontSize: 12, color: "#27AE60", border: "1.5px solid #27AE60", borderRadius: 6, padding: "5px 12px", background: "transparent", fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>
            Capisci perché →
          </button>
        </div>
      ))}

      {/* ═══ KPI GRID or ONBOARDING ═══ */}
      {d.hasDati ? (
        <div style={{ display: "flex", gap: 12, marginBottom: 24 }}>
          <KpiCard
            label={d.meseCorrente.label}
            value={d.meseCorrente.tCO2e > 0 ? d.meseCorrente.tCO2e.toFixed(2) : "—"}
            unit="t CO₂e"
            badge={d.meseCorrente.vs_mese_prec_pct != null ? { text: `${Math.abs(d.meseCorrente.vs_mese_prec_pct)}%`, up: d.meseCorrente.vs_mese_prec_pct > 0 } : null}
            delta={d.meseCorrente.vs_media6m_delta != null && d.meseCorrente.vs_media6m_delta > 0
              ? `↑ +${d.meseCorrente.vs_media6m_delta.toFixed(2)} t vs media 6 mesi`
              : d.meseCorrente.tCO2e > 0 ? "↓ in linea con media storica" : undefined}
            alertBorder={d.alerts.length > 0}
          />
          <KpiCard
            label={d.mesePrecedente.label}
            value={d.mesePrecedente.tCO2e > 0 ? d.mesePrecedente.tCO2e.toFixed(2) : "—"}
            unit="t CO₂e"
            badge={d.mesePrecedente.vs_mese_prec_pct != null ? { text: `${Math.abs(d.mesePrecedente.vs_mese_prec_pct)}%`, up: d.mesePrecedente.vs_mese_prec_pct > 0 } : null}
          />
          <KpiCard
            label={`YTD ${annoLabel}`}
            value={d.ytd.tCO2e > 0 ? d.ytd.tCO2e.toFixed(2) : "—"}
            unit="t CO₂e"
            badge={d.ytd.vs_ytd_anno_prec_pct != null ? { text: `${Math.abs(d.ytd.vs_ytd_anno_prec_pct)}%`, up: d.ytd.vs_ytd_anno_prec_pct > 0 } : null}
            delta={d.ytd.proiezione_annua ? `↑ proiezione annua: ~${d.ytd.proiezione_annua.toFixed(1)} t` : undefined}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <KpiCard
              label={`Totale ${d.annoPrecedente.anno}`}
              value={d.annoPrecedente.tCO2e > 0 ? d.annoPrecedente.tCO2e.toFixed(2) : "—"}
              unit="t CO₂e"
              dark
            />
            <div style={{ background: "#1C2B28", borderRadius: "0 0 12px 12px", padding: "0 20px 12px", marginTop: -12 }}>
              <MiniChart data={d.mensili} />
            </div>
          </div>
        </div>
      ) : (
        /* Onboarding box */
        <div style={{ background: "#fff", border: "1px dashed #27AE60", borderRadius: 12, padding: 28, textAlign: "center", marginBottom: 24 }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: "#1C2B28", marginBottom: 6 }}>Inizia a tracciare le emissioni</div>
          <div style={{ fontSize: 13, color: "#5A9088", marginBottom: 16 }}>Carica la prima bolletta energia per vedere subito i dati di consumo mensile</div>
          <button
            onClick={() => {
              if (latestGhg && !isComp(latestGhg.status)) router.push(`/clients/${id}/ghg/${latestGhg.id}/edit`);
              else { setGhgModal(true); setGhgExisting(null); setGhgNewYear(new Date().getFullYear() - 1); }
            }}
            style={{ background: "#27AE60", color: "#fff", padding: "10px 28px", borderRadius: 8, fontSize: 14, fontWeight: 700, border: "none", cursor: "pointer" }}
          >
            Carica prima bolletta →
          </button>
        </div>
      )}

      {/* ═══ MODULI ═══ */}
      <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1, color: "#8AB5AC", marginBottom: 10, fontWeight: 500 }}>Moduli</div>

      {/* Module 1 — GHG */}
      <div style={{ background: "#fff", borderRadius: 12, border: "0.5px solid #E2EAE8", borderLeft: "3px solid #27AE60", padding: "18px 20px", marginBottom: 10, display: "flex", alignItems: "center", gap: 14, boxShadow: "0 1px 3px rgba(28,43,40,0.06)" }}>
        <div style={{ width: 28, height: 28, borderRadius: "50%", background: "#27AE60", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, flexShrink: 0 }}>1</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#1C2B28" }}>Emissioni energia</div>
          <div style={{ fontSize: 12, color: "#5A9088", marginTop: 2 }}>Scope 1+2 · ISO 14064-1 · {d.ghg.fonti_completate} di {d.ghg.fonti_totali} fonti completate</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <button
            onClick={() => {
              if (latestGhg && !isComp(latestGhg.status)) router.push(`/clients/${id}/ghg/${latestGhg.id}/edit`);
              else { setGhgModal(true); setGhgExisting(null); setGhgNewYear(new Date().getFullYear() - 1); }
            }}
            style={{ background: "#27AE60", color: "#fff", padding: "8px 18px", borderRadius: 6, fontSize: 13, fontWeight: 700, border: "none", cursor: "pointer" }}
          >
            {d.ghg.fonti_mancanti.length > 0 ? `Completa dati energia (${d.ghg.fonti_mancanti.length} mancanti)` : "Apri dati energia"}
          </button>
          {d.ghg.fonti_mancanti.length > 0 && (
            <div style={{ fontSize: 11, color: "#C8860A", marginTop: 4 }}>{d.ghg.fonti_mancanti.slice(0, 2).join(" + ")} da inserire</div>
          )}
        </div>
      </div>

      {/* Module 2 — VSME Basic */}
      <div style={{ background: hasCompletedGhg ? "#fff" : "#F4F8F7", borderRadius: 12, border: "0.5px solid #E2EAE8", borderLeft: hasCompletedGhg ? "3px solid #27AE60" : undefined, padding: "18px 20px", marginBottom: 10, display: "flex", alignItems: "center", gap: 14, opacity: hasCompletedGhg ? 1 : 0.6 }}>
        <div style={{ width: 28, height: 28, borderRadius: "50%", background: hasCompletedGhg ? "#27AE60" : "transparent", border: hasCompletedGhg ? "none" : "1.5px solid #8AB5AC", color: hasCompletedGhg ? "#fff" : "#8AB5AC", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, flexShrink: 0 }}>2</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: hasCompletedGhg ? "#1C2B28" : "#666" }}>VSME Basic</div>
          <div style={{ fontSize: 12, color: "#5A9088", marginTop: 2 }}>Report ESG di base · Standard EFRAG VSME</div>
          {!hasCompletedGhg && <LockText text="Sblocca completando energia (1 step)" />}
        </div>
        {hasCompletedGhg && (
          <button onClick={() => router.push(`/clients/${id}/vsme/new?ghg_report_id=${completedGhg!.id}`)}
            style={{ background: "#27AE60", color: "#fff", padding: "8px 18px", borderRadius: 6, fontSize: 13, fontWeight: 700, border: "none", cursor: "pointer" }}>
            Crea VSME Basic
          </button>
        )}
      </div>

      {/* Module 3 — Scope 3 */}
      <div style={{ background: hasCompletedGhg ? "#fff" : "#F4F8F7", borderRadius: 12, border: "0.5px solid #E2EAE8", borderLeft: hasCompletedGhg ? "3px solid #27AE60" : undefined, padding: "18px 20px", marginBottom: 10, display: "flex", alignItems: "center", gap: 14, opacity: hasCompletedGhg ? 1 : 0.6 }}>
        <div style={{ width: 28, height: 28, borderRadius: "50%", background: hasCompletedGhg ? "#27AE60" : "transparent", border: hasCompletedGhg ? "none" : "1.5px solid #8AB5AC", color: hasCompletedGhg ? "#fff" : "#8AB5AC", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, flexShrink: 0 }}>3</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: hasCompletedGhg ? "#1C2B28" : "#666" }}>Emissioni indirette Scope 3</div>
          <div style={{ fontSize: 12, color: "#5A9088", marginTop: 2 }}>Screening significatività · ISO 14064-1</div>
          {!hasCompletedGhg && <LockText text="Sblocca completando energia (1 step)" />}
        </div>
        {hasCompletedGhg && completedGhg && (
          <Link href={`/clients/${id}/ghg/${completedGhg.id}/scope3`}
            style={{ background: "#27AE60", color: "#fff", padding: "8px 18px", borderRadius: 6, fontSize: 13, fontWeight: 700, textDecoration: "none" }}>
            Apri Scope 3
          </Link>
        )}
      </div>

      {/* Module 4 — VSME Comprehensive */}
      <div style={{ background: "#F4F8F7", borderRadius: 12, border: "0.5px solid #E2EAE8", padding: "18px 20px", marginBottom: 24, display: "flex", alignItems: "center", gap: 14, opacity: 0.6 }}>
        <div style={{ width: 28, height: 28, borderRadius: "50%", background: "transparent", border: "1.5px solid #8AB5AC", color: "#8AB5AC", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, flexShrink: 0 }}>4</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#666" }}>VSME Comprehensive</div>
          <div style={{ fontSize: 12, color: "#5A9088", marginTop: 2 }}>Report ESG completo con emissioni indirette</div>
          <LockText text={!hasCompletedGhg ? "Sblocca completando energia, VSME Basic e Scope 3" : !completedVsme ? "Sblocca completando VSME Basic e Scope 3" : "Sblocca completando Scope 3"} />
        </div>
      </div>

      {/* ═══ GHG MODAL ═══ */}
      {ghgModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setGhgModal(false)}>
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <h2 style={{ fontSize: 18, fontWeight: 600, color: "#1C2B28" }}>Nuovo calcolo GHG</h2>
            <div>
              <label style={{ fontSize: 13, fontWeight: 500, display: "block", marginBottom: 6 }}>Anno di riferimento</label>
              <input type="number" value={ghgNewYear}
                onChange={e => { setGhgNewYear(Number(e.target.value)); setGhgExisting(ghgReports.find(r => r.year === Number(e.target.value)) || null); }}
                min={2015} max={2099} style={{ width: "100%", border: "1px solid #E2EAE8", borderRadius: 6, padding: "8px 12px", fontSize: 14 }} />
            </div>
            {ghgExisting ? (
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => { setGhgModal(false); router.push(`/clients/${id}/ghg/${ghgExisting.id}/edit`); }}
                  style={{ flex: 1, background: "#27AE60", color: "#fff", padding: "10px 0", borderRadius: 8, fontWeight: 600, border: "none", cursor: "pointer" }}>
                  {isComp(ghgExisting.status) ? "Modifica" : "Riprendi bozza"}
                </button>
                <button onClick={() => { setGhgModal(false); router.push(`/clients/${id}/ghg/new?anno=${ghgNewYear}`); }}
                  style={{ flex: 1, border: "1px solid #E2EAE8", padding: "10px 0", borderRadius: 8, background: "#fff", cursor: "pointer" }}>
                  Nuovo
                </button>
              </div>
            ) : (
              <button onClick={() => { setGhgModal(false); router.push(`/clients/${id}/ghg/new?anno=${ghgNewYear}`); }}
                style={{ width: "100%", background: "#27AE60", color: "#fff", padding: "10px 0", borderRadius: 8, fontWeight: 600, border: "none", cursor: "pointer" }}>
                Inizia calcolo {ghgNewYear}
              </button>
            )}
            <button onClick={() => setGhgModal(false)} style={{ width: "100%", textAlign: "center", fontSize: 12, color: "#8AB5AC", background: "none", border: "none", cursor: "pointer" }}>Annulla</button>
          </div>
        </div>
      )}

      {/* ═══ STORICO ═══ */}
      {docs.length > 0 && (
        <div style={{ background: "#fff", borderRadius: 12, border: "0.5px solid #E2EAE8", overflow: "hidden" }}>
          <div style={{ padding: "14px 20px", borderBottom: "0.5px solid #E2EAE8" }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "#1C2B28" }}>Storico documenti</span>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#1C2B28" }}>
                {["Anno", "Tipo", "Stato", "S1", "S2 LB", "Totale", ""].map((h, i) => (
                  <th key={h || i} style={{ color: "#fff", fontSize: 11, fontWeight: 500, padding: "10px 16px", textAlign: i >= 3 && i <= 5 ? "right" : "left" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {docs.map(d => (
                <tr key={`${d.type}-${d.id}`} className="hover:bg-[#F4F8F7] transition-colors" style={{ borderBottom: "0.5px solid #E2EAE8" }}>
                  <td style={{ padding: "10px 16px", fontSize: 13, fontWeight: 600, color: "#1C2B28" }}>{d.year}</td>
                  <td style={{ padding: "10px 16px" }}>
                    <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 4, background: "#E8F9EE", color: "#1A8A47" }}>{d.type === "GHG" ? "GHG S.1+2" : "VSME"}</span>
                  </td>
                  <td style={{ padding: "10px 16px" }}>
                    <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 4, background: isComp(d.status) ? "#E8F9EE" : "#FFF3DC", color: isComp(d.status) ? "#1A8A47" : "#92600A" }}>
                      {isComp(d.status) ? "Completato" : "Bozza"}
                    </span>
                  </td>
                  <td style={{ padding: "10px 16px", textAlign: "right", fontFamily: "var(--font-dm-mono), monospace", fontSize: 13, color: d.s1 > 0 ? "#1C2B28" : "#8AB5AC" }}>{d.s1 > 0 ? d.s1.toFixed(2) : "—"}</td>
                  <td style={{ padding: "10px 16px", textAlign: "right", fontFamily: "var(--font-dm-mono), monospace", fontSize: 13, color: d.s2lb > 0 ? "#1C2B28" : "#8AB5AC" }}>{d.s2lb > 0 ? d.s2lb.toFixed(2) : "—"}</td>
                  <td style={{ padding: "10px 16px", textAlign: "right", fontFamily: "var(--font-dm-mono), monospace", fontSize: 13, fontWeight: 700, color: d.total > 0 ? "#1A8A47" : "#8AB5AC" }}>{d.total > 0 ? d.total.toFixed(2) : "—"}</td>
                  <td style={{ padding: "10px 16px" }}>
                    {d.type === "GHG" && (
                      <Link href={isComp(d.status) ? `/clients/${id}/ghg/${d.id}/view` : `/clients/${id}/ghg/${d.id}/edit`}
                        style={{ fontSize: 12, color: "#27AE60", fontWeight: 500, textDecoration: "none" }}>
                        {isComp(d.status) ? "Apri" : "Riprendi"}
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
