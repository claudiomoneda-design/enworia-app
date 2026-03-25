// src/app/api/ingestion/parse-vision/route.js
// ENWORIA — Parser bolletta via Claude Vision (fallback per PDF scansionati)
// Usa Claude API per OCR + estrazione strutturata da immagine bolletta

import { NextResponse } from 'next/server'

export async function POST(req) {
  const body = await req.json()
  const { image_base64, media_type, filename } = body

  if (!image_base64) return NextResponse.json({ error: 'Campo image_base64 mancante' }, { status: 400 })

  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY
  if (!ANTHROPIC_KEY) return NextResponse.json({ error: 'ANTHROPIC_API_KEY non configurata' }, { status: 500 })

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: media_type || 'image/jpeg', data: image_base64 },
            },
            {
              type: 'text',
              text: `Analizza questa bolletta energetica italiana e rispondi SOLO con un oggetto JSON valido (senza markdown) con questi campi:
{
  "fornitore": "nome fornitore",
  "tipo_energia": "elettricita" o "gas" o "teleriscaldamento",
  "periodo": { "mese": N, "anno": NNNN },
  "consumo_kwh": numero o null,
  "consumo_m3": numero o null,
  "importo_eur": numero o null,
  "pod_pdr": "codice" o null
}
Se non riesci a leggere un campo, metti null.`,
            },
          ],
        }],
      }),
    })

    if (!response.ok) {
      const err = await response.text()
      console.error('[parse-vision] Claude API error:', err)
      return NextResponse.json({ ok: false, error: 'Errore Claude API' }, { status: 502 })
    }

    const result = await response.json()
    const text = result.content?.[0]?.text || ''

    // Extract JSON from response
    let parsed
    try {
      parsed = JSON.parse(text)
    } catch {
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (jsonMatch) parsed = JSON.parse(jsonMatch[0])
      else return NextResponse.json({ ok: false, error: 'Risposta non parsificabile', raw: text }, { status: 422 })
    }

    // Wrap in standard field format
    const fields = {
      fornitore: { value: parsed.fornitore, confidence: 0.80, corrected: false },
      tipo_energia: { value: parsed.tipo_energia, confidence: 0.80, corrected: false },
      periodo: { value: parsed.periodo, confidence: 0.75, corrected: false },
      consumo_kwh: { value: parsed.consumo_kwh, unita: 'kWh', confidence: 0.75, corrected: false },
      consumo_m3: { value: parsed.consumo_m3, unita: 'm3', confidence: 0.75, corrected: false },
      importo_eur: { value: parsed.importo_eur, confidence: 0.70, corrected: false },
      pod_pdr: { value: parsed.pod_pdr, confidence: 0.70, corrected: false },
    }

    const vals = Object.values(fields).filter(f => f.value != null)
    const avg = vals.length > 0 ? vals.reduce((s, f) => s + f.confidence, 0) / vals.length : 0

    return NextResponse.json({
      ok: true,
      filename: filename || 'bolletta-vision',
      method: 'vision',
      fields,
      confidence_avg: Math.round(avg * 1000) / 1000,
    })
  } catch (err) {
    console.error('[parse-vision]', err)
    return NextResponse.json({ ok: false, error: 'Errore Vision parsing', detail: err.message }, { status: 500 })
  }
}
