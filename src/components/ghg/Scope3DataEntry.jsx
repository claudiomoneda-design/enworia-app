'use client'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'

// ─── FE suggestion map: subcategory → preferred substances ──────────────────
const FE_HINTS = {
  '2_1': ['ispra_elec_it_2023', 'uk_grid_defra'],
  '3_1': ['freight_hgv_all_defra_upstream', 'freight_van_avg_defra_upstream', 'freight_rail_defra'],
  '3_2': ['freight_hgv_all_defra_downstream', 'freight_van_avg_defra_downstream'],
  '3_3': ['travel_car_avg_commute_defra', 'travel_bus_commute_defra', 'travel_train_commute_defra'],
  '3_4': ['travel_car_avg_visitor_defra'],
  '3_5': ['flight_short_haul_to_from_uk_economy_class_defra', 'flight_long_haul_to_from_uk_economy_class_defra', 'travel_train_business_defra'],
  '4_1': ['material_metals_primary_defra', 'material_plastic_avg_primary_defra', 'material_steel_primary_defra'],
  '4_3': ['waste_ci_landfill_defra', 'waste_ci_incineration_defra', 'waste_plastic_landfill_defra'],
}

const TIER_OPTIONS = [
  { key: 'tier2', label: 'Dato fisico + FE secondario (Tier 2)', desc: 'Quantità misurata × fattore di emissione' },
  { key: 'tier3', label: 'Dato primario diretto (Tier 3)', desc: 'Emissioni misurate direttamente o da fornitore' },
  { key: 'tier1', label: 'Stima monetaria (Tier 1)', desc: 'Spesa in € × fattore spend-based' },
]

const DATA_SOURCES = ['Fattura', 'Stima interna', 'Dichiarazione fornitore', 'Benchmark settore', 'Database pubblico', 'Altro']

const GRANULARITY_OPTIONS = [
  { v: 'annual', l: 'Annuale' },
  { v: 'monthly', l: 'Mensile' },
  { v: 'event', l: 'Evento singolo' },
]

// ─── Helpers ────────────────────────────────────────────────────────────────
function fmtCo2(kg) {
  if (!kg || isNaN(kg)) return '—'
  if (kg >= 1000) return `${(kg / 1000).toLocaleString('it-IT', { maximumFractionDigits: 3 })} tCO₂e`
  return `${kg.toLocaleString('it-IT', { maximumFractionDigits: 2 })} kgCO₂e`
}

function fmtNum(n) {
  if (n == null || isNaN(n)) return '—'
  return n.toLocaleString('it-IT', { maximumFractionDigits: n >= 1 ? 4 : 6 })
}

// ─── Empty row template ─────────────────────────────────────────────────────
function emptyRow(unitHint) {
  return { id: null, tier: 'tier2', quantity: '', unit: unitHint || 'kg', feId: null, feObj: null, dataSource: '', estimated: false, granularity: 'annual', note: '', eventDate: '' }
}

// ─── FE Search Dropdown ─────────────────────────────────────────────────────
function FeSelector({ subcategoryId, value, onChange }) {
  const [search, setSearch] = useState('')
  const [results, setResults] = useState([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const timer = useRef(null)

  async function doSearch(q) {
    setLoading(true)
    let query = supabase.from('emission_factors').select('id,substance,fe_co2eq,unit_input,source,notes,category').limit(20)
    if (q.length >= 2) {
      query = query.or(`substance.ilike.%${q}%,notes.ilike.%${q}%`)
    }
    query = query.order('is_default', { ascending: false }).order('fe_co2eq', { ascending: true })
    const { data } = await query
    setResults(data || [])
    setLoading(false)
  }

  // Load suggested FEs on mount
  useEffect(() => {
    const hints = FE_HINTS[subcategoryId] || []
    if (hints.length > 0) {
      supabase.from('emission_factors').select('id,substance,fe_co2eq,unit_input,source,notes,category')
        .in('substance', hints).then(({ data }) => { if (data) setResults(data) })
    } else {
      doSearch('')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subcategoryId])

  function handleSearch(q) {
    setSearch(q)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => doSearch(q), 300)
  }

  function handleSelect(fe) {
    onChange(fe)
    setOpen(false)
    setSearch('')
  }

  return (
    <div style={{ position: 'relative' }}>
      {/* Selected display */}
      <div
        onClick={() => setOpen(!open)}
        style={{
          padding: '8px 10px', border: '1px solid #E2EAE8', borderRadius: 6, cursor: 'pointer',
          fontSize: 12, color: value ? '#1C2B28' : '#999', background: '#fff', minHeight: 36,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}
      >
        {value ? (
          <span><b>{fmtNum(value.fe_co2eq)}</b> kgCO₂e/{value.unit_input} — {value.substance?.replace(/_defra/g, '').replace(/_/g, ' ')} <span style={{ color: '#999' }}>({value.source})</span></span>
        ) : (
          <span>Seleziona fattore di emissione...</span>
        )}
        <span style={{ fontSize: 10, color: '#999' }}>▼</span>
      </div>

      {/* Dropdown */}
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
          background: '#fff', border: '1px solid #E2EAE8', borderRadius: 8,
          boxShadow: '0 4px 16px rgba(0,0,0,0.1)', maxHeight: 320, overflow: 'hidden',
        }}>
          <div style={{ padding: 8 }}>
            <input
              type="text" placeholder="Cerca fattore (es. diesel, plastica, hotel...)"
              value={search} onChange={e => handleSearch(e.target.value)} autoFocus
              style={{ width: '100%', fontSize: 13, padding: '8px 10px', border: '1px solid #E2EAE8', borderRadius: 6, boxSizing: 'border-box' }}
            />
          </div>
          <div style={{ maxHeight: 260, overflowY: 'auto' }}>
            {loading && <div style={{ padding: 12, color: '#999', fontSize: 12 }}>Ricerca...</div>}
            {results.map(fe => (
              <div
                key={fe.id}
                onClick={() => handleSelect(fe)}
                style={{
                  padding: '8px 12px', cursor: 'pointer', borderBottom: '0.5px solid #f0f0f0',
                  background: value?.id === fe.id ? '#f0fdf4' : 'transparent',
                  fontSize: 12,
                }}
                onMouseOver={e => e.currentTarget.style.background = '#F4F8F7'}
                onMouseOut={e => e.currentTarget.style.background = value?.id === fe.id ? '#f0fdf4' : 'transparent'}
              >
                <div style={{ fontWeight: 500, color: '#1C2B28' }}>
                  {fe.substance?.replace(/_defra|_ademe|_agribalyse/g, '').replace(/_/g, ' ')}
                </div>
                <div style={{ color: '#666', marginTop: 2 }}>
                  <b>{fmtNum(fe.fe_co2eq)}</b> kgCO₂e/{fe.unit_input}
                  <span style={{ marginLeft: 8, color: '#999' }}>{fe.source}</span>
                  {fe.notes && <span style={{ marginLeft: 8, color: '#bbb' }}>{fe.notes.substring(0, 60)}</span>}
                </div>
              </div>
            ))}
            {!loading && results.length === 0 && (
              <div style={{ padding: 16, color: '#999', fontSize: 12, textAlign: 'center' }}>Nessun fattore trovato</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Entry Row ──────────────────────────────────────────────────────────────
function EntryRow({ row, index, subcategoryId, onUpdate, onRemove, showRemove }) {
  const qty = parseFloat(row.quantity) || 0
  const feVal = row.feObj?.fe_co2eq || 0
  const co2e = qty * feVal

  return (
    <div style={{ background: '#fff', border: '0.5px solid #E2EAE8', borderRadius: 10, padding: '16px 20px', marginBottom: 12 }}>
      {/* Row header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#1C2B28' }}>Voce {index + 1}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {co2e > 0 && <span style={{ fontSize: 14, fontWeight: 700, color: '#27AE60' }}>{fmtCo2(co2e)}</span>}
          {showRemove && (
            <button onClick={onRemove} style={{ fontSize: 11, color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer' }}>✕ Rimuovi</button>
          )}
        </div>
      </div>

      {/* Tier selection */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        {TIER_OPTIONS.map(t => (
          <label key={t.key} style={{
            flex: 1, display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 6, cursor: 'pointer',
            border: row.tier === t.key ? '1.5px solid #27AE60' : '1px solid #E2EAE8',
            background: row.tier === t.key ? '#f0fdf4' : '#fff',
            fontSize: 11,
          }}>
            <input type="radio" checked={row.tier === t.key} onChange={() => onUpdate({ tier: t.key })} style={{ margin: 0 }} />
            <span style={{ fontWeight: 500, color: '#1C2B28' }}>{t.label.split('(')[0].trim()}</span>
          </label>
        ))}
      </div>

      {/* Quantity + Unit */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
        <div style={{ flex: 2 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: '#555', display: 'block', marginBottom: 3 }}>
            {row.tier === 'tier1' ? 'Importo (€)' : 'Quantità'}
          </label>
          <input
            type="number" min="0" step="any" placeholder="0"
            value={row.quantity}
            onChange={e => onUpdate({ quantity: e.target.value })}
            style={{ width: '100%', fontSize: 14, padding: '8px 10px', border: '1px solid #E2EAE8', borderRadius: 6, boxSizing: 'border-box', color: '#1C2B28' }}
          />
        </div>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: '#555', display: 'block', marginBottom: 3 }}>Unità</label>
          <input
            type="text"
            value={row.tier === 'tier1' ? '€' : row.unit}
            onChange={e => onUpdate({ unit: e.target.value })}
            readOnly={row.tier === 'tier1'}
            style={{ width: '100%', fontSize: 14, padding: '8px 10px', border: '1px solid #E2EAE8', borderRadius: 6, boxSizing: 'border-box', color: '#1C2B28', background: row.tier === 'tier1' ? '#f9fafb' : '#fff' }}
          />
        </div>
      </div>

      {/* FE selector */}
      {row.tier !== 'tier3' && (
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: '#555', display: 'block', marginBottom: 3 }}>Fattore di emissione</label>
          <FeSelector
            subcategoryId={subcategoryId}
            value={row.feObj}
            onChange={fe => onUpdate({ feId: fe.id, feObj: fe })}
          />
        </div>
      )}

      {/* Tier 3: direct CO2e input */}
      {row.tier === 'tier3' && (
        <div style={{ marginBottom: 12, background: '#fffbeb', border: '0.5px solid #f59e0b30', borderRadius: 6, padding: '8px 12px', fontSize: 12, color: '#92400e' }}>
          Per Tier 3, inserisci direttamente i kgCO₂e nella quantità. Il dato verrà salvato come emissione diretta.
        </div>
      )}

      {/* Metadata row */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 8 }}>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: '#555', display: 'block', marginBottom: 3 }}>Fonte dato</label>
          <select
            value={row.dataSource}
            onChange={e => onUpdate({ dataSource: e.target.value })}
            style={{ width: '100%', fontSize: 12, padding: '6px 8px', border: '1px solid #E2EAE8', borderRadius: 6, color: '#1C2B28', background: '#fff' }}
          >
            <option value="">— Seleziona —</option>
            {DATA_SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: '#555', display: 'block', marginBottom: 3 }}>Granularità</label>
          <select
            value={row.granularity}
            onChange={e => onUpdate({ granularity: e.target.value })}
            style={{ width: '100%', fontSize: 12, padding: '6px 8px', border: '1px solid #E2EAE8', borderRadius: 6, color: '#1C2B28', background: '#fff' }}
          >
            {GRANULARITY_OPTIONS.map(g => <option key={g.v} value={g.v}>{g.l}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 2 }}>
          <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', color: '#666' }}>
            <input type="checkbox" checked={row.estimated} onChange={e => onUpdate({ estimated: e.target.checked })} />
            Stimato
          </label>
        </div>
      </div>

      <input
        type="text" placeholder="Note (facoltativo)"
        value={row.note}
        onChange={e => onUpdate({ note: e.target.value })}
        style={{ width: '100%', fontSize: 11, padding: '6px 8px', border: '0.5px solid #E2EAE8', borderRadius: 6, color: '#888', boxSizing: 'border-box' }}
      />
    </div>
  )
}

// ─── Main component ─────────────────────────────────────────────────────────
export default function Scope3DataEntry({ reportId, companyId, subcategoryId, periodId: periodIdProp }) {
  const [subcategory, setSubcategory] = useState(null)
  const [screening, setScreening] = useState(null)
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState(null)
  const [periodId, setPeriodId] = useState(periodIdProp || null)

  // Load subcategory info, screening, existing entries, and auto-resolve period
  useEffect(() => {
    async function load() {
      // Auto-resolve period_id if not passed
      if (!periodIdProp && companyId) {
        const { data: latestPeriod } = await supabase.from('ghg_periods')
          .select('id')
          .eq('company_id', companyId)
          .in('status', ['closed', 'complete'])
          .order('year', { ascending: false })
          .order('month', { ascending: false, nullsFirst: true })
          .limit(1)
          .maybeSingle()
        if (latestPeriod) setPeriodId(latestPeriod.id)
      }

      // Subcategory
      const { data: sub } = await supabase.from('scope3_subcategories').select('*').eq('id', subcategoryId).single()
      setSubcategory(sub)

      // Screening classification
      const { data: scr } = await supabase.from('scope3_screening').select('*')
        .eq('report_id', reportId).eq('subcategory_id', subcategoryId).maybeSingle()
      setScreening(scr)

      // Existing entries
      const { data: entries } = await supabase.from('scope3_entries').select('*')
        .eq('report_id', reportId).eq('subcategory_id', subcategoryId)
      if (entries && entries.length > 0) {
        // Load FE objects for existing entries
        const feIds = entries.map(e => e.fe_id).filter(Boolean)
        let feMap = {}
        if (feIds.length > 0) {
          const { data: fes } = await supabase.from('emission_factors').select('id,substance,fe_co2eq,unit_input,source,notes').in('id', feIds)
          if (fes) fes.forEach(f => { feMap[f.id] = f })
        }
        setRows(entries.map(e => ({
          id: e.id,
          tier: e.fe_id ? 'tier2' : 'tier3',
          quantity: String(e.activity_value ?? ''),
          unit: e.activity_unit || sub?.unit_hint || 'kg',
          feId: e.fe_id,
          feObj: feMap[e.fe_id] || null,
          dataSource: '',
          estimated: e.estimated || false,
          granularity: e.granularity || 'annual',
          note: e.note || '',
          eventDate: e.event_date || '',
        })))
      } else {
        setRows([emptyRow(sub?.unit_hint)])
      }
      setLoading(false)
    }
    load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportId, subcategoryId])

  function updateRow(idx, patch) {
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, ...patch } : r))
  }

  function addRow() {
    setRows(prev => [...prev, emptyRow(subcategory?.unit_hint)])
  }

  function removeRow(idx) {
    setRows(prev => prev.filter((_, i) => i !== idx))
  }

  // Calculate total
  const totalCo2e = rows.reduce((sum, r) => {
    const qty = parseFloat(r.quantity) || 0
    if (r.tier === 'tier3') return sum + qty // direct kgCO2e
    return sum + qty * (r.feObj?.fe_co2eq || 0)
  }, 0)

  // Save
  async function handleSave() {
    setSaving(true)
    setSaveMsg(null)

    // Delete existing entries for this report+subcategory
    await supabase.from('scope3_entries').delete()
      .eq('report_id', reportId).eq('subcategory_id', subcategoryId)

    const inserts = []
    for (const r of rows) {
      const qty = parseFloat(r.quantity) || 0
      if (qty <= 0) continue
      const co2e = r.tier === 'tier3' ? qty : qty * (r.feObj?.fe_co2eq || 0)

      inserts.push({
        report_id: reportId,
        subcategory_id: subcategoryId,
        period_id: periodId || null,
        activity_value: qty,
        activity_unit: r.tier === 'tier1' ? '€' : r.unit,
        fe_id: r.tier !== 'tier3' ? r.feId : null,
        fe_value: r.tier !== 'tier3' ? r.feObj?.fe_co2eq : null,
        co2e_kg: co2e,
        granularity: r.granularity,
        estimated: r.estimated,
        event_date: r.eventDate || null,
        note: [r.dataSource, r.note].filter(Boolean).join(' — ') || null,
      })
    }

    if (inserts.length > 0) {
      const { error } = await supabase.from('scope3_entries').insert(inserts)
      if (error) {
        console.error('Save error:', error)
        setSaveMsg({ type: 'err', text: 'Errore: ' + error.message })
        setSaving(false)
        return
      }
    }

    setSaveMsg({ type: 'ok', text: `Salvato: ${inserts.length} voci, ${fmtCo2(totalCo2e)}` })
    setSaving(false)
  }

  if (loading) return <div style={{ padding: 40, color: '#999' }}>Caricamento...</div>

  const classLabel = screening?.classification
  const classColors = {
    significant: { color: '#16a34a', bg: '#f0fdf4', label: 'Significativa' },
    to_verify: { color: '#d97706', bg: '#fffbeb', label: 'Da verificare' },
    not_significant: { color: '#6b7280', bg: '#f9fafb', label: 'Non significativa' },
    excluded_na: { color: '#9ca3af', bg: '#f9fafb', label: 'N/A' },
  }
  const cls = classColors[classLabel] || classColors.significant

  const backUrl = `/clients/${companyId}/ghg/${reportId}/scope3`

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: 24, fontFamily: 'Arial, sans-serif' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <a href={backUrl} style={{ fontSize: 13, color: '#2563eb', textDecoration: 'none' }}>← Torna allo Scope 3</a>
        <span style={{ fontSize: 11, fontWeight: 500, padding: '3px 10px', borderRadius: 4, background: cls.bg, color: cls.color, border: `0.5px solid ${cls.color}30` }}>
          {cls.label}
        </span>
      </div>
      <h1 style={{ fontSize: 18, fontWeight: 600, color: '#1C2B28', margin: '0 0 4px' }}>
        {subcategory?.category_num}.{subcategory?.sub_num} — {subcategory?.label}
      </h1>
      <p style={{ fontSize: 12, color: '#6b7280', margin: '0 0 20px' }}>{subcategory?.description}</p>

      {/* Entry rows */}
      {rows.map((row, i) => (
        <EntryRow
          key={i} row={row} index={i}
          subcategoryId={subcategoryId}
          onUpdate={patch => updateRow(i, patch)}
          onRemove={() => removeRow(i)}
          showRemove={rows.length > 1}
        />
      ))}

      {/* Add row + total */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <button
          onClick={addRow}
          style={{ fontSize: 13, color: '#2563eb', background: 'none', border: '1px dashed #2563eb60', borderRadius: 6, padding: '6px 14px', cursor: 'pointer' }}
        >+ Aggiungi voce</button>
        <div style={{ fontSize: 16, fontWeight: 700, color: totalCo2e > 0 ? '#1C2B28' : '#ccc' }}>
          Totale: {fmtCo2(totalCo2e)}
        </div>
      </div>

      {/* Save feedback */}
      {saveMsg && (
        <div style={{
          padding: '10px 16px', borderRadius: 8, marginBottom: 12, fontSize: 13, fontWeight: 500, textAlign: 'center',
          background: saveMsg.type === 'ok' ? '#f0fdf4' : '#fef2f2',
          color: saveMsg.type === 'ok' ? '#15803d' : '#dc2626',
        }}>
          {saveMsg.type === 'ok' ? '✓ ' : ''}{saveMsg.text}
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <a href={backUrl} style={{ fontSize: 14, padding: '10px 24px', borderRadius: 8, border: '1px solid #E2EAE8', background: '#fff', color: '#1C2B28', textDecoration: 'none' }}>← Indietro</a>
        <button
          disabled={saving}
          onClick={handleSave}
          style={{ fontSize: 14, fontWeight: 600, padding: '10px 24px', borderRadius: 8, border: 'none', cursor: 'pointer', background: '#27AE60', color: '#fff', opacity: saving ? 0.5 : 1 }}
        >{saving ? 'Salvataggio...' : 'Salva dati'}</button>
      </div>
    </div>
  )
}
