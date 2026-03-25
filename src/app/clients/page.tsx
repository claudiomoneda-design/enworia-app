"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getClientStatus, type ClientStatus } from "@/lib/clientStatus";
import EnworiaNode from "@/components/EnworiaNode";
import type { Company } from "@/types/database";

interface ClientRow {
  company: Company;
  status: ClientStatus;
  totalTco2e: number;
}

const BORDER_COLORS: Record<string, string> = { rosso: '#C0392B', giallo: '#C8860A', verde: '#27AE60', grigio: '#E2EAE8' }
const CTA_BG: Record<string, string> = { rosso: '#C0392B', verde: '#27AE60', grigio: '#5A9088' }
const ORDER: Record<string, number> = { ritardo: 0, in_corso: 1, completo: 2, non_configurato: 3 }
const FILTERS = [
  { key: 'tutti', label: 'Tutti' },
  { key: 'ritardo', label: 'In ritardo' },
  { key: 'in_corso', label: 'In corso' },
  { key: 'completo', label: 'Completati' },
]

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() || "").join("")
}

export default function ClientsPage() {
  const router = useRouter();
  const [rows, setRows] = useState<ClientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('tutti');

  useEffect(() => {
    (async () => {
      const { data: companies } = await supabase.from("companies").select("*").order("created_at", { ascending: false });
      if (!companies) { setLoading(false); return; }

      // Load reports and entry counts for all companies
      const companyIds = companies.map(c => c.id);
      const { data: allReports } = await supabase.from("ghg_reports").select("id, company_id, updated_at, status, total_co2eq, scope1_total, scope2_lb_total").in("company_id", companyIds).order("updated_at", { ascending: false });
      const { data: allEntries } = await supabase.from("energy_entries").select("id, period_id").limit(1000);
      const { data: allPeriods } = await supabase.from("ghg_periods").select("id, company_id").in("company_id", companyIds);

      // Map periods to company
      const periodToCompany: Record<string, string> = {};
      (allPeriods || []).forEach(p => { periodToCompany[p.id] = p.company_id; });

      // Count entries per company
      const entriesPerCompany: Record<string, number> = {};
      (allEntries || []).forEach(e => {
        const cid = periodToCompany[e.period_id];
        if (cid) entriesPerCompany[cid] = (entriesPerCompany[cid] || 0) + 1;
      });

      // Group reports per company
      const reportsPerCompany: Record<string, typeof allReports> = {};
      (allReports || []).forEach(r => {
        if (!reportsPerCompany[r.company_id]) reportsPerCompany[r.company_id] = [];
        reportsPerCompany[r.company_id]!.push(r);
      });

      const result: ClientRow[] = companies.map(c => {
        const reports = reportsPerCompany[c.id] || [];
        const fonti = entriesPerCompany[c.id] || 0;
        const status = getClientStatus(reports as { updated_at?: string; status?: string }[], fonti);
        const latest = reports[0];
        const total = latest ? (Number(latest.total_co2eq ?? 0) || (Number(latest.scope1_total ?? 0) + Number(latest.scope2_lb_total ?? 0))) : 0;
        return { company: c as Company, status, totalTco2e: total };
      });

      result.sort((a, b) => (ORDER[a.status.tipo] ?? 9) - (ORDER[b.status.tipo] ?? 9));
      setRows(result);
      setLoading(false);
    })();
  }, []);

  async function handleDelete(id: string) {
    if (!confirm("Sei sicuro di voler eliminare questo cliente?")) return;
    const { error } = await supabase.from("companies").delete().eq("id", id);
    if (!error) setRows(prev => prev.filter(r => r.company.id !== id));
  }

  const filtered = filter === 'tutti' ? rows : rows.filter(r => r.status.tipo === filter);
  const counts = { tutti: rows.length, ritardo: rows.filter(r => r.status.tipo === 'ritardo').length, in_corso: rows.filter(r => r.status.tipo === 'in_corso').length, completo: rows.filter(r => r.status.tipo === 'completo').length };

  if (loading) return <p style={{ color: "#8AB5AC", padding: 32 }}>Caricamento...</p>;

  return (
    <div style={{ maxWidth: 1020, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: -0.4, color: "#1C2B28", margin: 0 }}>Clienti</h1>
        <Link href="/clients/new" style={{ background: "#27AE60", color: "#fff", padding: "8px 20px", borderRadius: 8, fontSize: 14, fontWeight: 600, textDecoration: "none" }}>+ Nuovo cliente</Link>
      </div>

      {/* KPI bar */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
        {[
          { label: "Totale", value: counts.tutti, bg: "#fff", border: "#E2EAE8", color: "#1C2B28" },
          { label: "In corso", value: counts.in_corso, bg: "#fff", border: "#E2EAE8", color: "#C8860A" },
          { label: "Completati", value: counts.completo, bg: "#fff", border: "#E2EAE8", color: "#1A8A47" },
          { label: "In ritardo", value: counts.ritardo, bg: counts.ritardo > 0 ? "#FFF8EC" : "#fff", border: counts.ritardo > 0 ? "#E8B84B" : "#E2EAE8", color: "#C0392B" },
        ].map(k => (
          <div key={k.label} style={{ flex: 1, padding: "12px 16px", borderRadius: 10, background: k.bg, border: `1px solid ${k.border}` }}>
            <div style={{ fontSize: 10, color: "#8AB5AC", textTransform: "uppercase", letterSpacing: 0.5 }}>{k.label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: k.color, fontFamily: "var(--font-dm-mono), monospace" }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
        {FILTERS.map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)}
            style={{
              fontSize: 12, fontWeight: 500, padding: "6px 14px", borderRadius: 6, cursor: "pointer", border: "none",
              background: filter === f.key ? "#1C2B28" : "#fff",
              color: filter === f.key ? "#fff" : "#5A9088",
              boxShadow: filter !== f.key ? "inset 0 0 0 0.5px #E2EAE8" : "none",
            }}
          >
            {f.key === 'ritardo' && counts.ritardo > 0 ? '⚠ ' : ''}{f.label}{f.key !== 'tutti' ? ` (${counts[f.key as keyof typeof counts] || 0})` : ''}
          </button>
        ))}
      </div>

      {/* Client rows */}
      {filtered.length === 0 ? (
        <div style={{ padding: "48px 16px", textAlign: "center", color: "#8AB5AC" }}>
          {rows.length === 0 ? (
            <>Nessun cliente. <Link href="/clients/new" style={{ color: "#27AE60", fontWeight: 500 }}>Aggiungi il primo →</Link></>
          ) : "Nessun cliente con questo filtro."}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {filtered.map(({ company: co, status: st, totalTco2e }) => {
            const borderColor = BORDER_COLORS[st.colore] || '#E2EAE8';
            return (
              <div key={co.id}
                style={{
                  display: "flex", alignItems: "center", gap: 14, padding: "14px 18px",
                  background: "#fff", borderRadius: 12, border: "0.5px solid #E2EAE8",
                  borderLeft: st.colore !== 'grigio' ? `3px solid ${borderColor}` : undefined,
                }}
              >
                {/* Avatar */}
                <div style={{ width: 42, height: 42, borderRadius: "50%", background: "#1C2B28", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 600, color: "#6FCF97", flexShrink: 0 }}>
                  {initials(co.company_name || "??")}
                </div>

                {/* Company info */}
                <div style={{ minWidth: 190 }}>
                  <Link href={`/clients/${co.id}`} style={{ fontSize: 14, fontWeight: 600, color: "#1C2B28", textDecoration: "none" }}>
                    {co.company_name || "Bozza"}
                  </Link>
                  <div style={{ fontSize: 12, color: "#8AB5AC", marginTop: 1 }}>
                    {co.nace_code ? `ATECO ${co.nace_code}` : ""}{co.nace_code && co.number_of_employees != null ? " · " : ""}{co.number_of_employees != null ? `${co.number_of_employees} dip.` : ""}
                  </div>
                </div>

                {/* Status */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <EnworiaNode stato={st.colore} size={16} />
                    <span style={{ fontSize: 13, fontWeight: 600, color: "#1C2B28" }}>{st.testo}</span>
                    {totalTco2e > 0 && (
                      <span style={{ fontSize: 12, color: "#1A8A47", fontWeight: 600, fontFamily: "var(--font-dm-mono), monospace", marginLeft: 8 }}>{totalTco2e.toFixed(2)} t</span>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: st.subColore || "#8AB5AC", marginTop: 2 }}>{st.sub}</div>
                  {st.insight && <div style={{ fontSize: 11, fontWeight: 600, color: st.insightColore || "#8AB5AC", marginTop: 1 }}>{st.insight}</div>}
                </div>

                {/* Actions */}
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                  {st.cta && (
                    <button onClick={() => router.push(`/clients/${co.id}`)}
                      style={{ fontSize: 12, fontWeight: 700, padding: "6px 14px", borderRadius: 6, border: "none", cursor: "pointer", color: "#fff", background: CTA_BG[st.ctaColore || 'verde'], whiteSpace: "nowrap" }}>
                      {st.cta}
                    </button>
                  )}
                  {st.tipo !== 'non_configurato' && (
                    <Link href={`/clients/${co.id}`}
                      style={{ fontSize: 12, fontWeight: 500, padding: "6px 12px", borderRadius: 6, border: "1.5px solid #27AE60", color: "#27AE60", textDecoration: "none", whiteSpace: "nowrap" }}>
                      Dashboard
                    </Link>
                  )}
                  <div style={{ display: "flex", gap: 8, marginLeft: 4 }}>
                    <Link href={`/clients/${co.id}/edit`} style={{ fontSize: 11, color: "#B4B2A9", textDecoration: "none" }}>Modifica</Link>
                    <button onClick={() => handleDelete(co.id)} style={{ fontSize: 11, color: "#B4B2A9", background: "none", border: "none", cursor: "pointer" }}>Elimina</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
