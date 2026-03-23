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
        supabase
          .from("ghg_reports")
          .select("id, reference_year, report_code, status, scope1_total, scope2_lb_total, scope2_mb_total, total_co2eq")
          .eq("company_id", companyId)
          .order("reference_year", { ascending: false }),
      ]);
      if (co) setCompany(co as Company);
      if (reps) setReports((reps as GhgReportRow[]).map((r) => ({ ...r, year: r.reference_year || r.year })));
      setLoading(false);
    })();
  }, [companyId]);

  if (loading) return <p className="text-[var(--muted)] text-sm py-8">Caricamento...</p>;
  if (!company) return <p className="text-red-600 text-sm py-8">Cliente non trovato.</p>;

  return (
    <div className="space-y-6" style={{ fontFamily: "Arial, sans-serif" }}>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--primary)]">
            Report GHG — {company.company_name}
          </h1>
          <p className="text-sm text-[var(--muted)] mt-1">
            Inventario emissioni gas serra (Scope 1 &amp; 2)
          </p>
        </div>
        <div className="flex gap-3">
          <Link
            href={`/clients/${companyId}/ghg/new`}
            className="bg-[#006450] text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-[#005240] transition-colors"
          >
            + Nuovo calcolo GHG
          </Link>
          <Link
            href={`/clients/${companyId}`}
            className="border border-[var(--border)] text-[var(--muted)] px-4 py-2 rounded-md text-sm hover:bg-gray-50 transition-colors"
          >
            Torna al cliente
          </Link>
        </div>
      </div>

      {reports.length === 0 ? (
        <div className="bg-white rounded-lg border border-[var(--border)] p-12 text-center">
          <p className="text-[var(--muted)] text-sm">
            Nessun report GHG — clicca &quot;+ Nuovo calcolo GHG&quot; per iniziare
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-[var(--border)] overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#006450] text-white text-left">
                <th className="px-5 py-3 font-semibold">Anno</th>
                <th className="px-5 py-3 font-semibold">Stato</th>
                <th className="px-5 py-3 font-semibold text-right">Scope 1</th>
                <th className="px-5 py-3 font-semibold text-right">Scope 2 LB</th>
                <th className="px-5 py-3 font-semibold text-right">Scope 2 MB</th>
                <th className="px-5 py-3 font-semibold text-right">Totale</th>
                <th className="px-5 py-3 font-semibold">Azioni</th>
              </tr>
            </thead>
            <tbody>
              {reports.map((r) => {
                const s1 = r.scope1_total ?? 0;
                const s2lb = r.scope2_lb_total ?? 0;
                const s2mb = r.scope2_mb_total ?? 0;
                const tot = r.total_co2eq ?? (Number(s1) + Number(s2lb));
                const isComplete = r.status === "completato" || r.status === "completed";
                return (
                  <tr key={r.id} className="border-t border-gray-100 hover:bg-gray-50">
                    <td className="px-5 py-3 font-medium">{r.year}</td>
                    <td className="px-5 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        isComplete ? "bg-[#006450]/10 text-[#006450]" : "bg-amber-100 text-amber-700"
                      }`}>
                        {isComplete ? "Completato" : "Bozza"}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right">{Number(s1) > 0 ? Number(s1).toFixed(2) : "—"}</td>
                    <td className="px-5 py-3 text-right">{Number(s2lb) > 0 ? Number(s2lb).toFixed(2) : "—"}</td>
                    <td className="px-5 py-3 text-right text-blue-700">{Number(s2mb) > 0 ? Number(s2mb).toFixed(2) : "—"}</td>
                    <td className="px-5 py-3 text-right font-semibold">{Number(tot) > 0 ? Number(tot).toFixed(2) : "—"}</td>
                    <td className="px-5 py-3">
                      <div className="flex gap-2">
                        {isComplete ? (
                          <>
                            <Link href={`/clients/${companyId}/ghg/${r.id}/view`} className="text-[#006450] hover:underline text-sm">Apri</Link>
                            <span className="text-gray-300 text-sm">PDF</span>
                          </>
                        ) : (
                          <Link href={`/clients/${companyId}/ghg/new?report=${r.id}`} className="text-amber-600 hover:underline text-sm">Riprendi</Link>
                        )}
                      </div>
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
