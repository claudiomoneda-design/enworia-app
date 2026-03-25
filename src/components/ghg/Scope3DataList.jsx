'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

const CAT_LABELS = {
  2: 'Categoria 2 — Energia importata',
  3: 'Categoria 3 — Trasporti',
  4: 'Categoria 4 — Prodotti usati',
  5: 'Categoria 5 — Uso prodotti (valle)',
  6: 'Categoria 6 — Altre fonti',
}

const CLASS_CFG = {
  significant:     { label: 'Significativa',    color: '#16a34a', bg: '#f0fdf4' },
  to_verify:       { label: 'Da verificare',    color: '#d97706', bg: '#fffbeb' },
  not_significant: { label: 'Non significativa', color: '#6b7280', bg: '#f9fafb' },
  excluded_na:     { label: 'N/A',              color: '#9ca3af', bg: '#f9fafb' },
}

function fmtCo2(kg) {
  if (!kg || isNaN(kg)) return '—'
  if (kg >= 1000) return `${(kg / 1000).toLocaleString('it-IT', { maximumFractionDigits: 3 })} tCO₂e`
  return `${kg.toLocaleString('it-IT', { maximumFractionDigits: 2 })} kgCO₂e`
}

export default function Scope3DataList({ reportId, companyId }) {
  const [subcategories, setSubcategories] = useState([])
  const [screeningMap, setScreeningMap] = useState({})
  const [entriesMap, setEntriesMap] = useState({}) // subcategoryId → { count, totalCo2e }
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const [{ data: subs }, { data: scrs }, { data: entries }] = await Promise.all([
        supabase.from('scope3_subcategories').select('*').order('category_num').order('sub_num'),
        supabase.from('scope3_screening').select('*').eq('report_id', reportId),
        supabase.from('scope3_entries').select('subcategory_id,co2e_kg').eq('report_id', reportId),
      ])

      setSubcategories(subs || [])

      const sm = {}
      ;(scrs || []).forEach(s => { sm[s.subcategory_id] = s })
      setScreeningMap(sm)

      const em = {}
      ;(entries || []).forEach(e => {
        if (!em[e.subcategory_id]) em[e.subcategory_id] = { count: 0, totalCo2e: 0 }
        em[e.subcategory_id].count++
        em[e.subcategory_id].totalCo2e += (e.co2e_kg || 0)
      })
      setEntriesMap(em)
      setLoading(false)
    }
    load()
  }, [reportId])

  if (loading) return <div style={{ padding: 40, color: '#999' }}>Caricamento...</div>

  // Group by category
  const grouped = subcategories.reduce((acc, sub) => {
    if (!acc[sub.category_num]) acc[sub.category_num] = []
    acc[sub.category_num].push(sub)
    return acc
  }, {})

  // Total scope 3
  const totalScope3 = Object.values(entriesMap).reduce((sum, e) => sum + e.totalCo2e, 0)

  // Stats
  const withData = Object.keys(entriesMap).length
  const significant = Object.values(screeningMap).filter(s => s.classification === 'significant' || (s.override_manual && s.classification === 'significant')).length

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: 24, fontFamily: 'Arial, sans-serif' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, color: '#1C2B28', margin: 0 }}>Scope 3 — Dati quantitativi</h1>
        <a href={`/clients/${companyId}`} style={{ fontSize: 13, color: '#2563eb', textDecoration: 'none' }}>← Torna al cliente</a>
      </div>
      <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 20px' }}>
        Inserisci i dati per le categorie classificate come significative nello screening.
      </p>

      {/* Progress */}
      <div style={{ marginBottom: 24, padding: '12px 16px', background: '#F4F8F7', borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 12, color: '#666' }}>
          {withData} categorie con dati / {significant} significative
        </div>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#1C2B28' }}>
          Totale Scope 3: {fmtCo2(totalScope3)}
        </div>
      </div>

      {/* Categories grouped */}
      {Object.entries(grouped).map(([catNum, subs]) => (
        <div key={catNum} style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: '#999', marginBottom: 10, paddingBottom: 6, borderBottom: '0.5px solid #E2EAE8' }}>
            {CAT_LABELS[catNum]}
          </div>

          {subs.map(sub => {
            const scr = screeningMap[sub.id]
            const classification = scr?.classification || null
            const cfg = CLASS_CFG[classification] || { label: '—', color: '#ccc', bg: '#f9fafb' }
            const entry = entriesMap[sub.id]
            const isActionable = classification === 'significant' || (scr?.override_manual && classification === 'significant')
            const isToVerifyIncluded = classification === 'to_verify' || (scr?.override_manual && classification !== 'not_significant' && classification !== 'excluded_na')

            return (
              <div
                key={sub.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '12px 16px', marginBottom: 6, borderRadius: 8,
                  border: '0.5px solid #E2EAE8',
                  borderLeft: `3px solid ${cfg.color}`,
                  background: entry ? '#fafffe' : '#fff',
                }}
              >
                {/* Name */}
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: '#1C2B28' }}>
                    {sub.category_num}.{sub.sub_num} — {sub.label}
                  </div>
                  {sub.unit_hint && <span style={{ fontSize: 10, color: '#999' }}>Unità suggerita: {sub.unit_hint}</span>}
                </div>

                {/* Classification badge */}
                <span style={{
                  fontSize: 10, fontWeight: 500, padding: '2px 8px', borderRadius: 4,
                  background: cfg.bg, color: cfg.color, border: `0.5px solid ${cfg.color}30`,
                  whiteSpace: 'nowrap',
                }}>{cfg.label}</span>

                {/* Data status */}
                <div style={{ minWidth: 100, textAlign: 'right' }}>
                  {entry ? (
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#15803d' }}>{fmtCo2(entry.totalCo2e)}</div>
                      <div style={{ fontSize: 10, color: '#27AE60' }}>✓ {entry.count} {entry.count === 1 ? 'voce' : 'voci'}</div>
                    </div>
                  ) : (
                    (isActionable || isToVerifyIncluded) && <span style={{ fontSize: 11, color: '#d97706' }}>— mancante</span>
                  )}
                </div>

                {/* Action */}
                <div style={{ minWidth: 90 }}>
                  {(isActionable || isToVerifyIncluded) && (
                    <a
                      href={`/clients/${companyId}/ghg/${reportId}/scope3/${sub.id}/edit`}
                      style={{
                        fontSize: 12, fontWeight: 500, padding: '5px 12px', borderRadius: 6,
                        textDecoration: 'none',
                        background: entry ? '#fff' : '#27AE60',
                        color: entry ? '#27AE60' : '#fff',
                        border: entry ? '1px solid #27AE6060' : 'none',
                      }}
                    >{entry ? 'Modifica' : 'Inserisci'}</a>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      ))}

      {/* Total footer */}
      {totalScope3 > 0 && (
        <div style={{
          padding: '16px 20px', background: '#F4F8F7', borderRadius: 10,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          border: '0.5px solid #27AE6030',
        }}>
          <span style={{ fontSize: 16, fontWeight: 600, color: '#1C2B28' }}>Totale Scope 3</span>
          <span style={{ fontSize: 22, fontWeight: 700, color: '#1C2B28' }}>{fmtCo2(totalScope3)}</span>
        </div>
      )}
    </div>
  )
}
