'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import UploadBolletta from '@/components/ingestion/UploadBolletta'

// ─── Constants ──────────────────────────────────────────────────────────────
const YEARS = [2026, 2025, 2024, 2023, 2022, 2021, 2020]
const MONTHS = [
  { v: 1, l: 'Gennaio' }, { v: 2, l: 'Febbraio' }, { v: 3, l: 'Marzo' },
  { v: 4, l: 'Aprile' }, { v: 5, l: 'Maggio' }, { v: 6, l: 'Giugno' },
  { v: 7, l: 'Luglio' }, { v: 8, l: 'Agosto' }, { v: 9, l: 'Settembre' },
  { v: 10, l: 'Ottobre' }, { v: 11, l: 'Novembre' }, { v: 12, l: 'Dicembre' },
]

const SCOPE1_SOURCES = [
  { key: 'gas_naturale', label: 'Gas naturale', unit: 'Sm³', feSubstance: 'natural_gas_defra_cubic_metres', fallbackFe: 2.06672 },
  { key: 'gasolio', label: 'Gasolio', unit: 'litri', feSubstance: 'diesel_average_biofuel_blend_defra_litres', fallbackFe: 2.57082 },
  { key: 'benzina', label: 'Benzina', unit: 'litri', feSubstance: 'petrol_average_biofuel_blend_defra_litres', fallbackFe: 2.06916 },
  { key: 'gpl', label: 'GPL', unit: 'litri', feSubstance: 'lpg_defra_litres', fallbackFe: 1.55713 },
]

const SCOPE2_SOURCES = [
  { key: 'elettricita', label: 'Elettricità', unit: 'kWh', feSubstance: 'ispra_elec_it_2023', fallbackFe: 0.2347, feSourceLabel: 'ISPRA 2023' },
  { key: 'calore', label: 'Teleriscaldamento', unit: 'kWh', feSubstance: 'heat_district_defra', fallbackFe: 0.17529, feSourceLabel: 'DEFRA 2025' },
]

const STEPS = ['Modalità', 'Periodo', 'Scope 1', 'Scope 2', 'Riepilogo']
const DRAFT_KEY = 'enworia_ghg_entry_draft'

// ─── Formatting helpers ─────────────────────────────────────────────────────
function fmtNum(n) {
  if (n == null || isNaN(n)) return '—'
  return n.toLocaleString('it-IT', { maximumFractionDigits: n >= 100 ? 0 : n >= 1 ? 2 : 4 })
}

function fmtCo2(kgCo2e) {
  if (kgCo2e == null || isNaN(kgCo2e) || kgCo2e === 0) return '—'
  if (kgCo2e >= 1000) return `${(kgCo2e / 1000).toLocaleString('it-IT', { maximumFractionDigits: 3 })} tCO₂e`
  return `${kgCo2e.toLocaleString('it-IT', { maximumFractionDigits: 2 })} kgCO₂e`
}

// ─── Progress bar ───────────────────────────────────────────────────────────
function StepBar({ current }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', marginBottom: 28, gap: 0 }}>
      {STEPS.map((label, i) => (
        <div key={i} style={{ display: 'contents' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <div style={{
              width: 30, height: 30, borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, fontWeight: 600,
              background: i < current ? '#27AE60' : i === current ? '#1C2B28' : '#E2EAE8',
              color: i <= current ? '#fff' : '#999',
              transition: 'all 0.2s',
            }}>
              {i < current ? '✓' : i + 1}
            </div>
            <span style={{ fontSize: 10, color: i === current ? '#1C2B28' : '#999', fontWeight: i === current ? 600 : 400, whiteSpace: 'nowrap' }}>
              {label}
            </span>
          </div>
          {i < STEPS.length - 1 && (
            <div style={{ flex: 1, height: 2, background: i < current ? '#27AE60' : '#E2EAE8', alignSelf: 'center', marginTop: -16, transition: 'all 0.2s' }} />
          )}
        </div>
      ))}
    </div>
  )
}

// ─── Source input row ───────────────────────────────────────────────────────
function SourceRow({ cfg, value, note, fe, onChange }) {
  const qty = parseFloat(value) || 0
  const feVal = fe ?? cfg.fallbackFe
  const co2e = qty * feVal

  return (
    <div style={{
      background: '#fff', border: '0.5px solid #E2EAE8', borderRadius: 10,
      padding: '14px 18px', marginBottom: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#1C2B28', marginBottom: 6 }}>{cfg.label}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="number" min="0" step="any" placeholder="0"
              value={value || ''}
              onChange={e => onChange('value', e.target.value)}
              style={{
                width: 150, fontSize: 14, padding: '8px 10px',
                border: '1px solid #E2EAE8', borderRadius: 6, color: '#1C2B28',
              }}
            />
            <span style={{ fontSize: 12, color: '#999', minWidth: 36 }}>{cfg.unit}</span>
            <span style={{ fontSize: 10, color: '#bbb' }}>× {fmtNum(feVal)} kgCO₂e/{cfg.unit}</span>
          </div>
        </div>
        <div style={{ fontSize: 14, fontWeight: 700, color: qty > 0 ? '#27AE60' : '#ccc', minWidth: 110, textAlign: 'right' }}>
          {qty > 0 ? fmtCo2(co2e) : '—'}
        </div>
      </div>
      <input
        type="text" placeholder="Note (facoltativo)"
        value={note || ''}
        onChange={e => onChange('note', e.target.value)}
        style={{
          width: '100%', fontSize: 11, padding: '5px 8px', marginTop: 8,
          border: '0.5px solid #E2EAE8', borderRadius: 6, color: '#888', boxSizing: 'border-box',
        }}
      />
    </div>
  )
}

// ─── Main component ─────────────────────────────────────────────────────────
export default function GhgDataEntry({ companyId, editPeriodId }) {
  const [step, setStep] = useState(0)
  const [mode, setMode] = useState(null)       // 'annual' | 'monthly'
  const [year, setYear] = useState(2025)
  const [month, setMonth] = useState(1)
  const [periodId, setPeriodId] = useState(editPeriodId || null)
  const [loading, setLoading] = useState(false)
  const [saveMsg, setSaveMsg] = useState(null)  // { type: 'ok'|'err', text }

  const [scope1, setScope1] = useState(() => {
    const o = {}; SCOPE1_SOURCES.forEach(s => { o[s.key] = { value: '', note: '' } }); return o
  })
  const [scope2, setScope2] = useState(() => {
    const o = {}; SCOPE2_SOURCES.forEach(s => { o[s.key] = { value: '', note: '' } }); return o
  })
  const [feMap, setFeMap] = useState({})        // substance → { fe_co2eq, id }
  const draftTimer = useRef(null)

  // ── Load FEs ──
  useEffect(() => {
    async function load() {
      const subs = [...SCOPE1_SOURCES, ...SCOPE2_SOURCES].map(s => s.feSubstance)
      const { data } = await supabase.from('emission_factors').select('id,substance,fe_co2eq').in('substance', subs)
      if (data) {
        const m = {}
        data.forEach(r => { m[r.substance] = { fe: r.fe_co2eq, id: r.id } })
        setFeMap(m)
      }
    }
    load()
  }, [])

  // ── Load existing period in edit mode ──
  useEffect(() => {
    if (!editPeriodId) return
    async function loadPeriod() {
      setLoading(true)
      const { data: period } = await supabase.from('ghg_periods').select('*').eq('id', editPeriodId).single()
      if (period) {
        setYear(period.year)
        setMonth(period.month || 1)
        setMode(period.month == null ? 'annual' : 'monthly')
        setPeriodId(period.id)

        const { data: entries } = await supabase.from('energy_entries').select('*').eq('period_id', period.id)
        if (entries) {
          const s1 = { ...scope1 }, s2 = { ...scope2 }
          for (const e of entries) {
            if (e.scope === 1) {
              const match = SCOPE1_SOURCES.find(s => s.key === e.source_category)
              if (match) s1[match.key] = { value: String(e.quantity ?? ''), note: e.notes || '' }
            }
            if (e.scope === 2) {
              const match = SCOPE2_SOURCES.find(s => s.key === e.source_category)
              if (match) s2[match.key] = { value: String(e.quantity ?? ''), note: e.notes || '' }
            }
          }
          setScope1(s1); setScope2(s2)
        }
        setStep(2) // jump to scope 1 editing
      }
      setLoading(false)
    }
    loadPeriod()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editPeriodId])

  // ── Restore draft ──
  useEffect(() => {
    if (editPeriodId) return // don't restore draft in edit mode
    try {
      const raw = localStorage.getItem(DRAFT_KEY)
      if (!raw) return
      const d = JSON.parse(raw)
      if (d.companyId !== companyId) return
      if (d.mode) setMode(d.mode)
      if (d.year) setYear(d.year)
      if (d.month) setMonth(d.month)
      if (d.scope1) setScope1(d.scope1)
      if (d.scope2) setScope2(d.scope2)
      if (d.step != null) setStep(d.step)
    } catch { /* ignore */ }
  }, [companyId, editPeriodId])

  // ── Auto-save draft ──
  const saveDraft = useCallback(() => {
    if (draftTimer.current) clearTimeout(draftTimer.current)
    draftTimer.current = setTimeout(() => {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ companyId, mode, year, month, scope1, scope2, step }))
    }, 30000)
  }, [companyId, mode, year, month, scope1, scope2, step])
  useEffect(saveDraft, [saveDraft])

  // ── Ensure period exists ──
  async function ensurePeriod() {
    setLoading(true)
    const mVal = mode === 'annual' ? null : month

    let query = supabase.from('ghg_periods').select('*').eq('company_id', companyId).eq('year', year)
    query = mVal == null ? query.is('month', null) : query.eq('month', mVal)
    const { data: existing } = await query.maybeSingle()

    if (existing) {
      setPeriodId(existing.id)
      // Load existing entries
      const { data: entries } = await supabase.from('energy_entries').select('*').eq('period_id', existing.id)
      if (entries && entries.length > 0) {
        const s1 = { ...scope1 }, s2 = { ...scope2 }
        for (const e of entries) {
          if (e.scope === 1) {
            const m = SCOPE1_SOURCES.find(s => s.key === e.source_category)
            if (m) s1[m.key] = { value: String(e.quantity ?? ''), note: e.notes || '' }
          }
          if (e.scope === 2) {
            const m = SCOPE2_SOURCES.find(s => s.key === e.source_category)
            if (m) s2[m.key] = { value: String(e.quantity ?? ''), note: e.notes || '' }
          }
        }
        setScope1(s1); setScope2(s2)
      }
    } else {
      const { data: created, error } = await supabase.from('ghg_periods')
        .insert({ company_id: companyId, year, month: mVal, status: 'draft' })
        .select().single()
      if (error) { console.error('Period create:', error); setLoading(false); return false }
      setPeriodId(created.id)
    }
    setLoading(false)
    return true
  }

  // ── Calculate totals ──
  function scopeTotal(sources, data) {
    let t = 0
    for (const s of sources) {
      const qty = parseFloat(data[s.key]?.value) || 0
      const fe = feMap[s.feSubstance]?.fe ?? s.fallbackFe
      t += qty * fe
    }
    return t
  }
  const s1Total = scopeTotal(SCOPE1_SOURCES, scope1)
  const s2Total = scopeTotal(SCOPE2_SOURCES, scope2)
  const total = s1Total + s2Total

  // ── Save ──
  async function handleSave(finalStatus) {
    if (!periodId) return
    setSaveMsg(null)
    setLoading(true)

    // Delete existing entries and re-insert
    await supabase.from('energy_entries').delete().eq('period_id', periodId)

    const rows = []
    for (const src of SCOPE1_SOURCES) {
      const qty = parseFloat(scope1[src.key]?.value) || 0
      if (qty <= 0) continue
      const fe = feMap[src.feSubstance]?.fe ?? src.fallbackFe
      rows.push({
        period_id: periodId, scope: 1,
        source_category: src.key, source_label: src.label,
        quantity: qty, unit: src.unit,
        fe_id: feMap[src.feSubstance]?.id || null,
        fe_value: fe, fe_unit: `kgCO2e/${src.unit}`, fe_source: 'DEFRA 2025',
        co2e_kg: qty * fe,
        data_quality: 'bolletta', data_source: 'inserimento manuale',
        estimated: false, notes: scope1[src.key]?.note || null,
      })
    }
    for (const src of SCOPE2_SOURCES) {
      const qty = parseFloat(scope2[src.key]?.value) || 0
      if (qty <= 0) continue
      const fe = feMap[src.feSubstance]?.fe ?? src.fallbackFe
      rows.push({
        period_id: periodId, scope: 2,
        source_category: src.key, source_label: src.label,
        quantity: qty, unit: src.unit,
        fe_id: feMap[src.feSubstance]?.id || null,
        fe_value: fe, fe_unit: `kgCO2e/${src.unit}`, fe_source: src.feSourceLabel || 'DEFRA 2025',
        co2e_kg: qty * fe,
        data_quality: 'bolletta', data_source: 'inserimento manuale',
        estimated: false, approach: 'location', notes: scope2[src.key]?.note || null,
      })
    }

    if (rows.length > 0) {
      const { error } = await supabase.from('energy_entries').insert(rows)
      if (error) { console.error('Save entries:', error); setSaveMsg({ type: 'err', text: 'Errore salvataggio: ' + error.message }); setLoading(false); return }
    }

    await supabase.from('ghg_periods').update({ status: finalStatus }).eq('id', periodId)
    localStorage.removeItem(DRAFT_KEY)
    setSaveMsg({ type: 'ok', text: finalStatus === 'closed' ? 'Periodo completato e salvato.' : 'Bozza salvata.' })
    setLoading(false)
  }

  // ── Card wrapper shortcut ──
  const Card = ({ children, style }) => (
    <div style={{ background: '#fff', border: '0.5px solid #E2EAE8', borderRadius: 10, padding: '20px 24px', marginBottom: 16, ...style }}>
      {children}
    </div>
  )

  const periodLabel = mode === 'annual' ? `Anno ${year}` : `${MONTHS.find(m => m.v === month)?.l} ${year}`

  if (loading && step === 0) return <div style={{ padding: 40, color: '#999' }}>Caricamento...</div>

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: 24, fontFamily: 'Arial, sans-serif' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, color: '#1C2B28', margin: 0 }}>
          {editPeriodId ? 'Modifica periodo GHG' : 'Nuovo inserimento GHG'}
        </h1>
        <a href={`/clients/${companyId}/periods`} style={{ fontSize: 13, color: '#2563eb', textDecoration: 'none' }}>
          ← Torna ai periodi
        </a>
      </div>
      <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 20px' }}>
        Scope 1 e 2 — Inventario emissioni gas serra
      </p>

      <StepBar current={step} />

      {/* ── Step 0: Modalità ── */}
      {step === 0 && (
        <Card>
          <h2 style={{ fontSize: 15, fontWeight: 600, color: '#1C2B28', margin: '0 0 16px' }}>Scegli la modalità</h2>
          <div style={{ display: 'flex', gap: 16, marginBottom: 20 }}>
            {[
              { key: 'annual', icon: '📅', title: 'Inventario annuale', desc: 'Dati aggregati per tutto l\'anno (month=NULL)' },
              { key: 'monthly', icon: '🗓️', title: 'Inserimento mensile', desc: 'Dati per un mese specifico' },
            ].map(opt => (
              <div
                key={opt.key}
                onClick={() => setMode(opt.key)}
                style={{
                  flex: 1, padding: '20px 16px', borderRadius: 10, cursor: 'pointer', textAlign: 'center',
                  border: mode === opt.key ? '2px solid #27AE60' : '1px solid #E2EAE8',
                  background: mode === opt.key ? '#f0fdf4' : '#fff',
                  transition: 'all 0.15s',
                }}
              >
                <div style={{ fontSize: 28, marginBottom: 8 }}>{opt.icon}</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#1C2B28' }}>{opt.title}</div>
                <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>{opt.desc}</div>
              </div>
            ))}
          </div>
          <div style={{ textAlign: 'right' }}>
            <button
              onClick={() => setStep(1)}
              disabled={!mode}
              style={{
                fontSize: 14, fontWeight: 500, padding: '10px 24px', borderRadius: 8,
                border: 'none', cursor: mode ? 'pointer' : 'default',
                background: mode ? '#27AE60' : '#E2EAE8', color: mode ? '#fff' : '#999',
              }}
            >Avanti →</button>
          </div>
        </Card>
      )}

      {/* ── Step 1: Periodo ── */}
      {step === 1 && (
        <Card>
          <h2 style={{ fontSize: 15, fontWeight: 600, color: '#1C2B28', margin: '0 0 16px' }}>Seleziona il periodo</h2>
          <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#555', display: 'block', marginBottom: 4 }}>Anno</label>
              <select
                value={year} onChange={e => setYear(Number(e.target.value))}
                style={{ width: '100%', fontSize: 14, padding: '8px 10px', border: '1px solid #E2EAE8', borderRadius: 6, color: '#1C2B28', background: '#fff' }}
              >
                {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            {mode === 'monthly' && (
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#555', display: 'block', marginBottom: 4 }}>Mese</label>
                <select
                  value={month} onChange={e => setMonth(Number(e.target.value))}
                  style={{ width: '100%', fontSize: 14, padding: '8px 10px', border: '1px solid #E2EAE8', borderRadius: 6, color: '#1C2B28', background: '#fff' }}
                >
                  {MONTHS.map(m => <option key={m.v} value={m.v}>{m.l}</option>)}
                </select>
              </div>
            )}
          </div>
          <div style={{ background: '#F4F8F7', borderRadius: 6, padding: '10px 14px', fontSize: 12, color: '#555', marginBottom: 20 }}>
            {mode === 'annual'
              ? `Inventario annuale ${year}. Se esiste già un periodo per quest'anno, i dati verranno caricati.`
              : `Periodo: ${MONTHS.find(m => m.v === month)?.l} ${year}. Se esistono già dati, verranno caricati.`}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <button onClick={() => setStep(0)} style={{ fontSize: 14, padding: '10px 24px', borderRadius: 8, border: '1px solid #E2EAE8', background: '#fff', color: '#1C2B28', cursor: 'pointer' }}>
              ← Indietro
            </button>
            <button
              disabled={loading}
              onClick={async () => { if (await ensurePeriod()) setStep(2) }}
              style={{ fontSize: 14, fontWeight: 500, padding: '10px 24px', borderRadius: 8, border: 'none', cursor: 'pointer', background: '#27AE60', color: '#fff', opacity: loading ? 0.5 : 1 }}
            >
              {loading ? 'Caricamento...' : 'Avanti →'}
            </button>
          </div>
        </Card>
      )}

      {/* ── Step 2: Scope 1 ── */}
      {step === 2 && (
        <div>
          {/* Upload bolletta — above manual form */}
          <UploadBolletta
            companyId={companyId}
            periodId={periodId}
            onApproved={() => window.location.reload()}
          />

          {/* Separator */}
          <div style={{ position: 'relative', margin: '20px 0' }}>
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center' }}>
              <div style={{ width: '100%', borderTop: '1px solid #E2EAE8' }} />
            </div>
            <div style={{ position: 'relative', display: 'flex', justifyContent: 'center' }}>
              <span style={{ padding: '0 12px', background: '#fff', fontSize: 12, color: '#999' }}>
                oppure inserisci manualmente
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div>
              <h2 style={{ fontSize: 15, fontWeight: 600, color: '#1C2B28', margin: 0 }}>Scope 1 — Emissioni dirette</h2>
              <p style={{ fontSize: 12, color: '#6b7280', margin: '4px 0 0' }}>Combustibili fossili consumati dall'organizzazione — {periodLabel}</p>
            </div>
            <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 4, background: '#27AE6018', color: '#27AE60' }}>Scope 1</span>
          </div>

          {SCOPE1_SOURCES.map(src => (
            <SourceRow
              key={src.key} cfg={src}
              value={scope1[src.key]?.value} note={scope1[src.key]?.note}
              fe={feMap[src.feSubstance]?.fe}
              onChange={(field, val) => setScope1(prev => ({ ...prev, [src.key]: { ...prev[src.key], [field]: val } }))}
            />
          ))}

          <div style={{ background: '#f0fdf4', border: '0.5px solid #27AE6030', borderRadius: 10, padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <span style={{ fontSize: 14, fontWeight: 500, color: '#15803d' }}>Totale Scope 1</span>
            <span style={{ fontSize: 18, fontWeight: 700, color: '#15803d' }}>{fmtCo2(s1Total)}</span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <button onClick={() => setStep(1)} style={{ fontSize: 14, padding: '10px 24px', borderRadius: 8, border: '1px solid #E2EAE8', background: '#fff', color: '#1C2B28', cursor: 'pointer' }}>← Indietro</button>
            <button onClick={() => setStep(3)} style={{ fontSize: 14, fontWeight: 500, padding: '10px 24px', borderRadius: 8, border: 'none', cursor: 'pointer', background: '#27AE60', color: '#fff' }}>Avanti → Scope 2</button>
          </div>
        </div>
      )}

      {/* ── Step 3: Scope 2 ── */}
      {step === 3 && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div>
              <h2 style={{ fontSize: 15, fontWeight: 600, color: '#1C2B28', margin: 0 }}>Scope 2 — Energia acquistata</h2>
              <p style={{ fontSize: 12, color: '#6b7280', margin: '4px 0 0' }}>Elettricità e calore acquistati — {periodLabel}</p>
            </div>
            <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 4, background: '#2563eb18', color: '#2563eb' }}>Scope 2</span>
          </div>

          {SCOPE2_SOURCES.map(src => (
            <SourceRow
              key={src.key} cfg={src}
              value={scope2[src.key]?.value} note={scope2[src.key]?.note}
              fe={feMap[src.feSubstance]?.fe}
              onChange={(field, val) => setScope2(prev => ({ ...prev, [src.key]: { ...prev[src.key], [field]: val } }))}
            />
          ))}

          <div style={{ background: '#eff6ff', border: '0.5px solid #2563eb30', borderRadius: 10, padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <span style={{ fontSize: 14, fontWeight: 500, color: '#1d4ed8' }}>Totale Scope 2</span>
            <span style={{ fontSize: 18, fontWeight: 700, color: '#1d4ed8' }}>{fmtCo2(s2Total)}</span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <button onClick={() => setStep(2)} style={{ fontSize: 14, padding: '10px 24px', borderRadius: 8, border: '1px solid #E2EAE8', background: '#fff', color: '#1C2B28', cursor: 'pointer' }}>← Indietro</button>
            <button onClick={() => setStep(4)} style={{ fontSize: 14, fontWeight: 500, padding: '10px 24px', borderRadius: 8, border: 'none', cursor: 'pointer', background: '#27AE60', color: '#fff' }}>Avanti → Riepilogo</button>
          </div>
        </div>
      )}

      {/* ── Step 4: Riepilogo ── */}
      {step === 4 && (
        <div>
          <Card>
            <h2 style={{ fontSize: 15, fontWeight: 600, color: '#1C2B28', margin: '0 0 16px' }}>Riepilogo — {periodLabel}</h2>

            {/* Scope 1 */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#15803d', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>Scope 1 — Emissioni dirette</div>
              {SCOPE1_SOURCES.map(src => {
                const qty = parseFloat(scope1[src.key]?.value) || 0
                if (qty <= 0) return null
                const fe = feMap[src.feSubstance]?.fe ?? src.fallbackFe
                return (
                  <div key={src.key} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '0.5px solid #f0f0f0' }}>
                    <span style={{ fontSize: 13, color: '#1C2B28' }}>{src.label} — {fmtNum(qty)} {src.unit}</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#15803d' }}>{fmtCo2(qty * fe)}</span>
                  </div>
                )
              })}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '2px solid #15803d20' }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: '#1C2B28' }}>Subtotale Scope 1</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: '#15803d' }}>{fmtCo2(s1Total)}</span>
              </div>
            </div>

            {/* Scope 2 */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#1d4ed8', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>Scope 2 — Energia acquistata</div>
              {SCOPE2_SOURCES.map(src => {
                const qty = parseFloat(scope2[src.key]?.value) || 0
                if (qty <= 0) return null
                const fe = feMap[src.feSubstance]?.fe ?? src.fallbackFe
                return (
                  <div key={src.key} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '0.5px solid #f0f0f0' }}>
                    <span style={{ fontSize: 13, color: '#1C2B28' }}>{src.label} — {fmtNum(qty)} {src.unit}</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#1d4ed8' }}>{fmtCo2(qty * fe)}</span>
                  </div>
                )
              })}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '2px solid #1d4ed820' }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: '#1C2B28' }}>Subtotale Scope 2</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: '#1d4ed8' }}>{fmtCo2(s2Total)}</span>
              </div>
            </div>

            {/* Grand total */}
            <div style={{ background: '#F4F8F7', borderRadius: 8, padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 16, fontWeight: 600, color: '#1C2B28' }}>Totale CO₂e (Scope 1 + 2)</span>
              <span style={{ fontSize: 22, fontWeight: 700, color: '#1C2B28' }}>{fmtCo2(total)}</span>
            </div>
          </Card>

          {/* Save feedback */}
          {saveMsg && (
            <div style={{
              padding: '10px 16px', borderRadius: 8, marginBottom: 12, fontSize: 13, fontWeight: 500, textAlign: 'center',
              background: saveMsg.type === 'ok' ? '#f0fdf4' : '#fef2f2',
              color: saveMsg.type === 'ok' ? '#15803d' : '#dc2626',
              border: `1px solid ${saveMsg.type === 'ok' ? '#27AE6040' : '#ef444440'}`,
            }}>
              {saveMsg.type === 'ok' ? '✓ ' : ''}{saveMsg.text}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <button onClick={() => setStep(3)} style={{ fontSize: 14, padding: '10px 24px', borderRadius: 8, border: '1px solid #E2EAE8', background: '#fff', color: '#1C2B28', cursor: 'pointer' }}>← Indietro</button>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                disabled={loading}
                onClick={() => handleSave('draft')}
                style={{ fontSize: 14, padding: '10px 20px', borderRadius: 8, border: '1px solid #E2EAE8', background: '#fff', color: '#1C2B28', cursor: 'pointer', opacity: loading ? 0.5 : 1 }}
              >{loading ? '...' : 'Salva bozza'}</button>
              <button
                disabled={loading}
                onClick={() => handleSave('closed')}
                style={{ fontSize: 14, fontWeight: 600, padding: '10px 24px', borderRadius: 8, border: 'none', cursor: 'pointer', background: '#27AE60', color: '#fff', opacity: loading ? 0.5 : 1 }}
              >{loading ? '...' : 'Segna come completo'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
