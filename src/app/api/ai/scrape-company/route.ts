import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  const { url } = await req.json()
  if (!url) return NextResponse.json({ error: 'URL mancante' }, { status: 400 })

  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY
  if (!ANTHROPIC_KEY) return NextResponse.json({ error: 'ANTHROPIC_API_KEY non configurata' }, { status: 500 })

  try {
    // Fetch website content
    const siteResp = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 Enworia/1.0' }, signal: AbortSignal.timeout(10000) })
    if (!siteResp.ok) return NextResponse.json({ error: `Sito non raggiungibile (${siteResp.status})` }, { status: 422 })
    const html = await siteResp.text()
    // Strip HTML tags, keep text, limit to 8k chars
    const text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 8000)

    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 512,
        messages: [{ role: 'user', content: `Analizza questo testo di un sito aziendale italiano e rispondi SOLO con JSON valido (niente markdown):
{
  "company_name": "nome azienda",
  "responsible_name": "nome responsabile o CEO se visibile, altrimenti null",
  "sector_macro": "uno tra: Manifattura, Commercio, Servizi, Edilizia, Agricoltura, Altro",
  "number_of_employees": numero intero stimato o null,
  "country": "Italia",
  "turnover_eur": numero o null,
  "nace_description": "breve descrizione attività"
}

Testo sito:
${text}` }],
      }),
    })

    if (!resp.ok) return NextResponse.json({ error: 'Errore Claude API' }, { status: 502 })
    const result = await resp.json()
    const raw = result.content?.[0]?.text || ''
    let parsed
    try { parsed = JSON.parse(raw) } catch { const m = raw.match(/\{[\s\S]*\}/); parsed = m ? JSON.parse(m[0]) : null }
    if (!parsed) return NextResponse.json({ error: 'Risposta non parsificabile' }, { status: 422 })

    return NextResponse.json({ ok: true, data: parsed })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Errore sconosciuto'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
