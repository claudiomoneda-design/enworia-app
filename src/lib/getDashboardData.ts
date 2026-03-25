import { supabase } from './supabase'

function pl(n: number, s: string, p: string) { return `${n} ${n === 1 ? s : p}` }

export interface AzioneOggi { tipo: string; testo: string; sub: string; href: string }
export interface ClienteConStato {
  id: string; company_name: string; stato: string; colore: string; badge: string
  fontiMancanti: number; totale: number | null; nomeBreve: string
}

export interface HomeData {
  clientiConStato: ClienteConStato[]
  azioniOggi: AzioneOggi[]
  totaleEmissioni: string
  reportGenerati: number
  inRitardo: number
  totaleClienti: number
}

export async function getDashboardData(): Promise<HomeData> {
  const [{ data: companies }, { data: reports }, { data: periods }] = await Promise.all([
    supabase.from('companies').select('id, company_name, updated_at, form_status').order('updated_at', { ascending: false }),
    supabase.from('ghg_reports').select('id, company_id, status, updated_at, scope1_total, scope2_lb_total, total_co2eq').order('updated_at', { ascending: false }),
    supabase.from('ghg_periods').select('id, company_id'),
  ])

  // Count entries per company
  let entriesPerCompany: Record<string, number> = {}
  if (periods && periods.length > 0) {
    const periodIds = periods.map(p => p.id)
    const periodToCompany: Record<string, string> = {}
    periods.forEach(p => { periodToCompany[p.id] = p.company_id })
    const { data: entries } = await supabase.from('energy_entries').select('id, period_id').in('period_id', periodIds).limit(2000)
    ;(entries || []).forEach(e => {
      const cid = periodToCompany[e.period_id]
      if (cid) entriesPerCompany[cid] = (entriesPerCompany[cid] || 0) + 1
    })
  }

  const oggi = new Date()
  const FONTI_TOTALI = 7

  const clientiConStato: ClienteConStato[] = (companies || []).map(c => {
    const ultimoReport = (reports || []).find(r => r.company_id === c.id)
    const fontiInserite = entriesPerCompany[c.id] || 0
    const fontiMancanti = Math.max(0, FONTI_TOTALI - fontiInserite)
    const giorniFA = ultimoReport ? Math.floor((oggi.getTime() - new Date(ultimoReport.updated_at).getTime()) / 86400000) : 999
    const totale = ultimoReport ? (Number(ultimoReport.total_co2eq ?? 0) || (Number(ultimoReport.scope1_total ?? 0) + Number(ultimoReport.scope2_lb_total ?? 0))) : null

    let stato: string, colore: string, badge: string, priorita: number
    if (!ultimoReport && fontiInserite === 0) {
      stato = 'non_configurato'; colore = 'grigio'; badge = 'Configura'; priorita = 4
    } else if (giorniFA > 20 && fontiMancanti > 0) {
      stato = 'ritardo'; colore = 'rosso'; badge = 'Urgente'; priorita = 1
    } else if (fontiMancanti > 0) {
      stato = 'in_corso'; colore = 'giallo'; badge = pl(fontiMancanti, 'mancante', 'mancanti'); priorita = 2
    } else if (ultimoReport?.status !== 'completed' && ultimoReport?.status !== 'completato') {
      stato = 'pronto'; colore = 'verde'; badge = 'Genera'; priorita = 3
    } else {
      stato = 'completo'; colore = 'verde'; badge = 'Completo'; priorita = 5
    }

    return { id: c.id, company_name: c.company_name || 'Senza nome', stato, colore, badge, fontiMancanti, totale, nomeBreve: (c.company_name || '').split(' ').slice(0, 2).join(' '), _priorita: priorita, _giorniFA: giorniFA } as ClienteConStato & { _priorita: number; _giorniFA: number }
  })

  clientiConStato.sort((a, b) => ((a as unknown as { _priorita: number })._priorita) - ((b as unknown as { _priorita: number })._priorita))

  // Azioni oggi
  const mese = ['', 'gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'][oggi.getMonth() + 1]
  const azioniOggi: AzioneOggi[] = (clientiConStato as (ClienteConStato & { _priorita: number; _giorniFA: number })[])
    .filter(c => ['ritardo', 'in_corso', 'pronto'].includes(c.stato))
    .slice(0, 5)
    .map(c => {
      if (c.stato === 'ritardo') return { tipo: 'rosso', testo: `Inserisci dati ${mese} — ${c.nomeBreve}`, sub: `${c._giorniFA} giorni senza aggiornamenti`, href: `/clients/${c.id}` }
      if (c.stato === 'in_corso') return { tipo: 'giallo', testo: `Completa dati energia (${pl(c.fontiMancanti, 'mancante', 'mancanti')}) — ${c.nomeBreve}`, sub: 'Carica bolletta o inserisci manualmente', href: `/clients/${c.id}` }
      return { tipo: 'verde', testo: `Genera report — ${c.nomeBreve}`, sub: 'Tutti i dati inseriti — pronto per la generazione', href: `/clients/${c.id}` }
    })

  const totaleEmissioni = ((reports || []).reduce((s, r) => s + (Number(r.total_co2eq ?? 0) || (Number(r.scope1_total ?? 0) + Number(r.scope2_lb_total ?? 0))), 0)).toFixed(1)
  const reportGenerati = (reports || []).filter(r => r.status === 'completed' || r.status === 'completato').length
  const inRitardo = clientiConStato.filter(c => c.stato === 'ritardo').length

  return { clientiConStato, azioniOggi, totaleEmissioni, reportGenerati, inRitardo, totaleClienti: companies?.length || 0 }
}
