import { supabase } from './supabase'

const MESI_IT = ['', 'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre']
const MESI_SHORT = ['', 'G', 'F', 'M', 'A', 'M', 'G', 'L', 'A', 'S', 'O', 'N', 'D']

interface MeseData { mese: number; anno: number; tCO2e: number }
interface Alert { tipo: string; messaggio: string; impatto_tco2e: number; soglia_pct: number }

export interface DashboardData {
  meseCorrente: MeseData & { vs_mese_prec_pct: number | null; vs_media6m_delta: number | null; label: string }
  mesePrecedente: MeseData & { vs_mese_prec_pct: number | null; label: string }
  ytd: { tCO2e: number; vs_ytd_anno_prec_pct: number | null; proiezione_annua: number | null }
  annoPrecedente: { anno: number; tCO2e: number; vs_anno_prima_pct: number | null }
  mensili: (MeseData & { label: string })[]
  alerts: Alert[]
  ghg: { fonti_completate: number; fonti_totali: number; fonti_mancanti: string[] }
  hasDati: boolean
}

export async function getClientDashboard(companyId: string): Promise<DashboardData> {
  const now = new Date()
  const curYear = now.getFullYear()
  const curMonth = now.getMonth() + 1

  // Load all periods + entries for this company
  const { data: periods } = await supabase
    .from('ghg_periods')
    .select('id, year, month')
    .eq('company_id', companyId)

  if (!periods || periods.length === 0) return emptyDashboard(curMonth, curYear)

  const periodIds = periods.map(p => p.id)
  const { data: entries } = await supabase
    .from('energy_entries')
    .select('period_id, co2e_kg, scope, source_category')
    .in('period_id', periodIds)

  if (!entries || entries.length === 0) return emptyDashboard(curMonth, curYear)

  // Build monthly aggregation
  const periodMap: Record<string, { year: number; month: number | null }> = {}
  periods.forEach(p => { periodMap[p.id] = { year: p.year, month: p.month } })

  const monthlyMap: Record<string, number> = {} // "YYYY-MM" → kgCO2e
  const sourceCategories = new Set<string>()

  entries.forEach(e => {
    const p = periodMap[e.period_id]
    if (!p) return
    sourceCategories.add(e.source_category)
    if (p.month) {
      const key = `${p.year}-${String(p.month).padStart(2, '0')}`
      monthlyMap[key] = (monthlyMap[key] || 0) + (e.co2e_kg || 0)
    } else {
      // Annual data — distribute evenly across 12 months for display
      for (let m = 1; m <= 12; m++) {
        const key = `${p.year}-${String(m).padStart(2, '0')}`
        monthlyMap[key] = (monthlyMap[key] || 0) + (e.co2e_kg || 0) / 12
      }
    }
  })

  // Build sorted monthly array (last 24 months)
  const allMonths: MeseData[] = []
  for (let i = 23; i >= 0; i--) {
    const d = new Date(curYear, curMonth - 1 - i, 1)
    const y = d.getFullYear(), m = d.getMonth() + 1
    const key = `${y}-${String(m).padStart(2, '0')}`
    allMonths.push({ mese: m, anno: y, tCO2e: (monthlyMap[key] || 0) / 1000 })
  }

  // Last 12 for chart
  const last12 = allMonths.slice(-12)

  // Current & previous month
  const cur = last12[last12.length - 1]
  const prev = last12[last12.length - 2]
  const prevPrev = last12.length >= 3 ? last12[last12.length - 3] : null

  // Media ultimi 6 mesi (escludendo mese corrente)
  const last6 = last12.slice(-7, -1)
  const media6m = last6.reduce((s, m) => s + m.tCO2e, 0) / (last6.filter(m => m.tCO2e > 0).length || 1)

  // Variazioni %
  const pct = (a: number, b: number) => b > 0 ? Math.round(((a - b) / b) * 100) : null

  // YTD
  const ytdMonths = last12.filter(m => m.anno === curYear)
  const ytdTotal = ytdMonths.reduce((s, m) => s + m.tCO2e, 0)
  const ytdMonthsPrev = allMonths.filter(m => m.anno === curYear - 1 && m.mese <= curMonth)
  const ytdTotalPrev = ytdMonthsPrev.reduce((s, m) => s + m.tCO2e, 0)
  const monthsElapsed = ytdMonths.filter(m => m.tCO2e > 0).length || curMonth
  const proiezione = ytdTotal > 0 ? (ytdTotal / monthsElapsed) * 12 : null

  // Anno precedente
  const prevYearMonths = allMonths.filter(m => m.anno === curYear - 1)
  const prevYearTotal = prevYearMonths.reduce((s, m) => s + m.tCO2e, 0)

  // Alerts
  const alerts: Alert[] = []
  if (cur.tCO2e > 0 && prev.tCO2e > 0) {
    const varPct = ((cur.tCO2e - prev.tCO2e) / prev.tCO2e) * 100
    if (varPct > 15) {
      alerts.push({
        tipo: 'variazione_mensile',
        messaggio: `Energia +${Math.round(varPct)}% rispetto a ${MESI_IT[prev.mese]}`,
        impatto_tco2e: Math.round((cur.tCO2e - media6m) * 1000) / 1000,
        soglia_pct: 15,
      })
    }
  }

  // GHG completamento
  const allFonti = ['gas_naturale', 'gasolio', 'benzina', 'gpl', 'elettricita', 'calore']
  const fontiPresenti = new Set<string>()
  entries.forEach(e => fontiPresenti.add(e.source_category))
  const fontiMancanti = allFonti.filter(f => !fontiPresenti.has(f))

  return {
    meseCorrente: {
      ...cur,
      vs_mese_prec_pct: pct(cur.tCO2e, prev.tCO2e),
      vs_media6m_delta: Math.round((cur.tCO2e - media6m) * 1000) / 1000,
      label: `${MESI_IT[cur.mese]} ${cur.anno}`,
    },
    mesePrecedente: {
      ...prev,
      vs_mese_prec_pct: prevPrev ? pct(prev.tCO2e, prevPrev.tCO2e) : null,
      label: `${MESI_IT[prev.mese]} ${prev.anno}`,
    },
    ytd: {
      tCO2e: Math.round(ytdTotal * 1000) / 1000,
      vs_ytd_anno_prec_pct: pct(ytdTotal, ytdTotalPrev),
      proiezione_annua: proiezione ? Math.round(proiezione * 1000) / 1000 : null,
    },
    annoPrecedente: {
      anno: curYear - 1,
      tCO2e: Math.round(prevYearTotal * 1000) / 1000,
      vs_anno_prima_pct: null, // would need year-2 data
    },
    mensili: last12.map(m => ({ ...m, label: MESI_SHORT[m.mese] })),
    alerts,
    ghg: {
      fonti_completate: fontiPresenti.size,
      fonti_totali: allFonti.length,
      fonti_mancanti: fontiMancanti,
    },
    hasDati: Object.keys(monthlyMap).length > 0,
  }
}

function emptyDashboard(curMonth: number, curYear: number): DashboardData {
  return {
    meseCorrente: { mese: curMonth, anno: curYear, tCO2e: 0, vs_mese_prec_pct: null, vs_media6m_delta: null, label: `${MESI_IT[curMonth]} ${curYear}` },
    mesePrecedente: { mese: curMonth > 1 ? curMonth - 1 : 12, anno: curMonth > 1 ? curYear : curYear - 1, tCO2e: 0, vs_mese_prec_pct: null, label: '' },
    ytd: { tCO2e: 0, vs_ytd_anno_prec_pct: null, proiezione_annua: null },
    annoPrecedente: { anno: curYear - 1, tCO2e: 0, vs_anno_prima_pct: null },
    mensili: [],
    alerts: [],
    ghg: { fonti_completate: 0, fonti_totali: 6, fonti_mancanti: ['gas_naturale', 'gasolio', 'benzina', 'gpl', 'elettricita', 'calore'] },
    hasDati: false,
  }
}
