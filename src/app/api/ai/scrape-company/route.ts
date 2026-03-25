import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

export async function POST(req: Request) {
  const { url } = await req.json()
  if (!url) return NextResponse.json({ error: 'URL mancante' }, { status: 400 })

  const client = new Anthropic()

  // Fetch website content
  let siteContent = ''
  try {
    const fullUrl = url.startsWith('http') ? url : 'https://' + url
    const res = await fetch(fullUrl, { headers: { 'User-Agent': 'Mozilla/5.0 Enworia/1.0' }, signal: AbortSignal.timeout(8000) })
    const html = await res.text()
    siteContent = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 3000)
  } catch {
    siteContent = `Sito non raggiungibile — usa solo il dominio "${url}" per dedurre il settore`
  }

  try {
    const message = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      messages: [{
        role: 'user',
        content: `Analizza questo contenuto di un sito aziendale italiano ed estrai le informazioni in JSON (solo JSON, niente altro):
{
  "company_name": "nome azienda",
  "responsible_name": "nome CEO/responsabile se visibile, altrimenti null",
  "sector_macro": "uno tra: Manifattura, Commercio, Servizi, Edilizia, Agricoltura, Altro",
  "number_of_employees": numero intero stimato o null,
  "country": "Italia",
  "turnover_eur": numero o null,
  "nace_description": "breve descrizione attività"
}

Contenuto sito: ${siteContent}`
      }],
    })

    const text = message.content[0].type === 'text' ? message.content[0].text : ''
    const clean = text.replace(/```json|```/g, '').trim()
    try {
      const data = JSON.parse(clean)
      return NextResponse.json({ ok: true, data })
    } catch {
      const m = clean.match(/\{[\s\S]*\}/)
      if (m) return NextResponse.json({ ok: true, data: JSON.parse(m[0]) })
      return NextResponse.json({ ok: false, error: 'Parsing fallito', raw: text }, { status: 422 })
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Errore AI'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
