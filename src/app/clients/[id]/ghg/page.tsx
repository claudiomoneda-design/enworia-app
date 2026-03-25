"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import type { Company } from "@/types/database";

interface GhgReportRow {
  id: string;
  reference_year: number;
  year: number;
  report_code: string | null;
  status: string;
  scope1_total: number | null;
  scope2_lb_total: number | null;
  scope2_mb_total: number | null;
  total_co2eq: number | null;
}

function fmtVal(v: number | null) {
  const n = Number(v ?? 0);
  return n > 0 ? n.toFixed(2) : null;
}

export default function GhgListPage() {
  const params = useParams();
  const companyId = params.id as string;
  const [reports, setReports] = useState<GhgReportRow[]>([]);
  const [company, setCompany] = useState<Company | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [{ data: co }, { data: reps }] = await Promise.all([
        supabase.from("companies").select("*").eq("id", companyId).single(),
        supabase.from("ghg_reports").select("*").eq("company_id", companyId).order("reference_year", { ascending: false }),
      ]);
      if (co) setCompany(co as Company);
      if (reps) setReports((reps as GhgReportRow[]).map((r) => ({ ...r, year: r.reference_year || r.year })));
      setLoading(false);
    })();
  }, [companyId]);

  if (loading) return <p style={{ color: "#8AB5AC", fontSize: 14, padding: "32px 0" }}>Caricamento...</p>;
  if (!company) return <p style={{ color: "#C0392B", fontSize: 14, padding: "32px 0" }}>Cliente non trovato.</p>;

  return (
    <div style={{ maxWidth: 960, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: -0.4, color: "#1C2B28", margin: 0 }}>
            Report GHG — {company.company_name}
          </h1>
          <p style={{ fontSize: 13, color: "#5A9088", margin: "4px 0 0" }}>
            Inventario emissioni gas serra (Scope 1 &amp; 2)
          </p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <Link
            href={`/clients/${companyId}/ghg/new`}
            style={{ background: "#27AE60", color: "#fff", padding: "8px 20px", borderRadius: 8, fontSize: 14, fontWeight: 600, textDecoration: "none" }}
          >
            + Nuovo calcolo GHG
          </Link>
          <Link
            href={`/clients/${companyId}`}
            className="hover:text-[#1C2B28] transition-colors"
            style={{ color: "#5A9088", fontSize: 13, textDecoration: "none", padding: "10px 0" }}
          >
            ← Torna al cliente
          </Link>
        </div>
      </div>

      {reports.length === 0 ? (
        <div style={{ background: "#fff", borderRadius: 12, border: "0.5px solid #E2EAE8", padding: "48px 20px", textAlign: "center" }}>
          <p style={{ color: "#8AB5AC", fontSize: 14 }}>
            Nessun report GHG — clicca &quot;+ Nuovo calcolo GHG&quot; per iniziare
          </p>
        </div>
      ) : (
        <div style={{ background: "#fff", borderRadius: 12, border: "0.5px solid #E2EAE8", overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#1C2B28" }}>
                {["Anno", "Codice", "Stato", "Scope 1", "Scope 2 LB", "Scope 2 MB", "Totale", "Azioni"].map((h, i) => (
                  <th key={h} style={{ color: "#fff", fontSize: 12, fontWeight: 500, padding: "12px 16px", textAlign: i >= 3 && i <= 6 ? "right" : "left" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {reports.map((r) => {
                const isComp = r.status === "completato" || r.status === "completed";
                const s1 = fmtVal(r.scope1_total);
                const s2lb = fmtVal(r.scope2_lb_total);
                const s2mb = fmtVal(r.scope2_mb_total);
                const tot = fmtVal(r.total_co2eq) || (Number(r.scope1_total ?? 0) + Number(r.scope2_lb_total ?? 0) > 0 ? (Number(r.scope1_total ?? 0) + Number(r.scope2_lb_total ?? 0)).toFixed(2) : null);

                return (
                  <tr key={r.id} className="hover:bg-[#F4F8F7] transition-colors" style={{ borderBottom: "0.5px solid #E2EAE8" }}>
                    <td style={{ padding: "12px 16px", fontSize: 13, fontWeight: 600, color: "#1C2B28" }}>{r.year}</td>
                    <td style={{ padding: "12px 16px", fontSize: 12, color: "#8AB5AC", fontFamily: "var(--font-dm-mono), monospace" }}>{r.report_code || "—"}</td>
                    <td style={{ padding: "12px 16px" }}>
                      <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 4, background: isComp ? "#E8F9EE" : "#FFF3DC", color: isComp ? "#1A8A47" : "#92600A" }}>
                        {isComp ? "Completato" : "Bozza"}
                      </span>
                    </td>
                    <td style={{ padding: "12px 16px", textAlign: "right", fontSize: 13, fontFamily: "var(--font-dm-mono), monospace", color: s1 ? "#1C2B28" : "#8AB5AC" }}>{s1 || "—"}</td>
                    <td style={{ padding: "12px 16px", textAlign: "right", fontSize: 13, fontFamily: "var(--font-dm-mono), monospace", color: s2lb ? "#1C2B28" : "#8AB5AC" }}>{s2lb || "—"}</td>
                    <td style={{ padding: "12px 16px", textAlign: "right", fontSize: 13, fontFamily: "var(--font-dm-mono), monospace", color: s2mb ? "#1C2B28" : "#8AB5AC" }}>{s2mb || "—"}</td>
                    <td style={{ padding: "12px 16px", textAlign: "right", fontSize: 13, fontWeight: 700, fontFamily: "var(--font-dm-mono), monospace", color: tot ? "#1A8A47" : "#8AB5AC" }}>{tot || "—"}</td>
                    <td style={{ padding: "12px 16px" }}>
                      {isComp ? (
                        <div style={{ display: "flex", gap: 12 }}>
                          <Link href={`/clients/${companyId}/ghg/${r.id}/view`} style={{ fontSize: 13, color: "#27AE60", fontWeight: 500, textDecoration: "none" }}>Apri</Link>
                          <Link href={`/clients/${companyId}/ghg/${r.id}/edit`} style={{ fontSize: 13, color: "#5A9088", textDecoration: "none" }}>Modifica</Link>
                        </div>
                      ) : (
                        <Link href={`/clients/${companyId}/ghg/${r.id}/edit`} style={{ fontSize: 13, color: "#27AE60", fontWeight: 500, textDecoration: "none" }}>Riprendi</Link>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
