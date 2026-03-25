// src/app/api/ingestion/parse-portale-csv/route.js
// ENWORIA — Parser CSV portale fornitore (E-Distribuzione, Enel, etc.)

import { NextResponse } from 'next/server'

/**
 * Parsifica CSV con letture mensili scaricati dai portali fornitori.
 * Formati supportati: E-Distribuzione, Enel Web, generico (mese;kWh o mese;m3)
 */
export async function POST(req) {
  const body = await req.json()
  const { csv_text, filename, separator } = body
  if (!csv_text) return NextResponse.json({ error: 'Campo csv_text mancante' }, { status: 400 })

  try {
    const sep = separator || detectSeparator(csv_text)
    const lines = csv_text.trim().split('\n').map(l => l.trim()).filter(Boolean)
    if (lines.length < 2) return NextResponse.json({ error: 'CSV vuoto o con solo intestazione' }, { status: 400 })

    const headers = lines[0].split(sep).map(h => h.trim().toLowerCase().replace(/['"]/g, ''))
    const rows = lines.slice(1).map(l => {
      const vals = l.split(sep).map(v => v.trim().replace(/['"]/g, ''))
      const obj = {}
      headers.forEach((h, i) => { obj[h] = vals[i] || '' })
      return obj
    })

    // Detect columns
    const meseCol = headers.find(h => /mese|month|periodo|data/i.test(h))
    const annoCol = headers.find(h => /anno|year/i.test(h))
    const kwhCol = headers.find(h => /kwh|consumo.*kwh|energia/i.test(h))
    const m3Col = headers.find(h => /m3|smc|consumo.*gas|mc/i.test(h))
    const podCol = headers.find(h => /pod|pdr|punto/i.test(h))

    const tipo = kwhCol ? 'elettricita' : m3Col ? 'gas' : 'sconosciuto'
    const consumoCol = kwhCol || m3Col
    const unita = kwhCol ? 'kWh' : 'm3'

    const letture = rows.map(r => {
      const val = parseFloat((r[consumoCol] || '0').replace(',', '.'))
      return {
        mese: r[meseCol] || null,
        anno: r[annoCol] || null,
        consumo: isNaN(val) ? 0 : val,
        unita,
        pod: r[podCol] || null,
      }
    }).filter(l => l.consumo > 0)

    const totale = letture.reduce((s, l) => s + l.consumo, 0)

    return NextResponse.json({
      ok: true,
      filename: filename || 'portale.csv',
      tipo_energia: tipo,
      unita,
      colonne_rilevate: { meseCol, annoCol, consumoCol, podCol },
      letture,
      totale,
      righe_totali: rows.length,
      righe_valide: letture.length,
    })
  } catch (err) {
    console.error('[parse-portale-csv]', err)
    return NextResponse.json({ ok: false, error: 'Errore parsing CSV', detail: err.message }, { status: 500 })
  }
}

function detectSeparator(text) {
  const first = text.split('\n')[0]
  if (first.includes(';')) return ';'
  if (first.includes('\t')) return '\t'
  return ','
}
