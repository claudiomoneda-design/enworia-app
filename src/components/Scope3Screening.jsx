// components/Scope3Screening.jsx
// Screening significatività ISO 14064-1:2019 §5.2.3

'use client'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'

// ------------------------------------------------------------------
// Etichette UI — scala A(1-3) B(0-2) C(0-2) → totale 1-7
// ------------------------------------------------------------------
const SCORE_LABELS = {
  magnitude: {
    label: 'A — Magnitudine stimata',
    hint: 'Entità stimata delle emissioni rispetto al totale inventario',
    options: [
      { v: 3, text: 'Alta', sub: '> 10% del totale stimato' },
      { v: 2, text: 'Media', sub: '1–10% stimato' },
      { v: 1, text: 'Bassa', sub: '< 1% del totale stimato' },
    ]
  },
  data_avail: {
    label: 'B — Influenza e rilevanza',
    hint: 'Capacità dell\'organizzazione di monitorare o ridurre la sorgente',
    options: [
      { v: 2, text: 'Diretta', sub: 'Controllo diretto o supply chain critica' },
      { v: 1, text: 'Indiretta', sub: 'Influenza indiretta possibile' },
      { v: 0, text: 'Nessuna', sub: 'Nessuna influenza possibile' },
    ]
  },
  relevance: {
    label: 'C — Fattibilità quantificazione',
    hint: 'Disponibilità di dati primari o stime ragionevoli con FE riconosciuti',
    options: [
      { v: 2, text: 'Disponibili', sub: 'Dati primari disponibili (fatture, DDT, contatori)' },
      { v: 1, text: 'Stimabile', sub: 'Stima ragionevole con FE secondari' },
      { v: 0, text: 'Impossibile', sub: 'Dati strutturalmente non ottenibili' },
    ]
  }
}

const CLASSIFICATION_CONFIG = {
  significant:     { label: 'Significativa',      color: '#16a34a', bg: '#f0fdf4' },
  to_verify:       { label: 'Da verificare',      color: '#d97706', bg: '#fffbeb' },
  not_significant: { label: 'Non significativa',   color: '#6b7280', bg: '#f9fafb' },
  excluded_na:     { label: 'Non applicabile',     color: '#9ca3af', bg: '#f9fafb' },
}

const CAT_LABELS = {
  2: 'Categoria 2 — Energia importata',
  3: 'Categoria 3 — Trasporti',
  4: 'Categoria 4 — Prodotti usati',
  5: 'Categoria 5 — Uso prodotti (valle)',
  6: 'Categoria 6 — Altre fonti',
}

// Fallback reasons if table doesn't exist yet
const FALLBACK_REASONS = [
  { id: 1, text: 'Attività non presente nell\'organizzazione', applies_to: ['excluded_na', 'not_significant'] },
  { id: 2, text: 'Emissioni stimate < 1% del totale inventario', applies_to: ['not_significant'] },
  { id: 3, text: 'Dati non disponibili e non stimabili con ragionevole accuratezza', applies_to: ['not_significant', 'to_verify'] },
  { id: 4, text: 'Inclusa in altra categoria (evitare doppia contabilizzazione)', applies_to: ['excluded_na', 'not_significant'] },
  { id: 5, text: 'Da approfondire nella prossima rendicontazione', applies_to: ['to_verify'] },
  { id: 6, text: 'Dati parziali disponibili — necessaria raccolta dati aggiuntiva', applies_to: ['to_verify'] },
]

// ------------------------------------------------------------------
// Classificazione: A(1-3) + B(0-2) + C(0-2) → totale 1-7
// ------------------------------------------------------------------
function autoClassify(mag, avail, rel) {
  if (mag === null || mag === undefined) return null
  if (avail === null || avail === undefined) return null
  if (rel === null || rel === undefined) return null
  if (mag === 3) {
    // Override magnitudine alta, ma C=0 forza to_verify
    return rel === 0 ? 'to_verify' : 'significant'
  }
  const total = mag + avail + rel
  let cls
  if (total >= 5) cls = 'significant'
  else if (total >= 3) cls = 'to_verify'
  else cls = 'not_significant'
  // C=0 e classificazione sarebbe significant → forza to_verify
  if (cls === 'significant' && rel === 0) cls = 'to_verify'
  return cls
}

function isScored(mag, avail, rel) {
  return mag !== null && mag !== undefined &&
         avail !== null && avail !== undefined &&
         rel !== null && rel !== undefined
}

// ------------------------------------------------------------------
// Componente singola riga sottocategoria (autosave)
// ------------------------------------------------------------------
function SubcategoryRow({ sub, screening, onUpdate, exclusionReasons }) {
  const s = screening || {}
  const [mag, setMag] = useState(s.score_magnitude ?? null)
  const [avail, setAvail] = useState(s.score_data_avail ?? null)
  const [rel, setRel] = useState(s.score_relevance ?? null)
  const [selectedReason, setSelectedReason] = useState(s.note_motivation || '')
  const [extraNote, setExtraNote] = useState(s.extra_note || '')
  const [excludedNa, setExcludedNa] = useState(s.classification === 'excluded_na')
  const [saveState, setSaveState] = useState('idle')
  const [expanded, setExpanded] = useState(false)
  const [decision, setDecision] = useState(
    s.override_manual && s.classification === 'significant' ? 'include'
    : s.override_manual && s.classification === 'not_significant' ? 'exclude'
    : null
  )
  const [decisionTime, setDecisionTime] = useState(s.override_manual ? s.updated_at : null)
  const noteTimer = useRef(null)

  const autoClass = excludedNa ? 'excluded_na' : autoClassify(mag, avail, rel)
  // If consultant made a decision on to_verify, use that; otherwise use auto
  const finalClass = s.override_manual ? (s.classification || autoClass) : autoClass
  const cfg = finalClass ? CLASSIFICATION_CONFIG[finalClass] : null
  const total = (mag ?? 0) + (avail ?? 0) + (rel ?? 0)
  const scored = excludedNa || isScored(mag, avail, rel)
  const isToVerify = autoClass === 'to_verify' && !s.override_manual
  const needsReason = finalClass && finalClass !== 'significant' && finalClass !== 'to_verify'

  // Filter reasons for current classification
  const filteredReasons = exclusionReasons.filter(r =>
    r.applies_to && r.applies_to.includes(finalClass)
  )
  const verifyReasons = exclusionReasons.filter(r =>
    r.applies_to && r.applies_to.includes('to_verify')
  )

  function buildNote(reason, extra) {
    return [reason, extra].filter(Boolean).join(' — ')
  }

  // Core save — supports override_manual
  async function doSave(m, a, r, na, reason, extra, overrideClass, manual) {
    const cls = overrideClass || (na ? 'excluded_na' : autoClassify(m, a, r))
    if (!na && !isScored(m, a, r)) return
    setSaveState('saving')
    await onUpdate(sub.id, {
      score_magnitude: na ? null : m,
      score_data_avail: na ? null : a,
      score_relevance: na ? null : r,
      classification: cls,
      note_motivation: buildNote(reason, extra),
      override_manual: manual || false,
    })
    setSaveState('saved')
    setTimeout(() => setSaveState('idle'), 2000)
  }

  function handleScore(key, value) {
    const newMag = key === 'magnitude' ? value : mag
    const newAvail = key === 'data_avail' ? value : avail
    const newRel = key === 'relevance' ? value : rel
    if (key === 'magnitude') setMag(value)
    if (key === 'data_avail') setAvail(value)
    if (key === 'relevance') setRel(value)
    // Reset decision if scores change
    setDecision(null); setDecisionTime(null)
    if (isScored(newMag, newAvail, newRel)) {
      doSave(newMag, newAvail, newRel, false, selectedReason, extraNote, null, false)
    }
  }

  function handleNa(checked) {
    setExcludedNa(checked)
    setDecision(null); setDecisionTime(null)
    if (checked) {
      setMag(null); setAvail(null); setRel(null)
      doSave(null, null, null, true, selectedReason, extraNote, null, false)
    }
  }

  function handleReasonChange(value) {
    setSelectedReason(value)
    if (scored) doSave(mag, avail, rel, excludedNa, value, extraNote, null, false)
  }

  function handleExtraNote(value) {
    setExtraNote(value)
    if (noteTimer.current) clearTimeout(noteTimer.current)
    if (scored) {
      noteTimer.current = setTimeout(() => {
        doSave(mag, avail, rel, excludedNa, selectedReason, value, null, decision ? true : false)
      }, 1000)
    }
  }

  // Consultant decisions for to_verify
  function handleInclude() {
    setDecision('include')
    setDecisionTime(new Date().toISOString())
    doSave(mag, avail, rel, false, selectedReason, extraNote, 'significant', true)
  }

  function handleExclude() {
    setDecision('exclude')
    setDecisionTime(new Date().toISOString())
    // Don't save yet — wait for reason selection
  }

  function handleExcludeReason(value) {
    setSelectedReason(value)
    doSave(mag, avail, rel, false, value, extraNote, 'not_significant', true)
  }

  function handleExcludeNote(value) {
    setExtraNote(value)
    if (noteTimer.current) clearTimeout(noteTimer.current)
    if (selectedReason) {
      noteTimer.current = setTimeout(() => {
        doSave(mag, avail, rel, false, selectedReason, value, 'not_significant', true)
      }, 1000)
    }
  }

  // Format decision timestamp
  const decisionLabel = decisionTime
    ? `Deciso il ${new Date(decisionTime).toLocaleDateString('it-IT')} alle ${new Date(decisionTime).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}`
    : null

  return (
    <div style={{
      border: `0.5px solid ${cfg ? cfg.color + '40' : '#e5e7eb'}`,
      borderLeft: `3px solid ${cfg ? cfg.color : '#e5e7eb'}`,
      borderRadius: 8,
      marginBottom: 8,
      background: cfg ? cfg.bg : 'transparent',
      transition: 'all 0.2s',
    }}>
      {/* Header */}
      <div
        onClick={() => setExpanded(e => !e)}
        style={{ display: 'flex', alignItems: 'center', padding: '10px 14px', cursor: 'pointer', gap: 10 }}
      >
        <span style={{ fontSize: 13, fontWeight: 500, flex: 1, color: '#1A1A1A' }}>
          {sub.category_num}.{sub.sub_num} — {sub.label}
        </span>
        {sub.typical_sme && (
          <span style={{ fontSize: 10, background: '#dbeafe', color: '#1d4ed8', padding: '2px 6px', borderRadius: 4, fontWeight: 500 }}>PMI tipica</span>
        )}
        {scored && cfg && (
          <span style={{ fontSize: 11, background: cfg.bg, color: cfg.color, padding: '2px 8px', borderRadius: 4, fontWeight: 500, border: `0.5px solid ${cfg.color}40` }}>
            {cfg.label} {total > 0 && !excludedNa ? `(${total}/7)` : ''}
          </span>
        )}
        {saveState === 'saving' && <span style={{ fontSize: 10, color: '#999' }}>...</span>}
        {saveState === 'saved' && <span style={{ fontSize: 10, color: '#16a34a' }}>✓ Salvato</span>}
        <span style={{ fontSize: 12, color: '#999' }}>{expanded ? '▲' : '▼'}</span>
      </div>

      {/* Body */}
      {expanded && (
        <div style={{ padding: '0 14px 14px', borderTop: '0.5px solid #e5e7eb' }}>
          <p style={{ fontSize: 12, color: '#666', margin: '10px 0', lineHeight: 1.5 }}>{sub.description}</p>
          {sub.double_count_warning && (
            <div style={{ fontSize: 11, color: '#92400e', background: '#fef3c7', padding: '6px 10px', borderRadius: 6, marginBottom: 10 }}>
              ⚠ {sub.double_count_warning}
            </div>
          )}

          {/* N/A */}
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, cursor: 'pointer', fontSize: 13 }}>
            <input type="checkbox" checked={excludedNa} onChange={e => handleNa(e.target.checked)} />
            <span style={{ color: '#666' }}>Attività non presente — escludi come N/A</span>
          </label>

          {/* Scoring */}
          {!excludedNa && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
              {Object.entries(SCORE_LABELS).map(([key, scoreCfg]) => {
                const val = key === 'magnitude' ? mag : key === 'data_avail' ? avail : rel
                return (
                  <div key={key}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: '#555', marginBottom: 2 }}>{scoreCfg.label}</div>
                    <div style={{ fontSize: 10, color: '#999', marginBottom: 6 }}>{scoreCfg.hint}</div>
                    {scoreCfg.options.map(opt => (
                      <label key={opt.v} style={{
                        display: 'flex', alignItems: 'flex-start', gap: 6,
                        marginBottom: 4, cursor: 'pointer',
                        padding: '4px 6px', borderRadius: 6,
                        background: val === opt.v ? '#eff6ff' : 'transparent',
                        border: val === opt.v ? '0.5px solid #3b82f6' : '0.5px solid transparent',
                      }}>
                        <input
                          type="radio" name={`${sub.id}-${key}`} value={opt.v}
                          checked={val === opt.v} onChange={() => handleScore(key, opt.v)}
                          style={{ marginTop: 2 }}
                        />
                        <span>
                          <span style={{ fontSize: 12, fontWeight: 500, color: '#1A1A1A' }}>{opt.text}</span><br />
                          <span style={{ fontSize: 10, color: '#999' }}>{opt.sub}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                )
              })}
            </div>
          )}

          {/* Classification badge */}
          {scored && cfg && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '8px 12px', borderRadius: 6,
              background: cfg.bg, border: `0.5px solid ${cfg.color}40`,
              marginBottom: 10,
            }}>
              <span style={{ fontSize: 12, fontWeight: 500, color: cfg.color }}>
                {excludedNa ? '— Non applicabile' : `Punteggio ${total}/7 → ${cfg.label}`}
              </span>
              {!excludedNa && mag === 3 && (
                <span style={{ fontSize: 10, color: '#16a34a', background: '#f0fdf4', padding: '1px 6px', borderRadius: 3 }}>Override: A=3</span>
              )}
              {!excludedNa && rel === 0 && autoClassify(mag, avail, 1) === 'significant' && (
                <span style={{ fontSize: 10, color: '#d97706', background: '#fffbeb', padding: '1px 6px', borderRadius: 3 }}>C=0 → verifica</span>
              )}
              {saveState === 'saved' && <span style={{ fontSize: 10, color: '#16a34a', marginLeft: 'auto' }}>✓ Salvato</span>}
              {saveState === 'saving' && <span style={{ fontSize: 10, color: '#999', marginLeft: 'auto' }}>Salvataggio...</span>}
            </div>
          )}

          {/* ── DECISIONE CONSULENTE (solo per to_verify) ── */}
          {isToVerify && scored && (
            <div style={{ background: '#fffbeb', border: '1px solid #f59e0b40', borderRadius: 8, padding: '12px 14px', marginBottom: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#92400e', marginBottom: 10 }}>
                Decisione consulente richiesta
              </div>
              {!decision && (
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={handleInclude} style={{
                    fontSize: 12, fontWeight: 500, padding: '6px 14px', borderRadius: 6,
                    border: 'none', cursor: 'pointer', background: '#16a34a', color: '#fff',
                  }}>✓ Includi come significativa</button>
                  <button onClick={handleExclude} style={{
                    fontSize: 12, fontWeight: 500, padding: '6px 14px', borderRadius: 6,
                    border: '1px solid #d1d5db', cursor: 'pointer', background: '#f9fafb', color: '#374151',
                  }}>✗ Escludi</button>
                </div>
              )}

              {/* Include → facoltativa note */}
              {decision === 'include' && (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <span style={{ fontSize: 12, color: '#16a34a', fontWeight: 500 }}>✓ Inclusa come significativa</span>
                    {decisionLabel && <span style={{ fontSize: 10, color: '#999' }}>{decisionLabel}</span>}
                  </div>
                  <textarea
                    value={extraNote}
                    onChange={e => handleExtraNote(e.target.value)}
                    placeholder="Note motivazione (facoltativo)"
                    rows={1}
                    style={{
                      width: '100%', fontSize: 11, padding: '5px 8px',
                      border: '0.5px solid #e5e7eb', borderRadius: 6,
                      resize: 'vertical', boxSizing: 'border-box',
                      background: '#fff', color: '#666',
                    }}
                  />
                </div>
              )}

              {/* Exclude → obbligatoria reason */}
              {decision === 'exclude' && (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <span style={{ fontSize: 12, color: '#6b7280', fontWeight: 500 }}>✗ Esclusa</span>
                    {decisionLabel && <span style={{ fontSize: 10, color: '#999' }}>{decisionLabel}</span>}
                  </div>
                  <select
                    value={selectedReason}
                    onChange={e => handleExcludeReason(e.target.value)}
                    style={{
                      width: '100%', fontSize: 12, padding: '6px 8px',
                      border: '0.5px solid #e5e7eb', borderRadius: 6,
                      background: '#fff', color: '#1A1A1A', cursor: 'pointer',
                    }}
                  >
                    <option value="">— Motivazione obbligatoria —</option>
                    {verifyReasons.map(r => (
                      <option key={r.id} value={r.text}>{r.text}</option>
                    ))}
                  </select>
                  <textarea
                    value={extraNote}
                    onChange={e => handleExcludeNote(e.target.value)}
                    placeholder="Note aggiuntive (facoltativo)"
                    rows={1}
                    style={{
                      width: '100%', fontSize: 11, padding: '5px 8px', marginTop: 6,
                      border: '0.5px solid #e5e7eb', borderRadius: 6,
                      resize: 'vertical', boxSizing: 'border-box',
                      background: '#fafafa', color: '#666',
                    }}
                  />
                </div>
              )}
            </div>
          )}

          {/* Motivazione (per not_significant, excluded_na — non per to_verify che ha il suo step) */}
          {needsReason && !isToVerify && (
            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: '#555', display: 'block', marginBottom: 4 }}>
                Motivazione (obbligatoria)
              </label>
              <select
                value={selectedReason}
                onChange={e => handleReasonChange(e.target.value)}
                style={{
                  width: '100%', fontSize: 12, padding: '6px 8px',
                  border: '0.5px solid #e5e7eb', borderRadius: 6,
                  background: '#fff', color: '#1A1A1A', cursor: 'pointer',
                }}
              >
                <option value="">— Seleziona motivazione —</option>
                {filteredReasons.map(r => (
                  <option key={r.id} value={r.text}>{r.text}</option>
                ))}
              </select>
              <textarea
                value={extraNote}
                onChange={e => handleExtraNote(e.target.value)}
                placeholder="Note aggiuntive (facoltativo)"
                rows={1}
                style={{
                  width: '100%', fontSize: 11, padding: '5px 8px', marginTop: 6,
                  border: '0.5px solid #e5e7eb', borderRadius: 6,
                  resize: 'vertical', boxSizing: 'border-box',
                  background: '#fafafa', color: '#666',
                }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ------------------------------------------------------------------
// Componente principale
// ------------------------------------------------------------------
export default function Scope3Screening({ reportId, companyId: companyIdProp }) {
  const [subcategories, setSubcategories] = useState([])
  const [screeningMap, setScreeningMap] = useState({})
  const [exclusionReasons, setExclusionReasons] = useState(FALLBACK_REASONS)
  const [clientId, setClientId] = useState(companyIdProp || null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        // Fetch subcategories + existing screening in parallel
        const [{ data: subs }, { data: screenings }] = await Promise.all([
          supabase.from('scope3_subcategories').select('*').order('category_num').order('sub_num'),
          supabase.from('scope3_screening').select('*').eq('report_id', reportId),
        ])
        setSubcategories(subs || [])
        const map = {}
        ;(screenings || []).forEach(s => { map[s.subcategory_id] = s })
        setScreeningMap(map)

        // Fetch exclusion reasons (table may not exist yet — graceful fallback)
        const { data: reasons } = await supabase.from('scope3_exclusion_reasons').select('*').order('id')
        if (reasons && reasons.length > 0) setExclusionReasons(reasons)

        // Fetch company_id from report if not passed as prop
        if (!companyIdProp) {
          const { data: rep } = await supabase.from('ghg_reports').select('company_id').eq('id', reportId).single()
          if (rep?.company_id) setClientId(rep.company_id)
        }
      } catch (err) {
        console.error('[scope3] Load error:', err)
      }
      setLoading(false)
    }
    load()
  }, [reportId, companyIdProp])

  async function handleUpdate(subcategoryId, payload) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { total_score, id: _id, created_at: _ca, updated_at: _ua, report_id: _ri, subcategory_id: _si, extra_note: _en, ...cleanPayload } = { ...payload }
    const row = {
      report_id: reportId,
      subcategory_id: subcategoryId,
      ...cleanPayload,
      updated_at: new Date().toISOString(),
    }
    try {
      const result = await supabase
        .from('scope3_screening')
        .upsert(row, { onConflict: 'report_id,subcategory_id' })
        .select()
        .single()
      if (result.error) {
        console.error('[scope3] Save error:', result.error.message, result.error.details, result.error.hint)
        return
      }
      if (result.data) {
        setScreeningMap(m => ({ ...m, [subcategoryId]: result.data }))
      }
    } catch (err) {
      console.error('[scope3] Unexpected error:', err)
    }
  }

  // Statistiche riassuntive
  const stats = Object.values(screeningMap).reduce((acc, s) => {
    acc[s.classification] = (acc[s.classification] || 0) + 1
    return acc
  }, {})
  const total = subcategories.length
  const done = Object.keys(screeningMap).length

  if (loading) return <div style={{ padding: 24, color: '#666' }}>Caricamento...</div>

  // Raggruppa per categoria
  const grouped = subcategories.reduce((acc, sub) => {
    if (!acc[sub.category_num]) acc[sub.category_num] = []
    acc[sub.category_num].push(sub)
    return acc
  }, {})

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: 24, fontFamily: 'Arial, sans-serif' }}>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h1 style={{ fontSize: 20, fontWeight: 500, color: '#1A1A1A', margin: 0 }}>
            Screening Scope 3 — ISO 14064-1:2019 §5.2.3
          </h1>
          {clientId && (
            <a
              href={`/clients/${clientId}`}
              style={{ fontSize: 13, color: '#2563eb', textDecoration: 'none' }}
            >
              ← Torna al cliente
            </a>
          )}
        </div>
        <p style={{ fontSize: 13, color: '#666', margin: '6px 0 0' }}>
          Valuta la significatività di ogni sottocategoria su tre assi: magnitudine, influenza, fattibilità dati.
        </p>
      </div>

      {/* Progress bar */}
      <div style={{ marginBottom: 20, padding: '12px 16px', background: '#F4F8F7', borderRadius: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ fontSize: 12, color: '#666' }}>
            Completato {done}/{total} sottocategorie
          </span>
          <div style={{ display: 'flex', gap: 12, fontSize: 11 }}>
            {stats.significant && <span style={{ color: '#16a34a' }}>● {stats.significant} significative</span>}
            {stats.to_verify && <span style={{ color: '#d97706' }}>● {stats.to_verify} da verificare</span>}
            {stats.not_significant && <span style={{ color: '#6b7280' }}>● {stats.not_significant} non significative</span>}
            {stats.excluded_na && <span style={{ color: '#9ca3af' }}>● {stats.excluded_na} N/A</span>}
          </div>
        </div>
        <div style={{ height: 4, background: '#e5e7eb', borderRadius: 2 }}>
          <div style={{ height: 4, background: '#2563eb', borderRadius: 2, width: `${(done/total)*100}%`, transition: 'width 0.3s' }} />
        </div>
      </div>

      {/* Categorie */}
      {Object.entries(grouped).map(([catNum, subs]) => (
        <div key={catNum} style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: '#999', marginBottom: 10, paddingBottom: 6, borderBottom: '0.5px solid #e5e7eb' }}>
            {CAT_LABELS[catNum]}
          </div>
          {subs.map(sub => (
            <SubcategoryRow
              key={sub.id}
              sub={sub}
              screening={screeningMap[sub.id]}
              onUpdate={handleUpdate}
              exclusionReasons={exclusionReasons}
            />
          ))}
        </div>
      ))}

      {/* CTA finale */}
      {done === total && (
        <div style={{ padding: '14px 18px', background: '#f0fdf4', border: '0.5px solid #16a34a40', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 13, color: '#15803d', fontWeight: 500 }}>
            Screening completato — {stats.significant || 0} categorie da quantificare
          </span>
        </div>
      )}
    </div>
  )
}
