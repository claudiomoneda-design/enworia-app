'use client'
import { useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'

// ── FE mapping: tipo_energia → substance in emission_factors ────────────────
const FE_MAP = {
  elettricita: { substance: 'ispra_elec_it_2023', unit: 'kWh', scope: 2, category: 'elettricita', feSource: 'ISPRA 2023' },
  gas:         { substance: 'natural_gas_defra_cubic_metres', unit: 'Sm³', scope: 1, category: 'gas_naturale', feSource: 'DEFRA 2025' },
  teleriscaldamento: { substance: 'heat_district_defra', unit: 'kWh', scope: 2, category: 'calore', feSource: 'DEFRA 2025' },
}

function fmtCo2(kg) {
  if (!kg || isNaN(kg)) return '—'
  if (kg >= 1000) return `${(kg / 1000).toLocaleString('it-IT', { maximumFractionDigits: 3 })} tCO₂e`
  return `${kg.toLocaleString('it-IT', { maximumFractionDigits: 2 })} kgCO₂e`
}

function confBadge(c) {
  if (c >= 0.85) return { label: 'Alta', color: '#16a34a', bg: '#f0fdf4' }
  if (c >= 0.60) return { label: 'Media', color: '#d97706', bg: '#fffbeb' }
  return { label: 'Bassa', color: '#dc2626', bg: '#fef2f2' }
}

export default function UploadBolletta({ companyId, periodId, onApproved }) {
  const [stage, setStage] = useState('idle') // idle | uploading | review | saving | done | error
  const [result, setResult] = useState(null)
  const [fields, setFields] = useState(null)
  const [error, setError] = useState(null)
  const [feData, setFeData] = useState(null) // { fe_co2eq, id }
  const fileRef = useRef(null)

  // ── Upload & parse ──
  async function handleFile(file) {
    if (!file) return
    setStage('uploading')
    setError(null)

    try {
      // Convert to base64
      const base64 = await new Promise((res, rej) => {
        const r = new FileReader()
        r.onload = () => res(r.result.split(',')[1])
        r.onerror = rej
        r.readAsDataURL(file)
      })

      const isPdf = file.type === 'application/pdf' || file.name.endsWith('.pdf')
      const isCsv = file.type === 'text/csv' || file.name.endsWith('.csv')

      let resp
      if (isPdf) {
        resp = await fetch('/api/ingestion/parse-bolletta', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pdf_base64: base64, filename: file.name }),
        })
      } else if (isCsv) {
        const text = atob(base64)
        resp = await fetch('/api/ingestion/parse-portale-csv', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ csv_text: text, filename: file.name }),
        })
      } else {
        // Try vision for images
        resp = await fetch('/api/ingestion/parse-vision', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image_base64: base64, media_type: file.type, filename: file.name }),
        })
      }

      const data = await resp.json()
      if (!data.ok && !data.fields && !data.letture) {
        setError(data.error || 'Parsing fallito')
        setStage('error')
        return
      }

      // For CSV: convert to fields format
      if (isCsv && data.letture) {
        const tipo = data.tipo_energia
        const f = {
          tipo_energia: { value: tipo, confidence: 0.90 },
          periodo: { value: null, confidence: 0 },
          consumo_kwh: { value: tipo === 'elettricita' ? data.totale : null, unita: 'kWh', confidence: 0.85 },
          consumo_m3: { value: tipo === 'gas' ? data.totale : null, unita: 'm3', confidence: 0.85 },
          importo_eur: { value: null, confidence: 0 },
          pod_pdr: { value: data.letture[0]?.pod, confidence: 0.80 },
          fornitore: { value: null, confidence: 0 },
        }
        setResult({ ...data, fields: f })
        setFields(f)
      } else {
        setResult(data)
        setFields(data.fields)
      }

      // Load FE for the detected energy type
      const tipo = (data.fields || {}).tipo_energia?.value || 'elettricita'
      const mapping = FE_MAP[tipo]
      if (mapping) {
        const { data: feRow } = await supabase.from('emission_factors')
          .select('id,fe_co2eq').eq('substance', mapping.substance).limit(1).maybeSingle()
        setFeData(feRow)
      }

      setStage('review')
    } catch (err) {
      console.error('[upload]', err)
      setError(err.message)
      setStage('error')
    }
  }

  // ── Field edit ──
  function updateField(key, value) {
    setFields(prev => ({ ...prev, [key]: { ...prev[key], value, corrected: true } }))
  }

  // ── Approve & save ──
  async function handleApprove() {
    if (!fields || !periodId) return
    setStage('saving')

    const tipo = fields.tipo_energia?.value || 'elettricita'
    const mapping = FE_MAP[tipo] || FE_MAP.elettricita
    const consumo = tipo === 'gas' ? fields.consumo_m3?.value : fields.consumo_kwh?.value
    const fe = feData?.fe_co2eq || 0
    const co2e = (consumo || 0) * fe

    // Save energy_entry
    const entry = {
      period_id: periodId,
      scope: mapping.scope,
      source_category: mapping.category,
      source_label: fields.pod_pdr?.value || (fields.fornitore?.display || fields.fornitore?.value || 'Bolletta'),
      quantity: consumo || 0,
      unit: mapping.unit,
      fe_id: feData?.id || null,
      fe_value: fe,
      fe_unit: `kgCO2e/${mapping.unit}`,
      fe_source: mapping.feSource,
      co2e_kg: co2e,
      data_quality: 'bolletta',
      data_source: 'upload bolletta',
      estimated: false,
      notes: `Importato da ${result?.filename || 'bolletta'}`,
    }

    const { error: insertErr } = await supabase.from('energy_entries').insert([entry])
    if (insertErr) {
      setError(insertErr.message)
      setStage('error')
      return
    }

    // Log ingestion
    await supabase.from('ingestion_log').insert([{
      company_id: companyId,
      period_id: periodId,
      filename: result?.filename || 'bolletta',
      file_type: tipo === 'gas' ? 'gas' : 'elettricita',
      status: 'approved',
      parsed_fields: fields,
      confidence_avg: result?.confidence_avg || 0,
    }]).catch(() => {}) // non-blocking

    setStage('done')
    onApproved?.({ tipo, consumo, co2e, entry })
  }

  // ── Render ──
  const tipo = fields?.tipo_energia?.value || 'elettricita'
  const consumo = tipo === 'gas' ? fields?.consumo_m3?.value : fields?.consumo_kwh?.value
  const fe = feData?.fe_co2eq || 0
  const co2e = (consumo || 0) * fe

  return (
    <div style={{ background: '#fff', border: '0.5px solid #E2EAE8', borderRadius: 10, padding: '16px 20px', marginBottom: 16 }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: '#1C2B28', marginBottom: 10 }}>
        Importa da bolletta
      </div>

      {/* ── Idle: upload zone ── */}
      {stage === 'idle' && (
        <div
          onClick={() => fileRef.current?.click()}
          style={{
            border: '2px dashed #E2EAE8', borderRadius: 8, padding: '24px 16px', textAlign: 'center',
            cursor: 'pointer', transition: 'border-color 0.15s',
          }}
          onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor = '#27AE60' }}
          onDragLeave={e => { e.currentTarget.style.borderColor = '#E2EAE8' }}
          onDrop={e => { e.preventDefault(); e.currentTarget.style.borderColor = '#E2EAE8'; handleFile(e.dataTransfer.files[0]) }}
        >
          <div style={{ fontSize: 24, marginBottom: 6 }}>📄</div>
          <div style={{ fontSize: 13, color: '#666' }}>Trascina bolletta PDF/CSV o clicca per caricare</div>
          <div style={{ fontSize: 11, color: '#999', marginTop: 4 }}>Supporta: Enel, ENI, A2A, Iren, Edison</div>
          <input ref={fileRef} type="file" accept=".pdf,.csv,.jpg,.jpeg,.png" hidden onChange={e => handleFile(e.target.files?.[0])} />
        </div>
      )}

      {/* ── Uploading ── */}
      {stage === 'uploading' && (
        <div style={{ padding: 20, textAlign: 'center', color: '#999' }}>
          <div style={{ fontSize: 14, marginBottom: 4 }}>Analisi in corso...</div>
          <div style={{ fontSize: 11 }}>Estrazione dati dalla bolletta</div>
        </div>
      )}

      {/* ── Review ── */}
      {stage === 'review' && fields && (
        <div>
          {/* Confidence bar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <span style={{ fontSize: 12, color: '#666' }}>Affidabilità:</span>
            {(() => { const b = confBadge(result?.confidence_avg || 0); return (
              <span style={{ fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 4, background: b.bg, color: b.color }}>{b.label} ({Math.round((result?.confidence_avg || 0) * 100)}%)</span>
            )})()}
          </div>

          {/* Editable fields */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
            <FieldRow label="Tipo energia" value={fields.tipo_energia?.value || ''} onChange={v => updateField('tipo_energia', v)}
              options={['elettricita', 'gas', 'teleriscaldamento']} />
            <FieldRow label="Fornitore" value={fields.fornitore?.value || fields.fornitore?.display || ''} onChange={v => updateField('fornitore', v)} />
            <FieldRow label="Periodo" value={fields.periodo?.value ? `${fields.periodo.value.mese}/${fields.periodo.value.anno}` : ''} readOnly />
            <FieldRow label="POD/PDR" value={fields.pod_pdr?.value || ''} onChange={v => updateField('pod_pdr', v)} />
            <FieldRow label="Consumo kWh" value={fields.consumo_kwh?.value ?? ''} onChange={v => updateField('consumo_kwh', parseFloat(v) || null)} type="number" />
            <FieldRow label="Consumo m³" value={fields.consumo_m3?.value ?? ''} onChange={v => updateField('consumo_m3', parseFloat(v) || null)} type="number" />
          </div>

          {/* CO2e preview */}
          <div style={{ background: '#F4F8F7', borderRadius: 6, padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <span style={{ fontSize: 12, color: '#666' }}>
              {consumo ? `${consumo.toLocaleString('it-IT')} ${tipo === 'gas' ? 'm³' : 'kWh'} × ${fe} =` : 'Nessun consumo rilevato'}
            </span>
            <span style={{ fontSize: 16, fontWeight: 700, color: co2e > 0 ? '#15803d' : '#ccc' }}>{fmtCo2(co2e)}</span>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button onClick={() => { setStage('idle'); setFields(null); setResult(null) }}
              style={{ fontSize: 13, padding: '8px 16px', borderRadius: 6, border: '1px solid #E2EAE8', background: '#fff', color: '#666', cursor: 'pointer' }}>
              Annulla
            </button>
            <button onClick={handleApprove} disabled={!consumo || consumo <= 0}
              style={{ fontSize: 13, fontWeight: 600, padding: '8px 20px', borderRadius: 6, border: 'none', background: consumo > 0 ? '#27AE60' : '#ccc', color: '#fff', cursor: consumo > 0 ? 'pointer' : 'default' }}>
              Approva e salva
            </button>
          </div>
        </div>
      )}

      {/* ── Saving ── */}
      {stage === 'saving' && <div style={{ padding: 16, textAlign: 'center', color: '#999' }}>Salvataggio...</div>}

      {/* ── Done ── */}
      {stage === 'done' && (
        <div style={{ padding: 12, textAlign: 'center' }}>
          <div style={{ fontSize: 14, color: '#15803d', fontWeight: 500, marginBottom: 6 }}>✓ Dati importati con successo</div>
          <div style={{ fontSize: 12, color: '#666' }}>{fmtCo2(co2e)} aggiunti al periodo</div>
          <button onClick={() => { setStage('idle'); setFields(null); setResult(null) }}
            style={{ marginTop: 8, fontSize: 12, color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer' }}>
            Carica un'altra bolletta
          </button>
        </div>
      )}

      {/* ── Error ── */}
      {stage === 'error' && (
        <div style={{ padding: 12, textAlign: 'center' }}>
          <div style={{ fontSize: 13, color: '#dc2626', marginBottom: 6 }}>Errore: {error}</div>
          <button onClick={() => { setStage('idle'); setError(null) }}
            style={{ fontSize: 12, color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer' }}>
            Riprova
          </button>
        </div>
      )}
    </div>
  )
}

// ── FieldRow helper ──
function FieldRow({ label, value, onChange, type, readOnly, options }) {
  return (
    <div>
      <label style={{ fontSize: 10, fontWeight: 600, color: '#999', display: 'block', marginBottom: 2 }}>{label}</label>
      {options ? (
        <select value={value} onChange={e => onChange(e.target.value)} style={{ width: '100%', fontSize: 12, padding: '6px 8px', border: '1px solid #E2EAE8', borderRadius: 4, background: '#fff' }}>
          {options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : (
        <input
          type={type || 'text'} value={value ?? ''}
          onChange={e => onChange?.(e.target.value)}
          readOnly={readOnly}
          style={{ width: '100%', fontSize: 12, padding: '6px 8px', border: '1px solid #E2EAE8', borderRadius: 4, boxSizing: 'border-box', background: readOnly ? '#f9fafb' : '#fff', color: '#1C2B28' }}
        />
      )}
    </div>
  )
}
