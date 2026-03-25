// src/app/api/ingestion/parse-bolletta/route.js
// ENWORIA — Parser bollette energetiche PDF (App Router)

import { NextResponse } from 'next/server'

// Fornitori ordinati per specificità (multi-parola prima, mono-parola dopo)
// Questo evita che "eni" matchi prima di "e.on" quando il testo contiene "e.on energia"
const FORNITORI = [
  { key: 'EON',       nomi: ['e.on energia', 'eon energia', 'eon-energia', 'e.on'], tipo_default: 'elettricita' },
  { key: 'ENEL',      nomi: ['enel energia', 'enel servizio elettrico'], tipo_default: 'elettricita' },
  { key: 'ENI',       nomi: ['eni gas e luce', 'eni plenitude'], tipo_default: 'gas' },
  { key: 'PLENITUDE', nomi: ['plenitude'], tipo_default: 'gas' },
  { key: 'A2A',       nomi: ['a2a energia', 'a2a smart city', 'a2a'], tipo_default: 'elettricita' },
  { key: 'IREN',      nomi: ['iren energia', 'iren mercato', 'iren'], tipo_default: 'elettricita' },
  { key: 'EDISON',    nomi: ['edison energia', 'edison next', 'edison'], tipo_default: 'elettricita' },
  { key: 'DOLOMITI',  nomi: ['dolomiti energia', 'mydolomiti', 'dolomiti ambiente'], tipo_default: 'elettricita' },
  { key: 'HERA',      nomi: ['hera comm', 'hera energia', 'hera'], tipo_default: 'gas' },
  { key: 'SORGENIA',  nomi: ['sorgenia'], tipo_default: 'elettricita' },
  { key: 'ACEA',      nomi: ['acea energia', 'acea'], tipo_default: 'elettricita' },
  { key: 'ENGIE',     nomi: ['engie italia', 'engie'], tipo_default: 'gas' },
  { key: 'ALPERIA',   nomi: ['alperia energy', 'alperia'], tipo_default: 'elettricita' },
  { key: 'AXPO',      nomi: ['axpo italia', 'axpo energy', 'axpo'], tipo_default: 'elettricita' },
  { key: 'ILLUMIA',   nomi: ['illumia'], tipo_default: 'elettricita' },
  { key: 'WEKIWI',    nomi: ['wekiwi'], tipo_default: 'elettricita' },
  { key: 'GELSIA',    nomi: ['gelsia'], tipo_default: 'gas' },
  { key: 'OPTIMA',    nomi: ['optima italia'], tipo_default: 'elettricita' },
  // Mono-parola generici — ULTIMI per evitare false match
  { key: 'ENEL',      nomi: ['enel'], tipo_default: 'elettricita' },
  { key: 'ENI',       nomi: ['\\beni\\b'], tipo_default: 'gas', regex: true },
]

function norm(t) { return t.toLowerCase().replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ').replace(/[""]/g, '"').replace(/['']/g, "'") }

function rilevaFornitore(t) {
  for (const info of FORNITORI) {
    for (const n of info.nomi) {
      if (info.regex) {
        if (new RegExp(n).test(t)) return { value: info.key, display: info.key, tipo_default: info.tipo_default, confidence: 0.80 }
      } else {
        if (t.includes(n)) return { value: info.key, display: n, tipo_default: info.tipo_default, confidence: n.split(' ').length > 1 ? 0.95 : 0.80 }
      }
    }
  }
  return { value: 'ALTRO', display: null, tipo_default: 'elettricita', confidence: 0.30 }
}

function estraiPeriodo(t) {
  const MESI = { gennaio:1,febbraio:2,marzo:3,aprile:4,maggio:5,giugno:6,luglio:7,agosto:8,settembre:9,ottobre:10,novembre:11,dicembre:12,gen:1,feb:2,mar:3,apr:4,mag:5,giu:6,lug:7,ago:8,set:9,ott:10,nov:11,dic:12 }

  // "PERIODO DI FATTURAZIONE\n01 febbraio 2026 - 28 febbraio 2026"
  // Cerca "dd mese yyyy - dd mese yyyy" e prende il mese di inizio
  const rxRange = new RegExp(`(\\d{1,2})\\s+(${Object.keys(MESI).join('|')})\\s+(20\\d{2})\\s*[-–]\\s*(\\d{1,2})\\s+(${Object.keys(MESI).join('|')})\\s+(20\\d{2})`, 'i')
  let m = t.match(rxRange)
  if (m) {
    return { value: { mese: MESI[m[2].toLowerCase()], anno: parseInt(m[3]) }, raw: m[0], confidence: 0.95 }
  }

  // "periodo dal dd/mm/yyyy al dd/mm/yyyy"
  m = t.match(/(?:periodo|fatturazione|competenza)[^\d]*(\d{1,2})[\/\-](\d{1,2})[\/\-](20\d{2})/i)
  if (m) return { value: { mese: parseInt(m[2]), anno: parseInt(m[3]) }, raw: m[0], confidence: 0.90 }

  // "mm/yyyy"
  m = t.match(/\b(0[1-9]|1[0-2])[\/\-](20\d{2})\b/)
  if (m) return { value: { mese: parseInt(m[1]), anno: parseInt(m[2]) }, raw: m[0], confidence: 0.85 }

  // "mese yyyy"
  const rxMese = new RegExp(`(${Object.keys(MESI).join('|')})\\s+(20\\d{2})`, 'i')
  m = t.match(rxMese)
  if (m) return { value: { mese: MESI[m[1].toLowerCase()], anno: parseInt(m[2]) }, raw: m[0], confidence: 0.88 }

  return { value: null, raw: null, confidence: 0 }
}

function estraiKwh(t) {
  // "consumo totale fatturato\n157,72 kWh" — cerca pattern specifici prima
  const patterns = [
    [/consumo totale[^\d]*([\d.,]+)\s*kwh/i, 0.95],
    [/(?:consumo|energia consumata|kwh consumati|totale consumo fatturato)[^\d]*([\d.,]+)\s*kwh/i, 0.92],
    [/([\d.]+[,\d]*)\s*kwh/i, 0.70],
  ]
  for (const [rx, conf] of patterns) {
    const m = t.match(rx)
    if (m) {
      const v = parseFloat(m[1].replace(/\./g, '').replace(',', '.'))
      if (!isNaN(v) && v > 0 && v < 1e6) return { value: v, unita: 'kWh', raw: m[0], confidence: conf }
    }
  }
  return { value: null, unita: 'kWh', raw: null, confidence: 0 }
}

function estraiM3(t) {
  const patterns = [
    [/(?:consumo totale|consumo|gas consumato|smc consumati)[^\d]*([\d.,]+)\s*(?:smc|m[³3]|mc)/i, 0.92],
    [/([\d.]+[,\d]*)\s*(?:smc|m[³3]|mc)\b/i, 0.72],
  ]
  for (const [rx, conf] of patterns) {
    const m = t.match(rx)
    if (m) {
      const v = parseFloat(m[1].replace(/\./g, '').replace(',', '.'))
      if (!isNaN(v) && v > 0 && v < 5e5) return { value: v, unita: 'm3', raw: m[0], confidence: conf }
    }
  }
  return { value: null, unita: 'm3', raw: null, confidence: 0 }
}

function estraiImporto(t) {
  const patterns = [
    [/(?:importo totale da\s*pagare|totale da pagare|importo totale|totale fattura|totale bolletta)[^\d€]*([\d.,]+)\s*€/i, 0.95],
    [/(?:totale da pagare|importo totale)[^\d€]*([\d.,]+)/i, 0.90],
    [/([\d.]+,\d{2})\s*€/, 0.65],
  ]
  for (const [rx, conf] of patterns) {
    const m = t.match(rx)
    if (m) {
      const v = parseFloat(m[1].replace(/\./g, '').replace(',', '.'))
      if (!isNaN(v) && v > 0 && v < 1e5) return { value: v, unita: 'EUR', raw: m[0], confidence: conf }
    }
  }
  return { value: null, unita: 'EUR', raw: null, confidence: 0 }
}

function estraiPodPdr(t) {
  // POD: "IT001E" + 8 cifre (standard italiano)
  let m = t.match(/\b(IT\d{3}E\d{8,11})\b/i)
  if (m) return { value: m[1].toUpperCase(), tipo: 'POD', confidence: 0.97 }
  // POD più generico
  m = t.match(/(?:codice pod|pod)[^\w]*(IT[A-Z0-9]{10,20})/i)
  if (m) return { value: m[1].toUpperCase(), tipo: 'POD', confidence: 0.93 }
  // PDR: 14 cifre
  m = t.match(/(?:pdr|codice pdr)[^\d]*(\d{14})\b/i)
  if (m) return { value: m[1], tipo: 'PDR', confidence: 0.95 }
  return { value: null, tipo: null, confidence: 0 }
}

function estraiNumFattura(t) {
  // "n° 10921696" o "fattura n. 12345" o "numero fattura 12345"
  const patterns = [
    [/(?:n[°.]|numero fattura|fattura n[°.]?)\s*(\d{5,12})/i, 0.95],
    [/(?:dati fattura)[^\d]*n[°.]\s*(\d{5,12})/i, 0.93],
  ]
  for (const [rx, conf] of patterns) {
    const m = t.match(rx)
    if (m) return { value: m[1], confidence: conf }
  }
  return { value: null, confidence: 0 }
}

function tipoEnergia(t, fallback) {
  if (/energia elettrica|\bkwh\b|\bkilowatt|\belettr/i.test(t)) return { value: 'elettricita', confidence: 0.92 }
  if (/\bsmc\b|\bgas naturale\b|\bmetano\b/i.test(t)) return { value: 'gas', confidence: 0.92 }
  if (/\bteleriscaldamento\b/i.test(t)) return { value: 'teleriscaldamento', confidence: 0.88 }
  return { value: fallback, confidence: 0.50 }
}

export async function POST(req) {
  const body = await req.json()
  const { pdf_base64, filename } = body
  if (!pdf_base64) return NextResponse.json({ error: 'Campo pdf_base64 mancante' }, { status: 400 })

  try {
    const buf = Buffer.from(pdf_base64, 'base64')
    const pdfParse = require('pdf-parse')
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
    const fattura = estraiNumFattura(t)

    const fields = {
      fornitore: { value: forn.value, display: forn.display, confidence: forn.confidence, corrected: false },
      tipo_energia: { value: tipo.value, confidence: tipo.confidence, corrected: false },
      periodo: { value: periodo.value, raw: periodo.raw, confidence: periodo.confidence, corrected: false },
      consumo_kwh: { value: kwh.value, unita: 'kWh', confidence: kwh.confidence, corrected: false },
      consumo_m3: { value: m3.value, unita: 'm3', confidence: m3.confidence, corrected: false },
      importo_eur: { value: importo.value, confidence: importo.confidence, corrected: false },
      pod_pdr: { value: pod.value, tipo: pod.tipo, confidence: pod.confidence, corrected: false },
      num_fattura: { value: fattura.value, confidence: fattura.confidence, corrected: false },
    }

    const vals = Object.values(fields).filter(f => f.value !== null)
    const avg = vals.length > 0 ? vals.reduce((s, f) => s + f.confidence, 0) / vals.length : 0

    return NextResponse.json({ ok: true, filename: filename || 'bolletta.pdf', pages: parsed.numpages, fields, confidence_avg: Math.round(avg * 1000) / 1000, raw_text_preview: raw.slice(0, 500) })
  } catch (err) {
    console.error('[parse-bolletta]', err)
    return NextResponse.json({ ok: false, error: 'Errore parsing PDF', detail: err.message }, { status: 500 })
  }
}
