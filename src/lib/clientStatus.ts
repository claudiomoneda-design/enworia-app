const MESI = ['', 'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre']
function getMeseNome(mese: number) { return MESI[((mese - 1 + 12) % 12) + 1] }
function pl(n: number, s: string, p: string) { return `${n} ${n === 1 ? s : p}` }

export interface ClientStatus {
  tipo: 'non_configurato' | 'ritardo' | 'in_corso' | 'completo'
  colore: 'grigio' | 'rosso' | 'giallo' | 'verde'
  testo: string
  sub: string
  subColore?: string
  insight?: string | null
  insightColore?: string
  cta?: string | null
  ctaColore?: 'rosso' | 'verde' | 'grigio'
}

export function getClientStatus(
  ghgReports: { updated_at?: string; status?: string }[] | null,
  fontiInserite: number,
): ClientStatus {
  const oggi = new Date()
  const meseCorrente = oggi.getMonth() + 1
  const FONTI_TOTALI = 7

  if (!ghgReports || ghgReports.length === 0) {
    return { tipo: 'non_configurato', colore: 'grigio', testo: 'Nessun dato inserito', sub: 'Configurazione incompleta', cta: 'Configura cliente', ctaColore: 'grigio' }
  }

  const ultimoReport = ghgReports[0]
  const ultimaData = new Date(ultimoReport.updated_at || oggi.toISOString())
  const giorniFA = Math.floor((oggi.getTime() - ultimaData.getTime()) / (1000 * 60 * 60 * 24))
  const fontiMancanti = Math.max(0, FONTI_TOTALI - fontiInserite)
  const giorniLabel = giorniFA === 0 ? 'oggi' : giorniFA === 1 ? 'ieri' : `${giorniFA} giorni fa`

  if (giorniFA > 20) {
    return {
      tipo: 'ritardo', colore: 'rosso',
      testo: `Nessun dato ${getMeseNome(meseCorrente)}`,
      sub: `${giorniFA} giorni senza aggiornamenti`, subColore: '#C0392B',
      insight: fontiMancanti > 0 ? `${getMeseNome(meseCorrente > 1 ? meseCorrente - 1 : 12)} incompleto (${pl(fontiMancanti, 'dato mancante', 'dati mancanti')})` : null,
      cta: `Completa emissioni ${getMeseNome(meseCorrente)}`, ctaColore: 'rosso',
    }
  }

  if (fontiMancanti > 0) {
    return {
      tipo: 'in_corso', colore: 'giallo',
      testo: `${getMeseNome(meseCorrente)} incompleto`,
      sub: `Ultimo aggiornamento: ${giorniLabel}`, subColore: '#8AB5AC',
      insight: `${pl(fontiMancanti, 'dato mancante', 'dati mancanti')}`,
      insightColore: '#C8860A',
      cta: `Completa dati energia (${pl(fontiMancanti, 'mancante', 'mancanti')})`, ctaColore: 'verde',
    }
  }

  return {
    tipo: 'completo', colore: 'verde',
    testo: `${getMeseNome(meseCorrente)} completo`,
    sub: `Aggiornato ${giorniLabel}`, subColore: '#8AB5AC',
    insight: 'In linea con media', insightColore: '#1A8A47',
    cta: null,
  }
}

export function statusNodeColor(s: string | null | undefined): 'rosso' | 'giallo' | 'verde' | 'grigio' {
  if (!s) return 'grigio'
  if (['ritardo', 'urgente', 'error'].includes(s)) return 'rosso'
  if (['in_corso', 'bozza', 'parziale', 'draft'].includes(s)) return 'giallo'
  if (['completo', 'ok', 'done', 'completato', 'completed'].includes(s)) return 'verde'
  return 'grigio'
}
