"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  Zap, ShoppingCart, Truck, Plane, ArrowRight,
  Users, Trash2, Building2, Flame, AlertTriangle,
  Download, ArrowUpRight, Car, TreePine,
} from "lucide-react";

const ICONS: Record<string, typeof Zap> = {
  energy: Zap, shopping: ShoppingCart, truck: Truck, plane: Plane,
  arrow: ArrowRight, person: Users, trash: Trash2, building: Building2,
};

interface Entry {
  id: string;
  subcategory_id: string;
  co2e_tonnes: number;
  spend_eur: number | null;
  emission_factor_method: string;
  precision_level: number;
  scope3_subcategories: {
    subcategory_code: string;
    name_it: string;
    card_icon: string;
  };
}

interface Screening {
  subcategory_id: string;
  has_activity: boolean | null;
  data_availability: string | null;
  significance: string;
}

// ─── Count-up hook ───────────────────────────────────────────
function useCountUp(target: number, duration: number, start: boolean) {
  const [value, setValue] = useState(0);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (!start || target <= 0) return;
    const startTime = performance.now();
    function tick(now: number) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // cubic ease-out
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(eased * target);
      if (progress < 1) rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target, duration, start]);

  return value;
}

export default function Scope3ResultPage() {
  const { id: clientId, reportId } = useParams() as { id: string; reportId: string };

  const [entries, setEntries] = useState<Entry[]>([]);
  const [screenings, setScreenings] = useState<Screening[]>([]);
  const [loading, setLoading] = useState(true);
  const [showBars, setShowBars] = useState(false);
  const [precisionTab, setPrecisionTab] = useState(1);

  // Activity-based form
  const [abQuantity, setAbQuantity] = useState("");
  const [abMaterial, setAbMaterial] = useState("");
  const [abSupplier, setAbSupplier] = useState("");
  const [abSaving, setAbSaving] = useState(false);

  const load = useCallback(async () => {
    const [entRes, scrRes] = await Promise.all([
      fetch(`/api/scope3/${reportId}/entries`),
      fetch(`/api/scope3/${reportId}/screening`),
    ]);
    const entJson = await entRes.json();
    const scrJson = await scrRes.json();
    setEntries(Array.isArray(entJson) ? entJson : []);
    setScreenings(Object.values(scrJson.screeningMap ?? {}) as Screening[]);
    setLoading(false);
  }, [reportId]);

  useEffect(() => { load(); }, [load]);

  const totalCo2e = entries.reduce((sum, e) => sum + Number(e.co2e_tonnes ?? 0), 0);
  const animatedValue = useCountUp(totalCo2e, 1400, !loading && totalCo2e > 0);
  const maxCo2e = Math.max(...entries.map((e) => Number(e.co2e_tonnes ?? 0)), 0.01);

  // Trigger bar animations after count-up
  useEffect(() => {
    if (!loading && totalCo2e > 0) {
      const t = setTimeout(() => setShowBars(true), 1700);
      return () => clearTimeout(t);
    }
  }, [loading, totalCo2e]);

  // Equivalences
  const kmAuto = totalCo2e * 5600;
  const alberi = totalCo2e * 50;

  // Warnings: activities with partial/no data
  const warnings = screenings.filter(
    (s) => s.has_activity && (s.data_availability === "parziali" || s.data_availability === "no"),
  );

  // Activity-based upgrade
  async function handleActivityUpgrade() {
    if (!abQuantity || entries.length === 0) return;
    setAbSaving(true);
    const mainEntry = entries[0];
    await fetch(`/api/scope3/${reportId}/entries`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subcategory_id: mainEntry.subcategory_id,
        quantity_kg: Number(abQuantity),
        material_type: abMaterial || null,
        supplier_name: abSupplier || null,
        subcategory_code: mainEntry.scope3_subcategories?.subcategory_code,
      }),
    });
    setAbSaving(false);
    setPrecisionTab(2);
    load();
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#F7F8F7" }}>
        <p className="text-sm text-[#9CA3AF]">Caricamento...</p>
      </div>
    );
  }

  // Report year from URL or current year
  const reportYear = new Date().getFullYear();

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#F7F8F7" }}>
      {/* Navbar */}
      <nav className="sticky top-0 z-50 flex items-center justify-between px-7" style={{ backgroundColor: "#1C2B28", height: 56 }}>
        <Link href="/" className="text-white font-semibold text-base">enworia</Link>
        <Link href={`/clients/${clientId}`}
          className="text-xs font-medium px-3 py-1 rounded-full" style={{ backgroundColor: "#2A3D39", color: "#A8C5BE" }}>
          Torna al cliente
        </Link>
      </nav>

      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* Done bar */}
        <div
          className="rounded-xl px-5 py-3 mb-6 animate-fade-in"
          style={{ backgroundColor: "#E8F5E9", border: "1px solid #C8E6C9" }}
        >
          <p className="text-sm font-semibold text-[#2E7D32]">
            Calcolo completato — Scope 3 iniziale pronto
          </p>
        </div>

        {/* WOW block */}
        <div
          className="bg-white rounded-2xl p-8 mb-6 text-center"
          style={{ border: "1px solid #E5E7EB", boxShadow: "0 4px 24px rgba(0,0,0,0.04)" }}
        >
          <p className="text-xs font-medium text-[#9CA3AF] uppercase tracking-wider mb-2">
            Emissioni Scope 3 stimate
          </p>
          <p className="text-[64px] font-bold text-[#1F2937] leading-none">
            {animatedValue.toLocaleString("it-IT", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
          </p>
          <p className="text-lg text-[#6B7280] mt-1">tCO₂e</p>
          <p className="text-sm text-[#9CA3AF] mt-3">Emissioni indirette annuali</p>
          <div className="flex justify-center gap-4 mt-3 text-xs text-[#9CA3AF]">
            <span>Basato su: dati disponibili</span>
            <span>Precisione: iniziale</span>
            <span>Anno: {reportYear}</span>
          </div>
          <div className="flex justify-center gap-6 mt-4 text-sm text-[#6B7280]">
            <span className="flex items-center gap-1.5">
              <Car size={16} color="#9CA3AF" />
              {Math.round(kmAuto).toLocaleString("it-IT")} km in auto
            </span>
            <span className="flex items-center gap-1.5">
              <TreePine size={16} color="#9CA3AF" />
              {Math.round(alberi).toLocaleString("it-IT")} alberi per compensare
            </span>
          </div>
        </div>

        {/* Breakdown */}
        <div className="bg-white rounded-2xl p-6 mb-6" style={{ border: "1px solid #E5E7EB" }}>
          <p className="text-sm font-semibold text-[#1F2937] mb-4">Dettaglio per attività</p>
          {entries.map((entry, i) => {
            const subInfo = entry.scope3_subcategories;
            const Icon = ICONS[subInfo?.card_icon] || Flame;
            const co2e = Number(entry.co2e_tonnes ?? 0);
            const pct = totalCo2e > 0 ? (co2e / totalCo2e) * 100 : 0;
            const barWidth = showBars ? `${(co2e / maxCo2e) * 100}%` : "0%";
            return (
              <div key={entry.id} className="flex items-center gap-3 mb-3">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: "#F0FDF4" }}>
                  <Icon size={14} color="#2E7D32" />
                </div>
                <span className="text-sm text-[#1F2937] w-40 truncate">{subInfo?.name_it}</span>
                <div className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: barWidth,
                      backgroundColor: "#2E7D32",
                      transition: `width 0.6s ease ${i * 0.3}s`,
                    }}
                  />
                </div>
                <span className="text-sm font-semibold text-[#1F2937] w-28 text-right">
                  {co2e.toLocaleString("it-IT", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} t
                </span>
                <span className="text-xs text-[#9CA3AF] w-12 text-right">
                  {pct.toFixed(0)}%
                </span>
              </div>
            );
          })}
        </div>

        {/* Warnings */}
        {warnings.length > 0 && (
          <div className="bg-white rounded-2xl p-6 mb-6" style={{ border: "1px solid #FDE68A" }}>
            <p className="text-sm font-semibold text-[#92400E] mb-3 flex items-center gap-2">
              <AlertTriangle size={16} color="#D97706" />
              Migliora la precisione
            </p>
            {warnings.map((w) => {
              const subName = screenings.find((s) => s.subcategory_id === w.subcategory_id);
              return (
                <p key={w.subcategory_id} className="text-xs text-[#92400E] mb-1">
                  Dati {w.data_availability === "parziali" ? "parziali" : "mancanti"} per una o più attività
                </p>
              );
            })}
          </div>
        )}

        {/* Precision levels */}
        <div className="bg-white rounded-2xl p-6 mb-6" style={{ border: "1px solid #E5E7EB" }}>
          <p className="text-sm font-semibold text-[#1F2937] mb-3">Livello di precisione</p>
          <div className="flex gap-2 mb-4">
            {[
              { v: 1, label: "Livello 1 Base" },
              { v: 2, label: "Livello 2 Migliorato" },
              { v: 3, label: "Livello 3 Avanzato" },
            ].map((lv) => (
              <button
                key={lv.v}
                onClick={() => setPrecisionTab(lv.v)}
                className="flex-1 py-2 rounded-lg text-xs font-medium transition-colors"
                style={{
                  border: precisionTab === lv.v ? "1.5px solid #2E7D32" : "1px solid #E5E7EB",
                  backgroundColor: precisionTab === lv.v ? "#E8F5E9" : "#fff",
                  color: precisionTab === lv.v ? "#2E7D32" : "#6B7280",
                }}
              >
                {lv.label}
              </button>
            ))}
          </div>
          {precisionTab === 1 && (
            <p className="text-xs text-[#9CA3AF]">
              Stima basata sulla spesa annua (spend-based). Precisione tipica: ±40%.
            </p>
          )}
          {(precisionTab === 2 || precisionTab === 3) && (
            <div className="space-y-3">
              <p className="text-xs text-[#6B7280] mb-2">
                Inserisci dati fisici per migliorare la precisione del calcolo.
              </p>
              <div>
                <label className="text-xs text-[#6B7280] block mb-1">Quantità acquistata (kg/anno)</label>
                <input
                  type="number"
                  min="0"
                  placeholder="0"
                  value={abQuantity}
                  onChange={(e) => setAbQuantity(e.target.value)}
                  className="w-full py-2.5 px-3 rounded-lg text-sm text-[#1F2937]"
                  style={{ border: "1px solid #E5E7EB" }}
                />
              </div>
              <div>
                <label className="text-xs text-[#6B7280] block mb-1">Tipo materiale principale</label>
                <select
                  value={abMaterial}
                  onChange={(e) => setAbMaterial(e.target.value)}
                  className="w-full py-2.5 px-3 rounded-lg text-sm text-[#1F2937]"
                  style={{ border: "1px solid #E5E7EB" }}
                >
                  <option value="">— Seleziona —</option>
                  <option value="metals">Metalli</option>
                  <option value="plastics">Plastica</option>
                  <option value="wood">Legno</option>
                  <option value="paper">Carta</option>
                  <option value="chemicals">Chimici</option>
                  <option value="food">Alimenti</option>
                  <option value="textiles">Tessili</option>
                  <option value="other">Altro</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-[#6B7280] block mb-1">Fornitore principale (opzionale)</label>
                <input
                  type="text"
                  placeholder="Nome fornitore"
                  value={abSupplier}
                  onChange={(e) => setAbSupplier(e.target.value)}
                  className="w-full py-2.5 px-3 rounded-lg text-sm text-[#1F2937]"
                  style={{ border: "1px solid #E5E7EB" }}
                />
              </div>
              <button
                onClick={handleActivityUpgrade}
                disabled={!abQuantity || abSaving}
                className="w-full py-2.5 rounded-lg text-sm font-semibold text-white transition-colors"
                style={{
                  backgroundColor: abQuantity && !abSaving ? "#2E7D32" : "#D1D5DB",
                  cursor: abQuantity && !abSaving ? "pointer" : "not-allowed",
                }}
              >
                {abSaving ? "Aggiornamento..." : "Aggiorna emissioni"}
              </button>
            </div>
          )}
        </div>

        {/* Next step */}
        <div className="rounded-2xl px-5 py-4 mb-6" style={{ backgroundColor: "#EFF6FF", border: "1px solid #BFDBFE" }}>
          <div className="flex items-center gap-3">
            <ArrowUpRight size={18} color="#2563EB" />
            <div>
              <p className="text-sm font-semibold text-[#1E40AF]">Prossimo passo consigliato</p>
              <p className="text-xs text-[#3B82F6] mt-0.5">
                Completa le altre attività per avere un inventario Scope 3 completo
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-3">
          <Link
            href={`/clients/${clientId}`}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-medium transition-colors"
            style={{ border: "1px solid #E5E7EB", color: "#6B7280" }}
          >
            <Download size={16} />
            Esporta report
          </Link>
          <Link
            href={`/clients/${clientId}/ghg/${reportId}/scope3/ranking`}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold text-white"
            style={{ backgroundColor: "#2E7D32" }}
          >
            Migliora precisione
            <ArrowRight size={16} />
          </Link>
        </div>
      </div>
    </div>
  );
}
