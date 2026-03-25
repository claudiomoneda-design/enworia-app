'use client'

import { useState } from 'react'
import { useParams } from 'next/navigation'
import Scope3Screening from '@/components/Scope3Screening'
import Scope3DataList from '@/components/ghg/Scope3DataList'

export default function Scope3Page() {
  const { id: companyId, reportId } = useParams()
  const [tab, setTab] = useState('screening')

  return (
    <div>
      {/* Tab bar */}
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '16px 24px 0', fontFamily: 'Arial, sans-serif' }}>
        <div style={{ display: 'flex', gap: 0, borderBottom: '2px solid #E2EAE8' }}>
          {[
            { key: 'screening', label: 'Screening significatività' },
            { key: 'data', label: 'Inserimento dati quantitativi' },
          ].map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                fontSize: 14, fontWeight: tab === t.key ? 600 : 400,
                padding: '10px 20px', cursor: 'pointer',
                border: 'none', background: 'transparent',
                color: tab === t.key ? '#1C2B28' : '#999',
                borderBottom: tab === t.key ? '2px solid #27AE60' : '2px solid transparent',
                marginBottom: -2,
              }}
            >{t.label}</button>
          ))}
        </div>
      </div>

      {tab === 'screening' && <Scope3Screening reportId={reportId} companyId={companyId} onProceedToData={() => setTab('data')} />}
      {tab === 'data' && <Scope3DataList reportId={reportId} companyId={companyId} />}
    </div>
  )
}
