"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Company } from "@/types/database";

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() || "").join("");
}

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
        <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: -0.4, color: "#1C2B28" }}>Clienti</h1>
        <Link
          href="/clients/new"
          style={{ background: "#27AE60", color: "#fff", padding: "8px 20px", borderRadius: 8, fontSize: 14, fontWeight: 600, textDecoration: "none", transition: "background 0.15s" }}
        >
          + Nuovo cliente
        </Link>
      </div>

      {loading ? (
        <p style={{ color: "#8AB5AC", fontSize: 14 }}>Caricamento...</p>
      ) : companies.length === 0 ? (
        <div style={{ textAlign: "center", padding: "64px 16px", color: "#5A9088" }}>
          <p style={{ marginBottom: 8 }}>Nessun cliente presente.</p>
          <Link href="/clients/new" style={{ color: "#27AE60", fontSize: 14, fontWeight: 500 }}>
            Aggiungi il primo cliente →
          </Link>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {companies.map((company) => (
            <Link
              key={company.id}
              href={`/clients/${company.id}`}
              style={{
                display: "flex", alignItems: "center", gap: 14, padding: "16px 20px",
                background: "#fff", border: "0.5px solid #E2EAE8", borderRadius: 12,
                textDecoration: "none", transition: "border-color 0.15s, box-shadow 0.15s",
              }}
              className="hover:border-[#27AE60] hover:shadow-sm transition-all"
            >
              {/* Avatar */}
              <div style={{
                width: 40, height: 40, borderRadius: "50%",
                background: "#2A3D39", display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 14, fontWeight: 600, color: "#6FCF97", flexShrink: 0,
              }}>
                {initials(company.company_name || "??")}
              </div>

              {/* Info */}
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: "#1C2B28" }}>
                  {company.company_name || "Bozza senza nome"}
                </div>
                <div style={{ fontSize: 12, color: "#5A9088", marginTop: 2 }}>
                  {company.nace_code ? `ATECO ${company.nace_code}` : ""}{company.nace_code && company.number_of_employees != null ? " · " : ""}{company.number_of_employees != null ? `${company.number_of_employees} dip.` : ""}
                </div>
              </div>

              {/* Status badge */}
              <span style={{
                fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 4,
                background: company.form_status === "completed" ? "#E8F9EE" : "#FFF3DC",
                color: company.form_status === "completed" ? "#1A8A47" : "#92600A",
              }}>
                {company.form_status === "completed" ? "Completato" : "Bozza"}
              </span>

              {/* Actions */}
              <div style={{ display: "flex", gap: 12 }} onClick={(e) => e.preventDefault()}>
                <Link href={`/clients/${company.id}/edit`} style={{ fontSize: 12, color: "#27AE60", fontWeight: 500 }}>
                  Modifica
                </Link>
                <button
                  onClick={() => handleDelete(company.id)}
                  style={{ fontSize: 12, color: "#C0392B", fontWeight: 500, background: "none", border: "none", cursor: "pointer" }}
                >
                  Elimina
                </button>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
