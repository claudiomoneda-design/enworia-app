"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Company } from "@/types/database";

export default function ClientsPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("companies")
        .select("*")
        .order("created_at", { ascending: false });

      if (!error && data) setCompanies(data as Company[]);
      setLoading(false);
    })();
  }, []);

  async function handleDelete(id: string) {
    if (!confirm("Sei sicuro di voler eliminare questo cliente?")) return;
    const { error } = await supabase.from("companies").delete().eq("id", id);
    if (!error) setCompanies((prev) => prev.filter((c) => c.id !== id));
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-[var(--primary)]">Clienti</h1>
        <Link
          href="/clients/new"
          className="bg-[#27AE60] text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-[#1A8A47] transition-colors"
        >
          + Nuovo cliente
        </Link>
      </div>

      {loading ? (
        <p className="text-[var(--muted)] text-sm">Caricamento...</p>
      ) : companies.length === 0 ? (
        <div className="text-center py-16 text-[var(--muted)]">
          <p className="mb-2">Nessun cliente presente.</p>
          <Link href="/clients/new" className="text-[#1E5C3A] text-sm hover:underline">
            Aggiungi il primo cliente
          </Link>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-[var(--border)] overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] bg-gray-50 text-left text-[var(--muted)]">
                <th className="px-4 py-3 font-medium">Azienda</th>
                <th className="px-4 py-3 font-medium">ATECO</th>
                <th className="px-4 py-3 font-medium text-right">Dipendenti</th>
                <th className="px-4 py-3 font-medium text-center">Stato</th>
                <th className="px-4 py-3 font-medium text-right">Azioni</th>
              </tr>
            </thead>
            <tbody>
              {companies.map((company) => (
                <tr
                  key={company.id}
                  className="border-b border-[var(--border)] last:border-0 hover:bg-gray-50 transition-colors"
                >
                  <td className="px-4 py-3">
                    <Link href={`/clients/${company.id}`} className="font-medium text-[var(--foreground)] hover:text-[#1E5C3A] transition-colors">
                      {company.company_name || "Bozza senza nome"}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-[var(--muted)]">{company.nace_code || "—"}</td>
                  <td className="px-4 py-3 text-right text-[var(--muted)]">
                    {company.number_of_employees != null ? company.number_of_employees.toLocaleString("it-IT") : "—"}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                      company.form_status === "completed"
                        ? "bg-green-100 text-green-700"
                        : "bg-amber-100 text-amber-700"
                    }`}>
                      {company.form_status === "completed" ? "Completato" : "Bozza"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right space-x-3">
                    <Link href={`/clients/${company.id}/edit`} className="text-[#1E5C3A] hover:underline text-xs">
                      Modifica
                    </Link>
                    <button
                      onClick={() => handleDelete(company.id)}
                      className="text-red-500 hover:text-red-700 text-xs transition-colors"
                    >
                      Elimina
                    </button>
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
