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
  // Totale annuale da ghg_reports (fonte verità)
  totaleAnnualeReport: number
}

export async function getClientDashboard(companyId: string): Promise<DashboardData> {
  const now = new Date()
  const curYear = now.getFullYear()
  const curMonth = now.getMonth() + 1

  // ── 1. Fonte verità: ghg_reports ──
  const { data: reports } = await supabase
    .from('ghg_reports')
    .select('reference_year, scope1_total, scope2_lb_total, total_co2eq, status')
    .eq('company_id', companyId)
    .order('reference_year', { ascending: false })

  // Totale annuale dal report (fonte verità)
  const latestReport = reports?.[0]
  const totaleAnnuale = latestReport
    ? Number(latestReport.total_co2eq ?? 0) || (Number(latestReport.scope1_total ?? 0) + Number(latestReport.scope2_lb_total ?? 0))
    : 0

  // Anno precedente
  const prevYearReport = reports?.find(r => r.reference_year === curYear - 1)
  const prevYearTotal = prevYearReport
    ? Number(prevYearReport.total_co2eq ?? 0) || (Number(prevYearReport.scope1_total ?? 0) + Number(prevYearReport.scope2_lb_total ?? 0))
    : 0

  // ── 2. Dati mensili da energy_entries (solo per chart/KPI mensili) ──
  const { data: periods } = await supabase
    .from('ghg_periods')
    .select('id, year, month')
    .eq('company_id', companyId)

  // Check if there are actual monthly periods (month IS NOT NULL)
  const monthlyPeriods = (periods || []).filter(p => p.month != null)
  const hasMonthlyData = monthlyPeriods.length > 0

  let monthlyMap: Record<string, number> = {}
  const sourceCategories = new Set<string>()

  if (hasMonthlyData) {
    const periodIds = monthlyPeriods.map(p => p.id)
    const { data: entries } = await supabase
      .from('energy_entries')
      .select('period_id, co2e_kg, scope, source_category, approach')
      .in('period_id', periodIds)

    if (entries) {
      const periodMap: Record<string, { year: number; month: number }> = {}
      monthlyPeriods.forEach(p => { periodMap[p.id] = { year: p.year, month: p.month! } })

      entries.forEach(e => {
        const p = periodMap[e.period_id]
        if (!p) return
        // Exclude market-based to avoid double counting
        if (e.approach === 'market') return
        sourceCategories.add(e.source_category)
        const key = `${p.year}-${String(p.month).padStart(2, '0')}`
        monthlyMap[key] = (monthlyMap[key] || 0) + (e.co2e_kg || 0)
      })
    }
  }

  // Also check annual entries for fonti_completate
  if (!hasMonthlyData && periods && periods.length > 0) {
    const allPeriodIds = periods.map(p => p.id)
    const { data: entries } = await supabase
      .from('energy_entries')
      .select('source_category')
      .in('period_id', allPeriodIds)
    if (entries) entries.forEach(e => sourceCategories.add(e.source_category))
  }

  // ── 3. Build monthly array (only if monthly data exists) ──
  const last12: (MeseData & { label: string })[] = []
  for (let i = 11; i >= 0; i--) {
    const d = new Date(curYear, curMonth - 1 - i, 1)
    const y = d.getFullYear(), m = d.getMonth() + 1
    const key = `${y}-${String(m).padStart(2, '0')}`
    const val = hasMonthlyData ? (monthlyMap[key] || 0) / 1000 : 0
    last12.push({ mese: m, anno: y, tCO2e: val, label: MESI_SHORT[m] })
  }

  const cur = last12[last12.length - 1]
  const prev = last12[last12.length - 2]
  const prevPrev = last12.length >= 3 ? last12[last12.length - 3] : null

  // Media ultimi 6 mesi
  const last6 = last12.slice(-7, -1).filter(m => m.tCO2e > 0)
  const media6m = last6.length > 0 ? last6.reduce((s, m) => s + m.tCO2e, 0) / last6.length : 0

  const pct = (a: number, b: number) => b > 0 ? Math.round(((a - b) / b) * 100) : null

  // YTD from monthly data
  const ytdFromMonthly = hasMonthlyData
    ? last12.filter(m => m.anno === curYear).reduce((s, m) => s + m.tCO2e, 0)
    : 0
  // Use report total if no monthly data
  const ytdTotal = ytdFromMonthly > 0 ? ytdFromMonthly : (latestReport?.reference_year === curYear ? totaleAnnuale : 0)

  const monthsElapsed = hasMonthlyData ? last12.filter(m => m.anno === curYear && m.tCO2e > 0).length : 12
  const proiezione = ytdTotal > 0 && monthsElapsed < 12 ? (ytdTotal / monthsElapsed) * 12 : null

  // ── 4. Alerts (only if monthly data) ──
  const alerts: Alert[] = []
  if (hasMonthlyData && cur.tCO2e > 0 && prev.tCO2e > 0) {
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

  // ── 5. GHG completamento fonti ──
  const allFonti = ['gas_naturale', 'gasolio', 'benzina', 'gpl', 'elettricita', 'calore']
  const fontiMancanti = allFonti.filter(f => !sourceCategories.has(f))

  return {
    meseCorrente: {
      ...cur,
      vs_mese_prec_pct: hasMonthlyData && cur.tCO2e > 0 && prev.tCO2e > 0 ? pct(cur.tCO2e, prev.tCO2e) : null,
      vs_media6m_delta: hasMonthlyData && media6m > 0 ? Math.round((cur.tCO2e - media6m) * 1000) / 1000 : null,
      label: `${MESI_IT[cur.mese]} ${cur.anno}`,
    },
    mesePrecedente: {
      ...prev,
      vs_mese_prec_pct: hasMonthlyData && prev.tCO2e > 0 && prevPrev?.tCO2e ? pct(prev.tCO2e, prevPrev.tCO2e) : null,
      label: `${MESI_IT[prev.mese]} ${prev.anno}`,
    },
    ytd: {
      tCO2e: Math.round(ytdTotal * 1000) / 1000,
      vs_ytd_anno_prec_pct: prevYearTotal > 0 ? pct(ytdTotal, prevYearTotal) : null,
      proiezione_annua: proiezione ? Math.round(proiezione * 1000) / 1000 : null,
    },
    annoPrecedente: {
      anno: curYear - 1,
      tCO2e: Math.round(prevYearTotal * 1000) / 1000,
      vs_anno_prima_pct: null,
    },
    mensili: hasMonthlyData ? last12 : [],
    alerts,
    ghg: {
      fonti_completate: sourceCategories.size,
      fonti_totali: allFonti.length,
      fonti_mancanti: fontiMancanti,
    },
    hasDati: totaleAnnuale > 0 || hasMonthlyData,
    totaleAnnualeReport: totaleAnnuale,
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
    totaleAnnualeReport: 0,
  }
}
