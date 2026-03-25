// src/app/api/ingestion/parse-bolletta/route.js
// ENWORIA — Parser bollette energetiche PDF (App Router)
// Supporta: Enel, ENI, A2A, Iren, Edison

import { NextResponse } from 'next/server'

const FORNITORI = {
  ENEL: { nomi: ['enel energia', 'enel servizio elettrico', 'enel'], tipo_default: 'elettricita' },
  ENI: { nomi: ['eni gas e luce', 'eni plenitude', 'eni'], tipo_default: 'gas' },
  A2A: { nomi: ['a2a energia', 'a2a smart city', 'a2a'], tipo_default: 'elettricita' },
  IREN: { nomi: ['iren energia', 'iren mercato', 'iren'], tipo_default: 'elettricita' },
  EDISON: { nomi: ['edison energia', 'edison next', 'edison'], tipo_default: 'elettricita' },
}

function norm(t) { return t.toLowerCase().replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ').replace(/[""]/g, '"').replace(/['']/g, "'") }

function rilevaFornitore(t) {
  for (const [k, info] of Object.entries(FORNITORI)) {
    for (const n of info.nomi) {
      if (t.includes(n)) return { value: k, display: n, tipo_default: info.tipo_default, confidence: n.split(' ').length > 1 ? 0.95 : 0.80 }
    }
  }
  return { value: 'ALTRO', display: null, tipo_default: 'elettricita', confidence: 0.30 }
}

function estraiPeriodo(t) {
  const MESI = { gennaio:1,febbraio:2,marzo:3,aprile:4,maggio:5,giugno:6,luglio:7,agosto:8,settembre:9,ottobre:10,novembre:11,dicembre:12,gen:1,feb:2,mar:3,apr:4,mag:5,giu:6,lug:7,ago:8,set:9,ott:10,nov:11,dic:12 }
  let m = t.match(/(?:periodo|dal|competenza)[^\d]*(\d{1,2})[\/\-](\d{1,2})[\/\-](20\d{2})/i)
  if (m) return { value: { mese: parseInt(m[2]), anno: parseInt(m[3]) }, raw: m[0], confidence: 0.90 }
  m = t.match(/\b(0[1-9]|1[0-2])[\/\-](20\d{2})\b/)
  if (m) return { value: { mese: parseInt(m[1]), anno: parseInt(m[2]) }, raw: m[0], confidence: 0.85 }
  const rx = new RegExp(`(${Object.keys(MESI).join('|')})\\s+(20\\d{2})`, 'i')
  m = t.match(rx)
  if (m) return { value: { mese: MESI[m[1].toLowerCase()], anno: parseInt(m[2]) }, raw: m[0], confidence: 0.88 }
  return { value: null, raw: null, confidence: 0 }
}

function estraiConsumo(t, patterns) {
  for (const [rx, conf, max, unit] of patterns) {
    const m = t.match(rx)
    if (m) { const v = parseFloat(m[1].replace('.', '').replace(',', '.')); if (!isNaN(v) && v > 0 && v < max) return { value: v, unita: unit, raw: m[0], confidence: conf } }
  }
  return { value: null, unita: patterns[0]?.[3] || '', raw: null, confidence: 0 }
}

function estraiKwh(t) {
  return estraiConsumo(t, [
    [/(?:consumo|energia consumata|kwh consumati|lettura)[^\d]*([\d.,]+)\s*kwh/i, 0.92, 1e6, 'kWh'],
    [/([\d.]+[,\d]*)\s*kwh/i, 0.75, 1e6, 'kWh'],
  ])
}

function estraiM3(t) {
  return estraiConsumo(t, [
    [/(?:consumo|gas consumato|smc consumati|m3 consumati)[^\d]*([\d.,]+)\s*(?:smc|m3|mc)/i, 0.90, 5e5, 'm3'],
    [/([\d.]+[,\d]*)\s*(?:smc|m3|mc)\b/i, 0.72, 5e5, 'm3'],
  ])
}

function estraiImporto(t) {
  return estraiConsumo(t, [
    [/(?:totale da pagare|importo totale|totale fattura|totale bolletta)[^\d€]*([\d.,]+)\s*€?/i, 0.93, 1e5, 'EUR'],
    [/€\s*([\d.,]+)/, 0.70, 1e5, 'EUR'],
    [/([\d.]+,\d{2})\s*€/, 0.70, 1e5, 'EUR'],
  ])
}

function estraiPodPdr(t) {
  let m = t.match(/\b(IT\d{3}E\d{7}[A-Z0-9]{5,8})\b/i)
  if (m) return { value: m[1].toUpperCase(), tipo: 'POD', confidence: 0.97 }
  m = t.match(/\b(?:pdr|codice pdr)[^\d]*(\d{14})\b/i)
  if (m) return { value: m[1], tipo: 'PDR', confidence: 0.95 }
  return { value: null, tipo: null, confidence: 0 }
}

function tipoEnergia(t, fallback) {
  if (/\bkwh\b|\bkilowatt|\belettr/i.test(t)) return { value: 'elettricita', confidence: 0.90 }
  if (/\bsmc\b|\b(?:gas|metano|m3)\b/i.test(t)) return { value: 'gas', confidence: 0.90 }
  if (/\bteleriscaldamento\b|\bdistrict heat/i.test(t)) return { value: 'teleriscaldamento', confidence: 0.88 }
  return { value: fallback, confidence: 0.50 }
}

export async function POST(req) {
  const body = await req.json()
  const { pdf_base64, filename } = body
  if (!pdf_base64) return NextResponse.json({ error: 'Campo pdf_base64 mancante' }, { status: 400 })

  try {
    const buf = Buffer.from(pdf_base64, 'base64')
    const pdfParse = (await import('pdf-parse')).default
    const parsed = await pdfParse(buf)
    const raw = parsed.text
    const t = norm(raw)

    const forn = rilevaFornitore(t)
    const tipo = tipoEnergia(t, forn.tipo_default)
    const periodo = estraiPeriodo(t)
    const kwh = estraiKwh(t)
    const m3 = estraiM3(t)
    const importo = estraiImporto(t)
    const pod = estraiPodPdr(t)
    const consumo = tipo.value === 'gas' ? m3 : kwh

    const fields = {
      fornitore: { value: forn.value, display: forn.display, confidence: forn.confidence, corrected: false },
      tipo_energia: { value: tipo.value, confidence: tipo.confidence, corrected: false },
      periodo: { value: periodo.value, raw: periodo.raw, confidence: periodo.confidence, corrected: false },
      consumo_kwh: { value: kwh.value, unita: 'kWh', confidence: kwh.confidence, corrected: false },
      consumo_m3: { value: m3.value, unita: 'm3', confidence: m3.confidence, corrected: false },
      importo_eur: { value: importo.value, confidence: importo.confidence, corrected: false },
      pod_pdr: { value: pod.value, tipo: pod.tipo, confidence: pod.confidence, corrected: false },
    }

    const vals = Object.values(fields).filter(f => f.value !== null)
    const avg = vals.length > 0 ? vals.reduce((s, f) => s + f.confidence, 0) / vals.length : 0

    return NextResponse.json({ ok: true, filename: filename || 'bolletta.pdf', pages: parsed.numpages, fields, confidence_avg: Math.round(avg * 1000) / 1000, raw_text_preview: raw.slice(0, 500) })
  } catch (err) {
    console.error('[parse-bolletta]', err)
    return NextResponse.json({ ok: false, error: 'Errore parsing PDF', detail: err.message }, { status: 500 })
  }
}
