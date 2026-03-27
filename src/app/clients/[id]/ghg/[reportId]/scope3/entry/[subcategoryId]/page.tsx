"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Zap, ShoppingCart, Truck, Plane, ArrowRight,
  Users, Trash2, Building2, Flame, Check, FileText,
} from "lucide-react";

const ICONS: Record<string, typeof Zap> = {
  energy: Zap, shopping: ShoppingCart, truck: Truck, plane: Plane,
  arrow: ArrowRight, person: Users, trash: Trash2, building: Building2,
};

const PURCHASE_TYPES = [
  { v: "raw", label: "Materie prime", desc: "Metalli, plastica, legno, tessuti, alimenti" },
  { v: "fin", label: "Prodotti finiti", desc: "Componenti, semilavorati, prodotti a scaffale" },
  { v: "srv", label: "Servizi", desc: "Consulenza, pulizia, IT, manutenzione, logistica" },
  { v: "mix", label: "Misto", desc: "Un mix di materiali, prodotti e servizi" },
];

const SOURCE_LABELS: Record<string, string> = {
  contabilita: "Contabilità / ERP",
  fornitore: "Fornitore",
  gestionale: "Gestionale",
  altro: "Altro",
};

interface SubInfo {
  id: string;
  name_it: string;
  description_it: string;
  card_icon: string;
  subcategory_code: string;
}

export default function Scope3EntryPage() {
  const { id: clientId, reportId, subcategoryId } = useParams() as {
    id: string; reportId: string; subcategoryId: string;
  };
  const router = useRouter();

  const [sub, setSub] = useState<SubInfo | null>(null);
  const [screeningId, setScreeningId] = useState<string | null>(null);
  const [dataSource, setDataSource] = useState<string>("");
  const [loading, setLoading] = useState(true);

  // Form state
  const [spendEur, setSpendEur] = useState<string>("");
  const [purchaseType, setPurchaseType] = useState<string>("");
  const [hasCategoryDetail, setHasCategoryDetail] = useState(false);
  const [catPcts, setCatPcts] = useState({ raw: "", fin: "", srv: "" });
  const [saving, setSaving] = useState(false);
  const [showOverlay, setShowOverlay] = useState(false);

  // Step tracking
  const step1Done = spendEur !== "" && Number(spendEur.replace(/\./g, "").replace(",", ".")) > 0;
  const step2Done = purchaseType !== "";
  const step3Done = !hasCategoryDetail || (
    Number(catPcts.raw || 0) + Number(catPcts.fin || 0) + Number(catPcts.srv || 0) === 100
  );
  const allDone = step1Done && step2Done && step3Done;

  const load = useCallback(async () => {
    const res = await fetch(`/api/scope3/${reportId}/screening`);
    const json = await res.json();
    const subs = json.subcategories ?? [];
    const scr = json.screeningMap?.[subcategoryId];
    const found = subs.find((s: SubInfo) => s.id === subcategoryId);
    setSub(found ?? null);
    setScreeningId(scr?.id ?? null);
    setDataSource(scr?.data_source ?? "");
    setLoading(false);
  }, [reportId, subcategoryId]);

  useEffect(() => { load(); }, [load]);

  function formatAmount(raw: string): string {
    const num = Number(raw.replace(/\./g, "").replace(",", "."));
    if (isNaN(num) || num === 0) return "";
    return num.toLocaleString("it-IT", { maximumFractionDigits: 0 });
  }

  function parseAmount(formatted: string): number {
    return Number(formatted.replace(/\./g, "").replace(",", ".")) || 0;
  }

  async function handleCalculate() {
    if (!allDone || !sub) return;
    setShowOverlay(true);
    setSaving(true);

    // Wait for animation
    await new Promise((r) => setTimeout(r, 1500));

    await fetch(`/api/scope3/${reportId}/entries`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subcategory_id: subcategoryId,
        screening_id: screeningId,
        spend_eur: parseAmount(spendEur),
        purchase_type: purchaseType,
        has_category_detail: hasCategoryDetail,
        data_source: dataSource,
        subcategory_code: sub.subcategory_code,
      }),
    });

    setSaving(false);
    router.push(`/clients/${clientId}/ghg/${reportId}/scope3/result`);
  }

  if (loading || !sub) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#F7F8F7" }}>
        <p className="text-sm text-[#9CA3AF]">Caricamento...</p>
      </div>
    );
  }

  const Icon = ICONS[sub.card_icon] || Flame;

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#F7F8F7" }}>
      {/* Calculating overlay */}
      {showOverlay && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center" style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
          <div className="bg-white rounded-2xl px-10 py-8 text-center" style={{ boxShadow: "0 20px 60px rgba(0,0,0,0.15)" }}>
            <div className="w-10 h-10 border-3 border-[#2E7D32] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-base font-semibold text-[#1F2937]">Stiamo calcolando...</p>
            <p className="text-sm text-[#9CA3AF] mt-1">Elaborazione emissioni in corso</p>
          </div>
        </div>
      )}

      {/* Navbar */}
      <nav className="sticky top-0 z-50 flex items-center justify-between px-7" style={{ backgroundColor: "#1C2B28", height: 56 }}>
        <Link href="/" className="text-white font-semibold text-base">enworia</Link>
        <Link href={`/clients/${clientId}/ghg/${reportId}/scope3/ranking`}
          className="text-xs font-medium px-3 py-1 rounded-full" style={{ backgroundColor: "#2A3D39", color: "#A8C5BE" }}>
          Torna alle priorità
        </Link>
      </nav>

      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-1">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: "#E8F5E9" }}>
            <Icon size={20} color="#2E7D32" />
          </div>
          <div>
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-[#FEF3C7] text-[#92400E]">
              Attività principale
            </span>
            <h1 className="text-lg font-semibold text-[#1F2937]">{sub.name_it}</h1>
          </div>
        </div>
        <p className="text-sm text-[#6B7280] mb-6 ml-[52px]">{sub.description_it}</p>

        <p className="text-xs text-[#9CA3AF] mb-6">Step 3 di 3</p>

        {/* Step 1 — Spend */}
        <div className="bg-white rounded-2xl p-6 mb-4" style={{ border: "1px solid #E5E7EB" }}>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white"
              style={{ backgroundColor: step1Done ? "#2E7D32" : "#D1D5DB" }}>
              {step1Done ? <Check size={14} /> : "1"}
            </div>
            <p className="text-sm font-medium text-[#1F2937]">Quanto spendi ogni anno per questa attività?</p>
          </div>
          <div className="relative">
            <span
              className="absolute left-4 top-1/2 -translate-y-1/2 text-2xl font-semibold"
              style={{ color: step1Done ? "#2E7D32" : "#D1D5DB" }}
            >
              €
            </span>
            <input
              type="text"
              inputMode="numeric"
              placeholder="0"
              value={spendEur}
              onChange={(e) => {
                const raw = e.target.value.replace(/[^\d.,]/g, "");
                setSpendEur(raw);
              }}
              onBlur={() => { if (spendEur) setSpendEur(formatAmount(spendEur)); }}
              className="w-full py-4 pl-12 pr-4 rounded-xl text-2xl font-semibold text-[#1F2937]"
              style={{ border: step1Done ? "1.5px solid #2E7D32" : "1px solid #E5E7EB" }}
            />
          </div>
          <p className="text-xs mt-2" style={{ color: step1Done ? "#2E7D32" : "#9CA3AF" }}>
            {step1Done ? "Ok, possiamo partire" : "Inserisci il totale annuo — anche una stima va bene"}
          </p>
        </div>

        {/* Step 2 — Purchase type */}
        <div className="bg-white rounded-2xl p-6 mb-4" style={{ border: "1px solid #E5E7EB" }}>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white"
              style={{ backgroundColor: step2Done ? "#2E7D32" : "#D1D5DB" }}>
              {step2Done ? <Check size={14} /> : "2"}
            </div>
            <p className="text-sm font-medium text-[#1F2937]">Che tipo di acquisti fai principalmente?</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {PURCHASE_TYPES.map((pt) => (
              <button
                key={pt.v}
                onClick={() => setPurchaseType(pt.v)}
                className="text-left p-3 rounded-xl transition-colors"
                style={{
                  border: purchaseType === pt.v ? "1.5px solid #2E7D32" : "1px solid #E5E7EB",
                  backgroundColor: purchaseType === pt.v ? "#E8F5E9" : "#fff",
                }}
              >
                <p className="text-sm font-medium" style={{ color: purchaseType === pt.v ? "#2E7D32" : "#1F2937" }}>
                  {pt.label}
                </p>
                <p className="text-[11px] text-[#9CA3AF] mt-0.5">{pt.desc}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Step 3 — Category detail */}
        <div className="bg-white rounded-2xl p-6 mb-4" style={{ border: "1px solid #E5E7EB" }}>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white"
              style={{ backgroundColor: step3Done ? "#2E7D32" : "#D1D5DB" }}>
              {step3Done ? <Check size={14} /> : "3"}
            </div>
            <p className="text-sm font-medium text-[#1F2937]">Hai un dettaglio per categorie?</p>
          </div>
          <div className="flex gap-2 mb-3">
            <button
              onClick={() => setHasCategoryDetail(false)}
              className="flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors"
              style={{
                border: !hasCategoryDetail ? "1.5px solid #2E7D32" : "1px solid #E5E7EB",
                backgroundColor: !hasCategoryDetail ? "#E8F5E9" : "#fff",
                color: !hasCategoryDetail ? "#2E7D32" : "#6B7280",
              }}
            >
              No, solo il totale
            </button>
            <button
              onClick={() => setHasCategoryDetail(true)}
              className="flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors"
              style={{
                border: hasCategoryDetail ? "1.5px solid #2E7D32" : "1px solid #E5E7EB",
                backgroundColor: hasCategoryDetail ? "#E8F5E9" : "#fff",
                color: hasCategoryDetail ? "#2E7D32" : "#6B7280",
              }}
            >
              Sì, ho dati per categorie
            </button>
          </div>
          {hasCategoryDetail && (
            <div className="grid grid-cols-3 gap-3">
              {(["raw", "fin", "srv"] as const).map((k) => (
                <div key={k}>
                  <label className="text-xs text-[#6B7280] block mb-1">
                    {k === "raw" ? "Materie prime %" : k === "fin" ? "Prodotti finiti %" : "Servizi %"}
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    placeholder="0"
                    value={catPcts[k]}
                    onChange={(e) => setCatPcts((p) => ({ ...p, [k]: e.target.value }))}
                    className="w-full py-2 px-3 rounded-lg text-sm text-[#1F2937]"
                    style={{ border: "1px solid #E5E7EB" }}
                  />
                </div>
              ))}
              {(() => {
                const total = Number(catPcts.raw || 0) + Number(catPcts.fin || 0) + Number(catPcts.srv || 0);
                return total > 0 && total !== 100 ? (
                  <p className="col-span-3 text-xs text-[#EF4444]">Totale: {total}% — deve essere 100%</p>
                ) : null;
              })()}
            </div>
          )}
        </div>

        {/* Data source */}
        {dataSource && (
          <div className="bg-white rounded-xl px-4 py-3 mb-4 flex items-center gap-3" style={{ border: "1px solid #E5E7EB" }}>
            <FileText size={16} color="#9CA3AF" />
            <span className="text-sm text-[#6B7280] flex-1">
              Fonte dati: <b className="text-[#1F2937]">{SOURCE_LABELS[dataSource] || dataSource}</b>
            </span>
          </div>
        )}

        {/* Ready indicator */}
        {allDone && (
          <div className="rounded-xl px-4 py-3 mb-4" style={{ backgroundColor: "#E8F5E9", border: "1px solid #C8E6C9" }}>
            <p className="text-sm font-medium text-[#2E7D32]">Dati sufficienti per il calcolo</p>
          </div>
        )}

        {/* CTA */}
        <button
          onClick={handleCalculate}
          disabled={!allDone || saving}
          className="w-full py-3.5 rounded-xl text-sm font-semibold text-white transition-colors"
          style={{
            backgroundColor: allDone && !saving ? "#2E7D32" : "#D1D5DB",
            cursor: allDone && !saving ? "pointer" : "not-allowed",
          }}
        >
          Calcola emissioni →
        </button>
      </div>
    </div>
  );
}
