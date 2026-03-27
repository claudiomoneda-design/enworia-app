"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Zap, Flame, ShoppingCart, Truck, Plane, ArrowRight,
  Users, Trash2, Building2, Check, ChevronRight,
} from "lucide-react";

// ─── Icon map ────────────────────────────────────────────────
const ICONS: Record<string, typeof Zap> = {
  energy: Zap,
  shopping: ShoppingCart,
  truck: Truck,
  plane: Plane,
  arrow: ArrowRight,
  person: Users,
  trash: Trash2,
  building: Building2,
};

interface Subcategory {
  id: string;
  category_number: number;
  subcategory_code: string;
  name_it: string;
  description_it: string;
  card_icon: string;
  is_scope2_overlap: boolean;
  sort_order: number;
}

interface Screening {
  id: string;
  subcategory_id: string;
  has_activity: boolean | null;
  data_availability: string | null;
  data_source: string | null;
  significance: string;
}

const DATA_SOURCES = [
  { value: "contabilita", label: "Contabilità / ERP" },
  { value: "fornitore", label: "Fornitore" },
  { value: "gestionale", label: "Gestionale" },
  { value: "altro", label: "Altro" },
];

// ─── Focus Card ──────────────────────────────────────────────
function FocusCard({
  sub,
  screening,
  isFirst,
  onSave,
}: {
  sub: Subcategory;
  screening: Screening | null;
  isFirst: boolean;
  onSave: (answer: {
    subcategory_id: string;
    has_activity: boolean;
    data_availability?: string;
    data_source?: string;
  }) => Promise<void>;
}) {
  const [hasActivity, setHasActivity] = useState<boolean | null>(screening?.has_activity ?? null);
  const [dataAvail, setDataAvail] = useState<string | null>(screening?.data_availability ?? null);
  const [dataSource, setDataSource] = useState<string | null>(screening?.data_source ?? null);
  const [saving, setSaving] = useState(false);

  const Icon = ICONS[sub.card_icon] || Flame;
  const canConfirm =
    hasActivity === false ||
    (hasActivity === true && dataAvail === "no") ||
    (hasActivity === true && dataAvail && dataAvail !== "no" && dataSource);

  async function handleConfirm() {
    if (!canConfirm) return;
    setSaving(true);
    await onSave({
      subcategory_id: sub.id,
      has_activity: hasActivity!,
      data_availability: hasActivity ? dataAvail ?? undefined : undefined,
      data_source: hasActivity && dataAvail !== "no" ? dataSource ?? undefined : undefined,
    });
    setSaving(false);
  }

  // Auto-advance when "No"
  async function handleNoActivity() {
    setHasActivity(false);
    setSaving(true);
    await onSave({ subcategory_id: sub.id, has_activity: false });
    setSaving(false);
  }

  return (
    <div
      className="bg-white rounded-2xl p-6 mb-4 transition-all"
      style={{
        border: "1.5px solid #2E7D32",
        boxShadow: "0 0 0 4px rgba(46,125,50,0.08), 0 4px 24px rgba(0,0,0,0.06)",
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ backgroundColor: "#E8F5E9" }}
        >
          <Icon size={20} color="#2E7D32" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-[#1F2937]">{sub.name_it}</p>
          <p className="text-xs text-[#6B7280]">{sub.description_it}</p>
        </div>
        {isFirst && (
          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-[#FEF3C7] text-[#92400E]">
            Consigliato per iniziare
          </span>
        )}
      </div>

      {/* Q1: Attività presente? */}
      <div className="mb-4">
        <p className="text-sm font-medium text-[#1F2937] mb-2">Attività presente?</p>
        <div className="flex gap-2">
          <button
            onClick={handleNoActivity}
            disabled={saving}
            className="flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors"
            style={{
              border: hasActivity === false ? "1.5px solid #2E7D32" : "1px solid #E5E7EB",
              backgroundColor: hasActivity === false ? "#E8F5E9" : "#fff",
              color: hasActivity === false ? "#2E7D32" : "#6B7280",
            }}
          >
            No
          </button>
          <button
            onClick={() => setHasActivity(true)}
            className="flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors"
            style={{
              border: hasActivity === true ? "1.5px solid #2E7D32" : "1px solid #E5E7EB",
              backgroundColor: hasActivity === true ? "#E8F5E9" : "#fff",
              color: hasActivity === true ? "#2E7D32" : "#6B7280",
            }}
          >
            Sì
          </button>
        </div>
      </div>

      {/* Q2: Hai già questi dati? */}
      {hasActivity === true && (
        <div className="mb-4">
          <p className="text-sm font-medium text-[#1F2937] mb-2">Hai già questi dati?</p>
          <div className="flex gap-2">
            {[
              { v: "no", l: "No" },
              { v: "parziali", l: "Parziali" },
              { v: "si", l: "Sì, disponibili" },
            ].map((opt) => (
              <button
                key={opt.v}
                onClick={() => setDataAvail(opt.v)}
                className="flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors"
                style={{
                  border: dataAvail === opt.v ? "1.5px solid #2E7D32" : "1px solid #E5E7EB",
                  backgroundColor: dataAvail === opt.v ? "#E8F5E9" : "#fff",
                  color: dataAvail === opt.v ? "#2E7D32" : "#6B7280",
                }}
              >
                {opt.l}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Q3: Dove puoi recuperarli? */}
      {hasActivity === true && dataAvail && dataAvail !== "no" && (
        <div className="mb-4">
          <p className="text-sm font-medium text-[#1F2937] mb-2">Dove puoi recuperarli?</p>
          <div className="grid grid-cols-2 gap-2">
            {DATA_SOURCES.map((ds) => (
              <button
                key={ds.value}
                onClick={() => setDataSource(ds.value)}
                className="py-2.5 rounded-lg text-sm font-medium transition-colors"
                style={{
                  border: dataSource === ds.value ? "1.5px solid #2E7D32" : "1px solid #E5E7EB",
                  backgroundColor: dataSource === ds.value ? "#E8F5E9" : "#fff",
                  color: dataSource === ds.value ? "#2E7D32" : "#6B7280",
                }}
              >
                {ds.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Confirm button */}
      {hasActivity === true && (
        <button
          onClick={handleConfirm}
          disabled={!canConfirm || saving}
          className="w-full py-3 rounded-xl text-sm font-semibold text-white transition-colors"
          style={{
            backgroundColor: canConfirm && !saving ? "#2E7D32" : "#D1D5DB",
            cursor: canConfirm && !saving ? "pointer" : "not-allowed",
          }}
        >
          {saving ? "Salvataggio..." : "Conferma e vai alla prossima"}
        </button>
      )}
    </div>
  );
}

// ─── Completed Row ───────────────────────────────────────────
function CompletedRow({
  sub,
  screening,
  onClick,
}: {
  sub: Subcategory;
  screening: Screening;
  onClick: () => void;
}) {
  const Icon = ICONS[sub.card_icon] || Flame;
  const statusLabel = !screening.has_activity
    ? "Non presente"
    : screening.data_availability === "si"
      ? "Completata"
      : screening.data_availability === "parziali"
        ? "Dati parziali"
        : "Presente, dati mancanti";
  const statusColor = !screening.has_activity
    ? "#9CA3AF"
    : screening.data_availability === "si"
      ? "#2E7D32"
      : "#D97706";

  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 bg-white rounded-xl px-4 py-3 mb-2 text-left transition-colors hover:bg-gray-50"
      style={{ border: "1px solid #E5E7EB" }}
    >
      <div
        className="w-8 h-8 rounded-lg flex items-center justify-center"
        style={{ backgroundColor: "#F0FDF4" }}
      >
        <Icon size={16} color="#2E7D32" />
      </div>
      <span className="flex-1 text-sm font-medium text-[#1F2937]">{sub.name_it}</span>
      <span className="text-xs font-medium" style={{ color: statusColor }}>
        {statusLabel}
      </span>
      <Check size={16} color="#2E7D32" />
    </button>
  );
}

// ─── Main Page ───────────────────────────────────────────────
export default function Scope3ScreeningPage() {
  const { id: clientId, reportId } = useParams() as { id: string; reportId: string };
  const router = useRouter();

  const [subcategories, setSubcategories] = useState<Subcategory[]>([]);
  const [screeningMap, setScreeningMap] = useState<Record<string, Screening>>({});
  const [currentIdx, setCurrentIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [calculating, setCalculating] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/scope3/${reportId}/screening`);
    const json = await res.json();
    setSubcategories(json.subcategories ?? []);
    setScreeningMap(json.screeningMap ?? {});
    setLoading(false);
  }, [reportId]);

  useEffect(() => { load(); }, [load]);

  // Separate active (non-scope2) and scope2 cards
  const activeSubs = subcategories.filter((s) => !s.is_scope2_overlap);
  const scope2Subs = subcategories.filter((s) => s.is_scope2_overlap);

  // Find first incomplete
  useEffect(() => {
    if (activeSubs.length === 0) return;
    const firstIncomplete = activeSubs.findIndex((s) => !screeningMap[s.id]);
    setCurrentIdx(firstIncomplete >= 0 ? firstIncomplete : activeSubs.length);
  }, [activeSubs.length, Object.keys(screeningMap).length]); // eslint-disable-line react-hooks/exhaustive-deps

  const completedCount = activeSubs.filter((s) => screeningMap[s.id]).length;
  const hasAnyActivity = activeSubs.some((s) => screeningMap[s.id]?.has_activity);
  const currentSub = activeSubs[currentIdx];
  const nextSub = activeSubs[currentIdx + 1];

  async function handleSave(answer: Record<string, unknown>) {
    await fetch(`/api/scope3/${reportId}/screening`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(answer),
    });
    await load();
  }

  async function handleContinue() {
    setCalculating(true);
    await fetch(`/api/scope3/${reportId}/calculate`, { method: "POST" });
    router.push(`/clients/${clientId}/ghg/${reportId}/scope3/ranking`);
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
      <nav
        className="sticky top-0 z-50 flex items-center justify-between px-7"
        style={{ backgroundColor: "#1C2B28", height: 56 }}
      >
        <Link href="/" className="text-white font-semibold text-base">enworia</Link>
        <Link
          href={`/clients/${clientId}`}
          className="text-xs font-medium px-3 py-1 rounded-full"
          style={{ backgroundColor: "#2A3D39", color: "#A8C5BE" }}
        >
          Torna al cliente
        </Link>
      </nav>

      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* Header */}
        <h1 className="text-xl font-semibold text-[#1F2937] mb-1">
          Scope 3 — Emissioni indirette
        </h1>
        <p className="text-sm text-[#6B7280] mb-6">
          Rispondi a poche domande: identifichiamo le attività più importanti per te
        </p>

        {/* Progress */}
        <div
          className="rounded-xl px-4 py-3 mb-6 flex items-center justify-between"
          style={{ backgroundColor: "#fff", border: "1px solid #E5E7EB" }}
        >
          <div>
            <p className="text-xs font-medium text-[#1F2937]">
              Step 1 di 3 · {completedCount} su {activeSubs.length} attività completate
            </p>
            {nextSub && currentIdx < activeSubs.length && (
              <p className="text-[11px] text-[#9CA3AF] mt-0.5">
                Prossima: {nextSub.name_it}
              </p>
            )}
          </div>
          <div className="w-24 h-1.5 rounded-full bg-gray-100 overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${(completedCount / activeSubs.length) * 100}%`,
                backgroundColor: "#2E7D32",
              }}
            />
          </div>
        </div>

        {/* Completed rows */}
        {activeSubs.slice(0, currentIdx).map((sub) => {
          const scr = screeningMap[sub.id];
          if (!scr) return null;
          return (
            <CompletedRow
              key={sub.id}
              sub={sub}
              screening={scr}
              onClick={() => setCurrentIdx(activeSubs.indexOf(sub))}
            />
          );
        })}

        {/* Focus card */}
        {currentSub && (
          <FocusCard
            key={currentSub.id}
            sub={currentSub}
            screening={screeningMap[currentSub.id] || null}
            isFirst={currentIdx === 0}
            onSave={handleSave}
          />
        )}

        {/* Remaining (not yet reached) */}
        {activeSubs.slice(currentIdx + 1).map((sub) => (
          <div
            key={sub.id}
            className="flex items-center gap-3 rounded-xl px-4 py-3 mb-2"
            style={{ backgroundColor: "#F9FAFB", border: "1px solid #F3F4F6" }}
          >
            <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-gray-100">
              {(() => { const I = ICONS[sub.card_icon] || Flame; return <I size={16} color="#9CA3AF" />; })()}
            </div>
            <span className="text-sm text-[#9CA3AF]">{sub.name_it}</span>
          </div>
        ))}

        {/* Scope 2 overlap — locked */}
        {scope2Subs.map((sub) => (
          <div
            key={sub.id}
            className="flex items-center gap-3 rounded-xl px-4 py-3 mb-2"
            style={{ border: "1px dashed #D1D5DB", opacity: 0.55 }}
          >
            <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-gray-100">
              <Zap size={16} color="#9CA3AF" />
            </div>
            <span className="text-sm text-[#9CA3AF] flex-1">{sub.name_it}</span>
            <span className="text-[10px] text-[#9CA3AF]">Già inclusa nello Scope 2</span>
          </div>
        ))}

        {/* Footer */}
        <div className="mt-8 text-center">
          <p className="text-xs text-[#9CA3AF] mb-3">
            Hai completato {completedCount} attività. Ti guideremo partendo dalle più importanti.
          </p>
          <button
            onClick={handleContinue}
            disabled={!hasAnyActivity || calculating}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold text-white transition-colors"
            style={{
              backgroundColor: hasAnyActivity && !calculating ? "#2E7D32" : "#D1D5DB",
              cursor: hasAnyActivity && !calculating ? "pointer" : "not-allowed",
            }}
          >
            {calculating ? "Analisi in corso..." : "Continua con i dati principali"}
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
