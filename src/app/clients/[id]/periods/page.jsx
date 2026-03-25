'use client'
import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const MONTHS = ['', 'Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic']
const STATUS_CFG = {
  draft:  { label: 'Bozza', color: '#d97706', bg: '#fffbeb' },
  open:   { label: 'Aperto', color: '#2563eb', bg: '#eff6ff' },
  closed: { label: 'Completo', color: '#16a34a', bg: '#f0fdf4' },
  locked: { label: 'Bloccato', color: '#6b7280', bg: '#f9fafb' },
}

export default function PeriodsListPage() {
  const { id: clientId } = useParams()
  const [periods, setPeriods] = useState([])
  const [summaries, setSummaries] = useState({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data: p } = await supabase
        .from('ghg_periods')
        .select('*')
        .eq('company_id', clientId)
        .order('year', { ascending: false })
        .order('month', { ascending: true, nullsFirst: true })
      setPeriods(p || [])

      // Load summaries
      const { data: s } = await supabase.from('period_summary').select('*').eq('company_id', clientId)
      if (s) {
        const map = {}
        s.forEach(r => { map[r.period_id] = r })
        setSummaries(map)
      }
      setLoading(false)
    }
    load()
  }, [clientId])

  function fmtCo2(kg) {
    if (!kg || kg === 0) return '—'
    if (kg >= 1000) return `${(kg / 1000).toFixed(3)} t`
    return `${kg.toFixed(1)} kg`
  }

  if (loading) return <div style={{ padding: 40, color: '#999' }}>Caricamento...</div>

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: 24, fontFamily: 'Arial, sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600, color: '#1C2B28', margin: 0 }}>Periodi GHG</h1>
          <p style={{ fontSize: 13, color: '#6b7280', margin: '4px 0 0' }}>Inventari emissioni per anno o mese</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <a href={`/clients/${clientId}`} style={{ fontSize: 13, color: '#2563eb', textDecoration: 'none' }}>← Cliente</a>
          <a
            href={`/clients/${clientId}/periods/new`}
            style={{
              fontSize: 14, fontWeight: 500, padding: '8px 18px', borderRadius: 8,
              background: '#27AE60', color: '#fff', textDecoration: 'none',
            }}
          >+ Nuovo periodo</a>
        </div>
      </div>

      {periods.length === 0 && (
        <div style={{ padding: '40px 20px', textAlign: 'center', color: '#999', background: '#F4F8F7', borderRadius: 10 }}>
          Nessun periodo GHG inserito. Clicca "Nuovo periodo" per iniziare.
        </div>
      )}

      {periods.map(p => {
        const s = summaries[p.id]
        const cfg = STATUS_CFG[p.status] || STATUS_CFG.draft
        const label = p.month == null ? `Anno ${p.year}` : `${MONTHS[p.month]} ${p.year}`

        return (
          <a
            key={p.id}
            href={`/clients/${clientId}/periods/${p.id}/edit`}
            style={{
              display: 'flex', alignItems: 'center', gap: 16, textDecoration: 'none',
              padding: '14px 18px', marginBottom: 8, borderRadius: 10,
              border: '0.5px solid #E2EAE8', background: '#fff',
              transition: 'border-color 0.15s',
            }}
          >
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#1C2B28' }}>{label}</div>
              <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>{p.month == null ? 'Inventario annuale' : 'Mensile'}</div>
            </div>

            {s && (
              <div style={{ display: 'flex', gap: 16, fontSize: 12 }}>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ color: '#15803d', fontWeight: 500 }}>S1: {fmtCo2(s.scope1_co2e_kg)}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ color: '#1d4ed8', fontWeight: 500 }}>S2: {fmtCo2(s.scope2_lb_co2e_kg)}</div>
                </div>
                <div style={{ textAlign: 'right', minWidth: 70 }}>
                  <div style={{ color: '#1C2B28', fontWeight: 700 }}>{fmtCo2(s.total_co2e_kg)}</div>
                </div>
              </div>
            )}

            <span style={{
              fontSize: 11, fontWeight: 500, padding: '3px 10px', borderRadius: 4,
              background: cfg.bg, color: cfg.color, border: `0.5px solid ${cfg.color}30`,
            }}>{cfg.label}</span>
          </a>
        )
      })}
    </div>
  )
}
