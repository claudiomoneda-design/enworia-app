"use client";

/**
 * ServicesGrid — 4-card grid showing active/inactive services per client.
 * Order: Scope 1+2 → Scope 3 → VSME Basic → VSME Comprehensive
 */

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import Link from "next/link";
import { Flame, Link2, FileText, BarChart2 } from "lucide-react";

interface Service {
  id: string;
  service_type: string;
  is_active: boolean;
  activated_at: string | null;
  deadline: string | null;
}

interface Props {
  companyId: string;
  hasGhgData: boolean;
  completionPct: number;
  activeReportId: string | null;
}

// Fixed display order
const SERVICE_ORDER = ["scope12", "scope3", "vsme_basic", "vsme_comprehensive"];

const SERVICE_DEFS: Record<string, {
  label: string;
  Icon: typeof Flame;
  activeDesc: string;
  inactiveDesc: string;
  cta: string;
  recommended?: boolean;
}> = {
  scope12: {
    label: "Scope 1 + 2",
    Icon: Flame,
    activeDesc: "Emissioni dirette e da energia",
    inactiveDesc: "Calcolo emissioni GHG dirette e da energia acquistata",
    cta: "Riprendi →",
  },
  scope3: {
    label: "Scope 3",
    Icon: Link2,
    activeDesc: "Emissioni indirette della catena del valore",
    inactiveDesc: "Stima: ~120 tCO₂e potenziali · import fornitori Excel disponibile",
    cta: "Attiva Scope 3 →",
    recommended: true,
  },
  vsme_basic: {
    label: "VSME Basic",
    Icon: FileText,
    activeDesc: "Report ESG per PMI",
    inactiveDesc: "Si sblocca completando Scope 1+2 · report ESG pronto in 1 click",
    cta: "Crea report ESG →",
  },
  vsme_comprehensive: {
    label: "VSME Comprehensive",
    Icon: BarChart2,
    activeDesc: "Report ESG completo con indicatori avanzati",
    inactiveDesc: "Richiede VSME Basic completato",
    cta: "Completa VSME →",
  },
};

export default function ServicesGrid({ companyId, hasGhgData, completionPct, activeReportId }: Props) {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      let { data } = await supabase
        .from("client_services")
        .select("*")
        .eq("company_id", companyId);

      // Auto-create if missing — all active by default (development phase)
      if (!data || data.length === 0) {
        for (const t of SERVICE_ORDER) {
          await supabase.from("client_services").insert({
            company_id: companyId,
            service_type: t,
            is_active: true,
            activated_at: new Date().toISOString(),
          });
        }
        const { data: fresh } = await supabase.from("client_services").select("*").eq("company_id", companyId);
        data = fresh;
      }

      setServices(data || []);
      setLoading(false);
    })();
  }, [companyId, hasGhgData]);

  const activate = async (serviceId: string) => {
    await supabase.from("client_services").update({
      is_active: true,
      activated_at: new Date().toISOString(),
    }).eq("id", serviceId);
    setServices((prev) => prev.map((s) => s.id === serviceId ? { ...s, is_active: true, activated_at: new Date().toISOString() } : s));
  };

  if (loading) return null;

  // Sort by fixed order
  const sorted = SERVICE_ORDER.map((type) => services.find((s) => s.service_type === type)).filter(Boolean) as Service[];
  const showUpsell = hasGhgData && sorted.find((s) => s.service_type === "scope3" && !s.is_active);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-4 gap-3">
        {sorted.map((svc) => {
          const def = SERVICE_DEFS[svc.service_type];
          if (!def) return null;
          const { Icon } = def;
          const isScope12 = svc.service_type === "scope12";
          const iconColor = svc.is_active ? "#27AE60" : "#9CA3AF";

          return (
            <div key={svc.id}
              className="rounded-lg p-4 space-y-2 transition-colors"
              style={{
                border: svc.is_active ? "1px solid #27AE60" : "1px solid var(--ew-light-border)",
                backgroundColor: svc.is_active ? "rgba(39,174,96,0.03)" : "var(--ew-light-bg)",
              }}
            >
              {/* Header */}
              <div className="flex items-center justify-between">
                <Icon size={18} strokeWidth={1.5} color={iconColor} />
                {svc.is_active ? (
                  <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-[#D1FAE5] text-[#065F46]">Attivo</span>
                ) : def.recommended && hasGhgData ? (
                  <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-[#FEF3C7] text-[#92400E]">Consigliato</span>
                ) : (
                  <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-gray-100 text-[var(--muted)]">Non attivo</span>
                )}
              </div>

              {/* Label + desc */}
              <p className="text-xs font-semibold text-[var(--foreground)]">{def.label}</p>
              <p className="text-[10px] text-[var(--muted)] leading-relaxed">
                {svc.is_active ? def.activeDesc : def.inactiveDesc}
              </p>

              {/* Progress bar for active Scope 1+2 */}
              {svc.is_active && isScope12 && completionPct > 0 && (
                <div>
                  <div className="flex justify-between text-[9px] text-[var(--muted)] mb-0.5">
                    <span>In compilazione</span>
                    <span>{completionPct}%</span>
                  </div>
                  <div className="h-1 rounded-full bg-gray-200 overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${completionPct}%`, backgroundColor: "#27AE60" }} />
                  </div>
                </div>
              )}

              {/* CTA */}
              {svc.is_active && isScope12 && activeReportId ? (
                <Link href={`/clients/${companyId}/ghg/new?report=${activeReportId}&edit=1`}
                  className="block text-[10px] font-medium text-[#27AE60] hover:underline mt-1">
                  {def.cta}
                </Link>
              ) : svc.is_active && svc.service_type === "scope3" && activeReportId ? (
                <Link href={`/clients/${companyId}/ghg/${activeReportId}/scope3`}
                  className="block text-[10px] font-medium text-[#27AE60] hover:underline mt-1">
                  Avvia Scope 3 →
                </Link>
              ) : !svc.is_active ? (
                <button type="button" onClick={() => activate(svc.id)}
                  className="text-[10px] font-medium text-[#27AE60] hover:underline mt-1">
                  {def.cta}
                </button>
              ) : null}
            </div>
          );
        })}
      </div>

      {/* Upsell banner */}
      {showUpsell && (
        <div className="rounded-md px-4 py-3 text-xs" style={{ backgroundColor: "#FFF8E1", border: "1px solid #FFE082", color: "#5D4037" }}>
          Attivando Scope 3 puoi usare i dati già inseriti e aggiungere solo fornitori, trasporti e rifiuti.
        </div>
      )}
    </div>
  );
}
