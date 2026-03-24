export const maxDuration = 90;

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import puppeteer from "puppeteer";

// ─── Supabase ────────────────────────────────────────────────
const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

// ─── Helpers ─────────────────────────────────────────────────
type R = Record<string, unknown>;
const $ = (v: unknown) => Number(v ?? 0);
const f1 = (v: number) =>
  v.toLocaleString("it-IT", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const f2 = (v: number) =>
  v.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const unc = (uA: number | null, uF: number | null) => {
  const a = $(uA ?? 3), f = $(uF ?? 2.5);
  return Math.sqrt(a * a + f * f);
};

// ─── Slide dimensions ────────────────────────────────────────
const W = 1280;
const H = 720;

// ─── Template (exact copy of presentation_template.html) ─────
// Placeholders replaced at runtime with Supabase data.
const TEMPLATE = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Arial', sans-serif; background: #fff; }

  .slide {
    width: 1280px;
    height: 720px;
    overflow: hidden;
    position: relative;
    page-break-after: always;
  }

  /* ── SLIDE 1 — COVER ── */
  .s1 { display: flex; }
  .s1-left {
    width: 560px; height: 720px;
    background: #006450;
    display: flex; flex-direction: column;
    justify-content: space-between;
    padding: 52px 44px 48px 44px;
  }
  .s1-title {
    font-size: 72px; font-weight: 900; color: #fff;
    line-height: 1.05; letter-spacing: -0.5px; word-break: keep-all;
    white-space: pre-line; text-rendering: optimizeLegibility;
    font-family: Arial, sans-serif; margin-top: 40px;
  }
  .s1-bottom { display: flex; flex-direction: column; gap: 14px; }
  .s1-company { font-size: 20px; font-weight: 700; color: #A8D5C5; letter-spacing: 0.5px; line-height: 1.3; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .s1-scope { font-size: 15px; color: #7FC9B0; font-style: italic; }
  .s1-iso { font-size: 14px; color: #7FC9B0; }
  .s1-inv { font-size: 12px; color: #7FC9B0; margin-top: 4px; }

  .s1-right {
    flex: 1; height: 720px; background: #fff;
    display: flex; flex-direction: column;
    justify-content: center; padding: 0 52px;
    gap: 0;
  }
  .s1-kpi { padding: 32px 0; border-bottom: 1px solid #E2E8F0; }
  .s1-kpi:last-child { border-bottom: none; }
  .s1-kpi-val { font-size: 80px; font-weight: 900; color: #006450; line-height: 1; }
  .s1-kpi-label { font-size: 15px; color: #4A5568; margin-top: 4px; }

  .s1-footer {
    position: absolute; bottom: 0; left: 0; right: 0;
    height: 28px; display: flex;
  }
  .s1-footer-left { width: 560px; background: #004035; display: flex; align-items: center; padding: 0 16px; }
  .s1-footer-right { flex: 1; background: #F4F7F5; display: flex; align-items: center; justify-content: flex-end; padding: 0 16px; }
  .s1-footer-text { font-size: 11px; color: #A8D5C5; }
  .s1-footer-page { font-size: 11px; color: #4A5568; }

  /* ── SHARED HEADER ── */
  .slide-header {
    height: 88px; background: #006450;
    display: flex; flex-direction: column;
    justify-content: center; padding: 0 40px;
    position: relative;
  }
  .slide-header h2 { font-size: 30px; font-weight: 800; color: #fff; }
  .slide-header p { font-size: 14px; color: #A8D5C5; font-style: italic; margin-top: 3px; }
  .slide-num {
    position: absolute; right: 40px; top: 50%;
    transform: translateY(-50%);
    font-size: 11px; color: #A8D5C5;
  }

  /* ── SHARED FOOTER ── */
  .slide-footer {
    position: absolute; bottom: 0; left: 0; right: 0;
    height: 26px; background: #F4F7F5;
    border-top: 1px solid #CBD5E0;
    display: flex; align-items: center; padding: 0 16px;
  }
  .slide-footer span { font-size: 11px; color: #4A5568; }

  /* ── SLIDE 2 — EMISSIONI ── */
  .s2-body {
    display: flex; height: 576px;
  }
  .s2-left {
    width: 580px; padding: 44px 48px;
    display: flex; flex-direction: column; justify-content: center;
    border-right: 1px solid #CBD5E0;
  }
  .s2-big { font-size: 56px; font-weight: 900; color: #006450; line-height: 1.1; }
  .s2-sub { font-size: 15px; color: #4A5568; font-style: italic; margin-top: 12px; }
  .s2-note { font-size: 16px; color: #006450; font-weight: 700; margin-top: 8px; }

  .s2-right {
    flex: 1; padding: 28px 36px;
    display: flex; flex-direction: column; justify-content: space-around;
  }
  .s2-driver { display: flex; align-items: flex-start; gap: 16px; }
  .s2-pct { font-size: 58px; font-weight: 900; line-height: 1; min-width: 110px; }
  .s2-driver-info { display: flex; flex-direction: column; justify-content: center; padding-top: 6px; }
  .s2-driver-name { font-size: 17px; font-weight: 700; color: #0D1F1A; }
  .s2-driver-val { font-size: 13px; color: #4A5568; margin-top: 2px; }

  .s2-bottom {
    background: #E8F5F0; border-top: 1px solid #00A06E;
    padding: 10px 40px; position: absolute;
    bottom: 26px; left: 0; right: 0;
    display: flex; align-items: center;
  }
  .s2-bottom span { font-size: 13px; font-weight: 700; color: #006450; }

  /* ── SLIDE 3 — POSIZIONAMENTO ── */
  .s3-body {
    display: flex; height: 540px; margin-top: 6px;
  }
  .s3-left {
    width: 520px; padding: 20px 44px;
    display: flex; flex-direction: column; justify-content: space-around;
    border-right: 1px solid #CBD5E0;
  }
  .s3-kpi { padding: 10px 0; border-bottom: 1px solid #E2E8F0; }
  .s3-kpi:last-child { border-bottom: none; }
  .s3-kpi-val { font-size: 50px; font-weight: 900; color: #006450; line-height: 1; }
  .s3-kpi-unit { font-size: 14px; font-weight: 700; color: #00A06E; margin-top: 2px; }
  .s3-kpi-note { font-size: 13px; color: #4A5568; font-style: italic; margin-top: 2px; }

  .s3-right {
    flex: 1; display: flex; align-items: center; justify-content: center;
    padding: 24px;
  }
  .s3-baseline {
    background: #E8F5F0; border: 1.5px solid #00A06E;
    width: 100%; height: 100%;
    display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    border-radius: 2px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.07);
  }
  .s3-baseline-word { font-size: 64px; font-weight: 900; color: #006450; line-height: 1; }
  .s3-baseline-year { font-size: 72px; font-weight: 900; color: #006450; line-height: 1; }
  .s3-baseline-line { width: 80%; height: 1px; background: #00A06E; margin: 12px 0; }
  .s3-baseline-sub { font-size: 14px; color: #4A5568; font-style: italic; }
  .s3-baseline-sub2 { font-size: 13px; color: #4A5568; margin-top: 4px; }

  .s3-bottom {
    position: absolute; bottom: 26px; left: 0; right: 0;
    background: #006450; padding: 10px 44px;
    display: flex; align-items: center;
  }
  .s3-bottom span { font-size: 14px; font-weight: 700; color: #fff; }

  /* ── SLIDE 4 — INTERVENTI ── */
  .s4-intro {
    padding: 8px 40px 0 40px;
    font-size: 14px; color: #4A5568; font-style: italic;
  }
  .s4-cols {
    display: flex; gap: 16px;
    padding: 10px 24px 0 24px; height: 420px;
  }
  .s4-col {
    flex: 1; display: flex; flex-direction: column;
    border: 1px solid #CBD5E0;
    box-shadow: 0 3px 8px rgba(0,0,0,0.07);
  }
  .s4-col-header {
    padding: 14px 14px; display: flex; align-items: center; gap: 10px;
  }
  .s4-col-num {
    font-size: 22px; font-weight: 900; color: #fff;
    width: 32px; text-align: center;
  }
  .s4-col-title { font-size: 13px; font-weight: 700; color: #fff; }
  .s4-col-tag { font-size: 9px; color: rgba(255,255,255,0.75); font-style: italic; margin-top: 1px; }
  .s4-col-body { flex: none; min-height: 220px; padding: 12px 14px; background: #F4F7F5; display: flex; flex-direction: column; justify-content: flex-start; }
  .s4-action {
    padding: 9px 0; border-bottom: 1px solid #CBD5E0;
    font-size: 15px; color: #0D1F1A;
  }
  .s4-action:last-child { border-bottom: none; }
  .s4-impact {
    background: #E8F5F0; border: 1px solid #00A06E;
    margin: 0; padding: 10px 14px; text-align: center;
  }
  .s4-impact-pct { font-size: 56px; font-weight: 900; color: #006450; line-height: 1; }
  .s4-impact-scope { font-size: 22px; font-weight: 700; color: #006450; }
  .s4-impact-sub { font-size: 8px; color: #4A5568; font-style: italic; margin-top: 3px; }

  .s4-totalbar {
    position: absolute; bottom: 26px; left: 0; right: 0;
    background: #006450; padding: 8px 40px;
    display: flex; align-items: center; justify-content: center;
  }
  .s4-totalbar span { font-size: 14px; font-weight: 700; color: #fff; }

  /* ── SLIDE 5 — ROADMAP ── */
  .s5 { background: #006450; }
  .s5 .slide-header { background: transparent; }
  .s5 .slide-header h2 { color: #fff; font-size: 30px; text-align: center; width: 100%; }
  .s5 .slide-num { color: #A8D5C5; }

  .s5-cols {
    display: flex; gap: 20px;
    padding: 8px 32px; height: 380px;
  }
  .s5-col {
    flex: 1; border: 1px solid rgba(0,160,110,0.4);
    background: rgba(255,255,255,0.06);
    display: flex; flex-direction: column;
  }
  .s5-year {
    font-size: 56px; font-weight: 900; color: #fff;
    text-align: center; padding: 14px 0 6px;
  }
  .s5-title-bar {
    background: #00A06E; padding: 6px 0;
    text-align: center;
    font-size: 15px; font-weight: 700; color: #fff;
  }
  .s5-items { flex: 1; padding: 16px 18px; display: flex; flex-direction: column; gap: 14px; }
  .s5-item {
    background: rgba(255,255,255,0.08);
    padding: 9px 12px;
    font-size: 15px; color: #fff;
  }

  .s5-closing {
    position: absolute; bottom: 26px; left: 0; right: 0;
  }
  .s5-obj {
    background: #00A06E; padding: 7px 40px;
    text-align: center;
    font-size: 16px; font-weight: 700; color: #fff;
  }
  .s5-cta {
    background: #004035; padding: 5px 40px;
    text-align: center;
    font-size: 15px; color: #D1FAE5; font-style: italic;
  }

  .s5 .slide-footer { background: #004035; border-top: 1px solid #006450; }
  .s5 .slide-footer span { color: #A8D5C5; }
</style>
</head>
<body>

<!-- ═══════════════════════════════════════════════════ -->
<!-- SLIDE 1 — COVER                                     -->
<!-- ═══════════════════════════════════════════════════ -->
<div class="slide s1">
  <div class="s1-left">
    <div class="s1-title">Carbon<br>Footprint<br>{{ANNO}}</div>
    <div class="s1-bottom">
      <div class="s1-company">{{NOME_AZIENDA}}</div>
      <div class="s1-scope">Ambito: emissioni dirette e indirette da energia (Scope 1–2)</div>
      <div class="s1-iso">Baseline {{ANNO}} · ISO 14064-1:2019</div>
      <div class="s1-inv">Inventario GHG aziendale – primo anno (baseline)</div>
    </div>
  </div>
  <div class="s1-right">
    <div class="s1-kpi">
      <div class="s1-kpi-val">{{TOTALE_TCO2}}</div>
      <div class="s1-kpi-label">tCO₂e totali</div>
    </div>
    <div class="s1-kpi">
      <div class="s1-kpi-val">{{PCT_SCOPE2}}%</div>
      <div class="s1-kpi-label">Scope 2 – priorità</div>
    </div>
    <div class="s1-kpi">
      <div class="s1-kpi-val">±{{INCERTEZZA}}%</div>
      <div class="s1-kpi-label">affidabilità dati</div>
    </div>
  </div>
  <div class="s1-footer">
    <div class="s1-footer-left"><span class="s1-footer-text">CO₂e Srl · {{RESPONSABILE}} · Lead Auditor ISO 14064</span></div>
    <div class="s1-footer-right"><span class="s1-footer-page">1 / 5</span></div>
  </div>
</div>

<!-- ═══════════════════════════════════════════════════ -->
<!-- SLIDE 2 — EMISSIONI                                 -->
<!-- ═══════════════════════════════════════════════════ -->
<div class="slide" style="background:#fff;">
  <div class="slide-header">
    <h2>Da dove arrivano le emissioni?</h2>
    <p>Driver principale: energia elettrica</p>
    <span class="slide-num">2 / 5</span>
  </div>
  <div class="s2-body">
    <div class="s2-left">
      <div class="s2-big">Emissioni concentrate<br>su 2 leve principali</div>
      <div class="s2-note">→ energia + riscaldamento = ~90% delle emissioni</div>
      <div class="s2-sub">Totale Scope 1–2: {{TOTALE_TCO2}} tCO₂e</div>
    </div>
    <div class="s2-right">
      <div class="s2-driver">
        <div class="s2-pct" style="color:#00A06E;">{{PCT_SCOPE2}}%</div>
        <div class="s2-driver-info">
          <div class="s2-driver-name">energia elettrica</div>
          <div class="s2-driver-val">{{SCOPE2_TCO2}} tCO₂e · Scope 2</div>
        </div>
      </div>
      <div class="s2-driver">
        <div class="s2-pct" style="color:#006450;">{{PCT_CALDAIA}}%</div>
        <div class="s2-driver-info">
          <div class="s2-driver-name">riscaldamento</div>
          <div class="s2-driver-val">{{TCO2_CALDAIA}} tCO₂e · Scope 1</div>
        </div>
      </div>
      <div class="s2-driver">
        <div class="s2-pct" style="color:#2F855A;">{{PCT_CARB}}%</div>
        <div class="s2-driver-info">
          <div class="s2-driver-name">carburanti (mezzi aziendali)</div>
          <div class="s2-driver-val">{{TCO2_CARB}} tCO₂e · Scope 1</div>
        </div>
      </div>
    </div>
  </div>
  <div class="s2-bottom">
    <span>±{{INCERTEZZA}}% affidabilità dati · Interventi sull'elettricità = impatto immediato</span>
  </div>
  <div class="slide-footer"><span>CO₂e Srl · co2e.it</span></div>
</div>

<!-- ═══════════════════════════════════════════════════ -->
<!-- SLIDE 3 — POSIZIONAMENTO                            -->
<!-- ═══════════════════════════════════════════════════ -->
<div class="slide" style="background:#fff;">
  <div class="slide-header">
    <h2>Come si posiziona l'azienda?</h2>
    <p>Indicatori di posizionamento — anno di riferimento</p>
    <span class="slide-num">3 / 5</span>
  </div>

  <!-- BLOCCO 1: 3 KPI orizzontali -->
  <div style="display:flex; gap:0; height:320px; border-bottom: 2px solid #E8F5F0; align-items:flex-start;">
    <div style="flex:1; padding:48px 36px 40px; display:flex; flex-direction:column; justify-content:flex-start; border-right:1px solid #E2E8F0; vertical-align:top;">
      <div style="font-size:58px; font-weight:900; color:#006450; line-height:1;">{{KPI_FATTURATO}}</div>
      <div style="font-size:13px; font-weight:700; color:#00A06E; margin-top:8px;">tCO₂e / M€ fatturato</div>
      <div style="font-size:12px; color:#4A5568; font-style:italic; margin-top:4px;">→ intensità economica</div>
    </div>
    <div style="flex:1; padding:48px 36px 40px; display:flex; flex-direction:column; justify-content:flex-start; border-right:1px solid #E2E8F0; background:#FAFCFA; vertical-align:top;">
      <div style="font-size:58px; font-weight:900; color:#006450; line-height:1;">{{KPI_DIPENDENTI}}</div>
      <div style="font-size:13px; font-weight:700; color:#00A06E; margin-top:8px;">tCO₂e / dipendente</div>
      <div style="font-size:12px; color:#4A5568; font-style:italic; margin-top:4px;">→ profilo energy-intensive</div>
    </div>
    <div style="flex:1; padding:48px 36px 40px; display:flex; flex-direction:column; justify-content:flex-start; vertical-align:top;">
      <div style="font-size:58px; font-weight:900; color:#006450; line-height:1;">{{KPI_MWH}}</div>
      <div style="font-size:13px; font-weight:700; color:#00A06E; margin-top:8px;">tCO₂e / MWh</div>
      <div style="font-size:12px; color:#4A5568; font-style:italic; margin-top:4px;">→ intensità energetica</div>
    </div>
  </div>

  <!-- BLOCCO 2: Baseline -->
  <div style="background:#E8F5F0; border-left:6px solid #006450; margin:0; padding:28px 40px; display:flex; align-items:center; gap:32px; height:180px;">
    <div>
      <div style="font-size:48px; font-weight:900; color:#006450; line-height:1;">Baseline {{ANNO}}</div>
      <div style="font-size:15px; color:#006450; margin-top:8px; font-weight:600;">→ punto di partenza per riduzione</div>
      <div style="font-size:12px; color:#4A5568; margin-top:4px;">primo anno di inventario</div>
    </div>
  </div>

  <!-- BLOCCO 3: Footer testo -->
  <div style="background:#006450; padding:14px 40px; position:absolute; bottom:26px; left:0; right:0;">
    <span style="font-size:13px; font-weight:700; color:#fff;">Da quest'anno ogni riduzione è misurabile e documentata.</span>
  </div>

  <div class="slide-footer"><span>CO₂e Srl · co2e.it</span></div>
</div>

<!-- ═══════════════════════════════════════════════════ -->
<!-- SLIDE 4 — INTERVENTI                                -->
<!-- ═══════════════════════════════════════════════════ -->
<div class="slide" style="background:#fff;">
  <div class="slide-header">
    <h2>Dove intervenire?</h2>
    <p style="color:#00A06E; font-weight:700; font-style:normal;">Riduzione potenziale: fino a –35% delle emissioni totali</p>
    <span class="slide-num">4 / 5</span>
  </div>
  <div class="s4-intro">
    Emissioni concentrate su 2 leve principali → intervenire qui significa ridurre CO₂ e costi
  </div>
  <div class="s4-cols">
    <div class="s4-col">
      <div class="s4-col-header" style="background:#B91C1C;">
        <div class="s4-col-num">1</div>
        <div><div class="s4-col-title">ENERGIA ELETTRICA</div><div class="s4-col-tag">Leva principale</div></div>
      </div>
      <div class="s4-col-body">
        <div class="s4-action">→ Fotovoltaico</div>
        <div class="s4-action">→ Efficienza consumi</div>
        <div class="s4-action">→ Energia verde</div>
      </div>
      <div class="s4-impact">
        <div class="s4-impact-pct">–40%</div>
        <div class="s4-impact-scope">Scope 2</div>
        <div class="s4-impact-sub">qui puoi risparmiare CO₂ e costi</div>
      </div>
    </div>
    <div class="s4-col">
      <div class="s4-col-header" style="background:#C2410C;">
        <div class="s4-col-num">2</div>
        <div><div class="s4-col-title">RISCALDAMENTO</div><div class="s4-col-tag">Alto impatto</div></div>
      </div>
      <div class="s4-col-body">
        <div class="s4-action">→ Caldaia efficiente</div>
        <div class="s4-action">→ Pompa di calore</div>
        <div class="s4-action">→ Isolamento</div>
      </div>
      <div class="s4-impact">
        <div class="s4-impact-pct">–30%</div>
        <div class="s4-impact-scope">Scope 1</div>
        <div class="s4-impact-sub">riduzione diretta emissioni</div>
      </div>
    </div>
    <div class="s4-col">
      <div class="s4-col-header" style="background:#A16207;">
        <div class="s4-col-num">3</div>
        <div><div class="s4-col-title">CARBURANTI</div><div class="s4-col-tag">Completamento</div></div>
      </div>
      <div class="s4-col-body">
        <div class="s4-action">→ Ottimizzazione utilizzo</div>
        <div class="s4-action">→ Veicoli low-emission</div>
      </div>
      <div class="s4-impact">
        <div class="s4-impact-pct">–10%</div>
        <div class="s4-impact-scope">Scope 1</div>
        <div class="s4-impact-sub">ottimizzazione operativa</div>
      </div>
    </div>
  </div>
  <div class="s4-totalbar">
    <span>Potenziale totale combinato: riduzione stimata fino al –35% delle emissioni complessive</span>
  </div>
  <div class="slide-footer"><span>CO₂e Srl · co2e.it</span></div>
</div>

<!-- ═══════════════════════════════════════════════════ -->
<!-- SLIDE 5 — ROADMAP                                   -->
<!-- ═══════════════════════════════════════════════════ -->
<div class="slide s5">
  <div class="slide-header" style="text-align:center;">
    <h2 style="text-align:center;">Prossimi step</h2>
    <span class="slide-num">5 / 5</span>
  </div>
  <div class="s5-cols">
    <div class="s5-col">
      <div class="s5-year">{{ANNO_1}}</div>
      <div class="s5-title-bar">Monitoraggio</div>
      <div class="s5-items">
        <div class="s5-item">Monitoraggio consumi</div>
        <div class="s5-item">Studio FV</div>
        <div class="s5-item">Dati Scope 3</div>
      </div>
    </div>
    <div class="s5-col">
      <div class="s5-year">{{ANNO_2}}</div>
      <div class="s5-title-bar">Intervento</div>
      <div class="s5-items">
        <div class="s5-item">Installazione FV</div>
        <div class="s5-item">Ottimizzazione impianti</div>
        <div class="s5-item">Prima verifica</div>
      </div>
    </div>
    <div class="s5-col">
      <div class="s5-year">{{ANNO_3}}</div>
      <div class="s5-title-bar">Consolidamento</div>
      <div class="s5-items">
        <div class="s5-item">Riduzione consolidata</div>
        <div class="s5-item">Report GHG</div>
        <div class="s5-item">Comunicazione ESG</div>
      </div>
    </div>
  </div>
  <div class="s5-closing">
    <div class="s5-obj">Obiettivo: riduzione strutturale delle emissioni · miglioramento performance ESG</div>
    <div class="s5-cta">Possiamo accompagnare l'azienda nella definizione e implementazione del piano di riduzione.</div>
  </div>
  <div class="slide-footer"><span>CO₂e Srl · {{RESPONSABILE}} · Lead Auditor ISO 14064 · co2e.it</span></div>
</div>

</body>
</html>`;

// ─── GET handler ─────────────────────────────────────────────
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ reportId: string }> },
) {
  try {
    const { reportId } = await params;

    // ── Fetch data (same pattern as generate-report) ──────
    const [{ data: report, error: rErr }, { data: s1raw }, { data: s2raw }] =
      await Promise.all([
        sb.from("ghg_reports").select("*, companies(*)").eq("id", reportId).single(),
        sb.from("scope1_sources").select("*").eq("ghg_report_id", reportId).order("emissions_tco2e", { ascending: false }),
        sb.from("scope2_sources").select("*").eq("ghg_report_id", reportId),
      ]);
    if (!report || rErr)
      return NextResponse.json({ error: "Report non trovato" }, { status: 404 });

    const coJoined = (report.companies as R) || {};

    // Fallback: if the join didn't return turnover, fetch company directly
    const companyId = report.company_id as string;
    let co = coJoined;
    if (!co.turnover_eur && companyId) {
      const { data: fullCompany } = await sb.from("companies").select("*").eq("id", companyId).single();
      if (fullCompany) co = fullCompany as R;
    }
    const CN = (co.company_name as string) || "—";
    const RS = (co.responsible_name as string) || "Claudio Moneda";
    const Y = $(report.reference_year) || $(report.year) || new Date(report.created_at as string).getFullYear();
    const EMP = $(co.number_of_employees);
    const s1 = (s1raw || []) as R[];
    const s2 = (s2raw || []) as R[];

    const S1T = $(report.scope1_total);
    const S2LB = $(report.scope2_lb_total);
    const GT = $(report.total_co2eq) || S1T + S2LB;

    // ── Uncertainty ──────────────────────────────────────────
    const s1U = s1.map((s) => unc(s.uncertainty_activity_pct as number | null, s.uncertainty_fe_pct as number | null));
    const s2U = unc(3, 4.1);
    const s1UW = s1.length > 0 ? s1.reduce((a, s, i) => a + $(s.emissions_tco2e) * s1U[i], 0) / (S1T || 1) : 3;
    const TU = GT > 0
      ? Math.sqrt(Math.pow((S1T * s1UW) / 100, 2) + Math.pow((S2LB * s2U) / 100, 2)) / GT * 100
      : 3.1;

    // ── Scope 1 breakdown: caldaia (1st source) + carburanti (2nd source) ──
    const caldaia = s1.length > 0 ? $(s1[0].emissions_tco2e) : 0;
    const carburanti = s1.length > 1 ? $(s1[1].emissions_tco2e) : 0;

    // ── Intensity KPIs (same method as view/page.tsx §9.3.2g) ──
    // MWh conversion factors per fuel type (Scope 1)
    const FUEL_MWH: Record<string, number> = {
      natural_gas: 0.01, lpg: 0.007, diesel: 0.01, gasolio: 0.01,
      benzina: 0.009, fuel_oil: 0.011, coal: 0.008, wood_pellet: 0.0047,
      wood: 0.004, hydrogen: 0.033,
    };
    const mwhScope1 = s1.reduce((sum, src) => {
      const qty = $(src.activity_value);
      const fuel = (src.activity_data_type as string) || "";
      const factor = FUEL_MWH[fuel] || 0.01;
      return sum + qty * factor;
    }, 0);
    const kwhScope2 = s2.reduce((sum, src) => sum + $(src.activity_value_kwh), 0);
    const totalMWh = mwhScope1 + kwhScope2 / 1000;

    const turnover = $(co.turnover_eur);
    const kpiFatturato = turnover > 0 ? f1((GT / turnover) * 1_000_000) : "N.D.";
    const kpiDipendenti = EMP > 0 ? f1(GT / EMP) : "N.D.";
    const kpiMWh = totalMWh > 0 ? f2(GT / totalMWh) : "N.D.";

    console.log("[presentation] Company:", CN, "| Year:", Y, "| GT:", GT, "| S2LB:", S2LB);
    console.log("[presentation] KPIs → fatturato:", kpiFatturato, "| dipendenti:", kpiDipendenti, "| MWh:", kpiMWh);
    console.log("[presentation] turnover_eur:", turnover, "| employees:", EMP, "| totalMWh:", totalMWh);

    // ── Replace placeholders ─────────────────────────────────
    const html = TEMPLATE
      .replace(/\{\{ANNO\}\}/g, String(Y))
      .replace(/\{\{ANNO_1\}\}/g, String(Y + 1))
      .replace(/\{\{ANNO_2\}\}/g, String(Y + 2))
      .replace(/\{\{ANNO_3\}\}/g, String(Y + 3))
      .replace(/\{\{NOME_AZIENDA\}\}/g, CN)
      .replace(/\{\{TOTALE_TCO2\}\}/g, f2(GT))
      .replace(/\{\{PCT_SCOPE2\}\}/g, String(Math.round((S2LB / (GT || 1)) * 100)))
      .replace(/\{\{INCERTEZZA\}\}/g, f1(TU))
      .replace(/\{\{SCOPE2_TCO2\}\}/g, f2(S2LB))
      .replace(/\{\{PCT_CALDAIA\}\}/g, String(Math.round((caldaia / (GT || 1)) * 100)))
      .replace(/\{\{TCO2_CALDAIA\}\}/g, f2(caldaia))
      .replace(/\{\{PCT_CARB\}\}/g, String(Math.round((carburanti / (GT || 1)) * 100)))
      .replace(/\{\{TCO2_CARB\}\}/g, f2(carburanti))
      .replace(/\{\{KPI_FATTURATO\}\}/g, kpiFatturato)
      .replace(/\{\{KPI_DIPENDENTI\}\}/g, kpiDipendenti)
      .replace(/\{\{KPI_MWH\}\}/g, kpiMWh)
      .replace(/\{\{RESPONSABILE\}\}/g, RS);

    // ── Puppeteer → PDF ──────────────────────────────────────
    const browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    await page.setViewport({ width: W, height: H });

    const pdfBuffer = await page.pdf({
      width: `${W}px`,
      height: `${H}px`,
      printBackground: true,
    });

    await page.close();
    await browser.close();

    // ── Response ─────────────────────────────────────────────
    const slug = CN.normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9\s]/g, "")
      .trim()
      .replace(/\s+/g, "_")
      .toUpperCase();
    const fname = `Sintesi_GHG_${Y}_${slug}.pdf`;

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${fname}"; filename*=UTF-8''${encodeURIComponent(fname)}`,
      },
    });
  } catch (err) {
    console.error("[generate-presentation]", err);
    return NextResponse.json(
      { error: `Errore: ${err instanceof Error ? err.message : "sconosciuto"}` },
      { status: 500 },
    );
  }
}
