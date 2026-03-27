"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Zap, ShoppingCart, Truck, Plane, ArrowRight,
  Users, Trash2, Building2, Flame, AlertTriangle,
} from "lucide-react";

const ICONS: Record<string, typeof Zap> = {
  energy: Zap, shopping: ShoppingCart, truck: Truck, plane: Plane,
  arrow: ArrowRight, person: Users, trash: Trash2, building: Building2,
};

interface Subcategory {
  id: string;
  subcategory_code: string;
  name_it: string;
  description_it: string;
  card_icon: string;
  is_scope2_overlap: boolean;
}

interface Screening {
  id: string;
  subcategory_id: string;
  has_activity: boolean | null;
  data_availability: string | null;
  data_source: string | null;
  significance: string;
}

export default function RankingPage() {
  const { id: clientId, reportId } = useParams() as { id: string; reportId: string };
  const router = useRouter();

  const [subcategories, setSubcategories] = useState<Subcategory[]>([]);
  const [screeningMap, setScreeningMap] = useState<Record<string, Screening>>({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const res = await fetch(`/api/scope3/${reportId}/screening`);
    const json = await res.json();
    setSubcategories(json.subcategories ?? []);
    setScreeningMap(json.screeningMap ?? {});
    setLoading(false);
  }, [reportId]);

  useEffect(() => { load(); }, [load]);

  const activeSubs = subcategories.filter((s) => !s.is_scope2_overlap);
  const withActivity = activeSubs.filter((s) => screeningMap[s.id]?.has_activity);

  const highItems = withActivity.filter((s) => screeningMap[s.id]?.significance === "high");
  const mediumItems = withActivity.filter((s) => screeningMap[s.id]?.significance === "medium");
  const lowItems = withActivity.filter((s) => screeningMap[s.id]?.significance === "low" || screeningMap[s.id]?.significance === "na");

  const firstHigh = highItems[0];

  function goToEntry(subId: string) {
    router.push(`/clients/${clientId}/ghg/${reportId}/scope3/entry/${subId}`);
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#F7F8F7" }}>
        <p className="text-sm text-[#9CA3AF]">Caricamento...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#F7F8F7" }}>
      {/* Navbar */}
      <nav className="sticky top-0 z-50 flex items-center justify-between px-7" style={{ backgroundColor: "#1C2B28", height: 56 }}>
        <Link href="/" className="text-white font-semibold text-base">enworia</Link>
        <Link href={`/clients/${clientId}/ghg/${reportId}/scope3`}
          className="text-xs font-medium px-3 py-1 rounded-full" style={{ backgroundColor: "#2A3D39", color: "#A8C5BE" }}>
          Torna allo screening
        </Link>
      </nav>

      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="rounded-xl px-5 py-4 mb-6" style={{ backgroundColor: "#E8F5E9", border: "1px solid #C8E6C9" }}>
          <p className="text-sm font-semibold text-[#2E7D32]">
            Analisi completata — Ti guidiamo partendo dalle aree più rilevanti
          </p>
        </div>

        {/* HIGH — focus card */}
        {firstHigh && (() => {
          const scr = screeningMap[firstHigh.id];
          const Icon = ICONS[firstHigh.card_icon] || Flame;
          const sourceLabel = scr?.data_source === "contabilita" ? "Contabilità"
            : scr?.data_source === "fornitore" ? "Fornitore"
              : scr?.data_source === "gestionale" ? "Gestionale" : "Altro";
          return (
            <div
              className="bg-white rounded-2xl p-6 mb-6"
              style={{ border: "1.5px solid #EF4444", boxShadow: "0 0 0 4px rgba(239,68,68,0.06), 0 4px 24px rgba(0,0,0,0.06)" }}
            >
              <p className="text-[10px] font-bold uppercase tracking-wider text-[#EF4444] mb-3">Inizia da qui</p>
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: "#FEE2E2" }}>
                  <Icon size={20} color="#EF4444" />
                </div>
                <h2 className="text-lg font-bold text-[#1F2937]">{firstHigh.name_it}</h2>
              </div>
              <p className="text-sm text-[#6B7280] mb-4">
                Questa attività ha il maggiore impatto ed è già pronta per il calcolo
              </p>
              <div className="flex gap-4 text-xs text-[#6B7280] mb-5">
                <span>Dati disponibili: <b className="text-[#1F2937]">{scr?.data_availability === "si" ? "Sì" : "Parziali"}</b></span>
                <span>Fonte: <b className="text-[#1F2937]">{sourceLabel}</b></span>
                <span>Priorità: <b className="text-[#EF4444]">Elevata</b></span>
              </div>
              <button
                onClick={() => goToEntry(firstHigh.id)}
                className="w-full py-3 rounded-xl text-sm font-semibold text-white transition-colors"
                style={{ backgroundColor: "#EF4444" }}
              >
                Inizia da qui
              </button>
            </div>
          );
        })()}

        {/* Remaining HIGH */}
        {highItems.slice(1).map((sub) => {
          const Icon = ICONS[sub.card_icon] || Flame;
          return (
            <button
              key={sub.id}
              onClick={() => goToEntry(sub.id)}
              className="w-full flex items-center gap-3 bg-white rounded-xl px-4 py-3 mb-2 text-left transition-colors hover:bg-red-50"
              style={{ border: "1px solid #FECACA" }}
            >
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: "#FEE2E2" }}>
                <Icon size={16} color="#EF4444" />
              </div>
              <span className="flex-1 text-sm font-medium text-[#1F2937]">{sub.name_it}</span>
              <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-[#FEE2E2] text-[#EF4444]">Priorità alta</span>
            </button>
          );
        })}

        {/* MEDIUM */}
        {mediumItems.length > 0 && (
          <div className="mt-4 mb-2">
            <p className="text-xs font-medium text-[#6B7280] mb-2 px-1">Da completare</p>
            {mediumItems.map((sub) => {
              const Icon = ICONS[sub.card_icon] || Flame;
              return (
                <button
                  key={sub.id}
                  onClick={() => goToEntry(sub.id)}
                  className="w-full flex items-center gap-3 bg-white rounded-xl px-4 py-3 mb-2 text-left transition-colors hover:bg-amber-50"
                  style={{ border: "1px solid #FDE68A" }}
                >
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: "#FEF3C7" }}>
                    <Icon size={16} color="#D97706" />
                  </div>
                  <span className="flex-1 text-sm font-medium text-[#1F2937]">{sub.name_it}</span>
                  <span className="text-xs text-[#9CA3AF]">Dati parziali — completa per migliorare</span>
                  <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-[#FEF3C7] text-[#D97706]">Completa</span>
                </button>
              );
            })}
          </div>
        )}

        {/* LOW */}
        {lowItems.length > 0 && (
          <div className="mt-4 mb-2">
            <p className="text-xs font-medium text-[#6B7280] mb-2 px-1">Opzionali</p>
            {lowItems.map((sub) => {
              const Icon = ICONS[sub.card_icon] || Flame;
              return (
                <button
                  key={sub.id}
                  onClick={() => goToEntry(sub.id)}
                  className="w-full flex items-center gap-3 bg-white rounded-xl px-4 py-3 mb-2 text-left transition-colors hover:bg-gray-50"
                  style={{ border: "1px solid #E5E7EB" }}
                >
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-gray-100">
                    <Icon size={16} color="#9CA3AF" />
                  </div>
                  <span className="flex-1 text-sm text-[#6B7280]">{sub.name_it}</span>
                  <span className="text-xs text-[#9CA3AF]">Puoi completarla dopo</span>
                  <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-gray-100 text-[#9CA3AF]">Opzionale</span>
                </button>
              );
            })}
          </div>
        )}

        {/* No activities warning */}
        {withActivity.length === 0 && (
          <div className="rounded-xl px-5 py-4 flex items-center gap-3" style={{ backgroundColor: "#FFFBEB", border: "1px solid #FDE68A" }}>
            <AlertTriangle size={18} color="#D97706" />
            <p className="text-sm text-[#92400E]">
              Nessuna attività con dati disponibili. Torna allo screening per aggiornare le risposte.
            </p>
          </div>
        )}

        {/* Footer CTA */}
        {firstHigh && (
          <div className="mt-8 text-center">
            <button
              onClick={() => goToEntry(firstHigh.id)}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold text-white transition-colors"
              style={{ backgroundColor: "#2E7D32" }}
            >
              Inserisci i dati principali
              <ArrowRight size={16} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
