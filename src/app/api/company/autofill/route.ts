export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import puppeteer from "puppeteer";

export async function POST(req: NextRequest) {
  try {
    const { url } = (await req.json()) as { url?: string };
    if (!url) return NextResponse.json({ error: "URL mancante" }, { status: 400 });

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "ANTHROPIC_API_KEY non configurata" }, { status: 500 });

    // ── Scrape website with Puppeteer ──
    const browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    let pageText = "";
    try {
      const page = await browser.newPage();
      await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
      pageText = await page.evaluate(() => document.body?.innerText || "");

      // Try to find and visit "Chi siamo" / "About" / "Contatti" pages
      const links = await page.evaluate(() => {
        const anchors = Array.from(document.querySelectorAll("a[href]"));
        return anchors
          .map((a) => ({ text: (a.textContent || "").trim().toLowerCase(), href: (a as HTMLAnchorElement).href }))
          .filter((l) => /chi siamo|about|contatt|contact|azienda|company|la nostra|storia/i.test(l.text))
          .slice(0, 2);
      });

      for (const link of links) {
        try {
          await page.goto(link.href, { waitUntil: "domcontentloaded", timeout: 10000 });
          const subText = await page.evaluate(() => document.body?.innerText || "");
          pageText += "\n\n--- PAGINA: " + link.text + " ---\n" + subText;
        } catch { /* skip unreachable subpages */ }
      }

      await page.close();
    } finally {
      await browser.close();
    }

    // Truncate to avoid token limits
    const maxChars = 12000;
    if (pageText.length > maxChars) pageText = pageText.slice(0, maxChars);

    if (pageText.trim().length < 50) {
      return NextResponse.json({ error: "Impossibile estrarre testo dal sito" }, { status: 422 });
    }

    // ── Call Anthropic API ──
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1000,
        messages: [{
          role: "user",
          content: `Analizza questo testo di un sito web aziendale italiano ed estrai in JSON:
{
  "company_name": "ragione sociale completa",
  "legal_form": "SRL o SPA o SAS o altro",
  "registered_address": "indirizzo completo con via, numero, CAP, città, provincia",
  "email": "email aziendale",
  "website": "${url}",
  "nace_description": "descrizione dell'attività economica principale",
  "responsible_name": "nome del titolare/amministratore se trovato",
  "number_of_employees": null,
  "country": "Italia"
}
Se un campo non è trovato metti null. Rispondi SOLO con JSON valido senza markdown, senza backticks, senza commenti.

TESTO DEL SITO:
${pageText}`,
        }],
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("[autofill] Anthropic error:", err);
      return NextResponse.json({ error: "Errore AI" }, { status: 502 });
    }

    const aiResponse = await res.json();
    const text = aiResponse.content?.[0]?.text || "";

    // Parse JSON from AI response (handle possible markdown wrapping)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ error: "Risposta AI non valida" }, { status: 422 });
    }

    const parsed = JSON.parse(jsonMatch[0]);
    return NextResponse.json(parsed);
  } catch (err) {
    console.error("[autofill]", err);
    return NextResponse.json(
      { error: `Errore: ${err instanceof Error ? err.message : "sconosciuto"}` },
      { status: 500 },
    );
  }
}
