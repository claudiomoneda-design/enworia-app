"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import EnworiaNode from "@/components/EnworiaNode";
import { getDashboardData, type HomeData } from "@/lib/getDashboardData";

const MESI = ['', 'gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];

export default function HomePage() {
  const [dash, setDash] = useState<HomeData | null>(null);

  useEffect(() => { getDashboardData().then(setDash); }, []);

  if (!dash) return <p style={{ color: "#8AB5AC", padding: 40 }}>Caricamento...</p>;

  const ora = new Date().getHours();
  const saluto = ora < 12 ? 'Buongiorno' : ora < 18 ? 'Buon pomeriggio' : 'Buonasera';
  const now = new Date();
  const giorno = now.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
  const attenzione = dash.azioniOggi.length;

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto" }}>

      {/* ── TOPBAR ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, letterSpacing: -0.4, color: "#1C2B28", margin: 0 }}>{saluto}, Claudio</h1>
          <p style={{ fontSize: 13, color: "#5A9088", marginTop: 3 }}>
            {giorno} · {attenzione} client{attenzione === 1 ? 'e richiede' : 'i richiedono'} attenzione
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Link href="/clients" style={{ background: "#fff", color: "#1C2B28", border: "0.5px solid #E2EAE8", borderRadius: 8, padding: "8px 14px", fontSize: 12, fontWeight: 700, textDecoration: "none" }}>Tutti i clienti</Link>
          <Link href="/clients/new" style={{ background: "#27AE60", color: "#fff", borderRadius: 8, padding: "8px 14px", fontSize: 12, fontWeight: 700, textDecoration: "none" }}>+ Nuovo cliente</Link>
        </div>
      </div>

      {/* ── OGGI DEVI FARE ── */}
      {dash.azioniOggi.length > 0 && (
        <div style={{ background: "#1C2B28", borderRadius: 12, padding: "18px 20px", marginBottom: 16 }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: "#6FCF97", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>Oggi devi fare</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {dash.azioniOggi.map((az, i) => (
              <Link key={i} href={az.href} className="hover:bg-[#2A3D39] transition-colors" style={{
                display: "flex", alignItems: "center", gap: 10, padding: "9px 10px", borderRadius: 8, textDecoration: "none",
              }}>
                <div style={{
                  width: 20, height: 20, borderRadius: "50%",
                  background: az.tipo === 'rosso' ? '#E8534A' : az.tipo === 'giallo' ? '#E09B20' : '#27AE60',
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 10, fontWeight: 700, color: "#1C2B28", flexShrink: 0,
                }}>{i + 1}</div>
                <EnworiaNode stato={az.tipo === 'rosso' ? 'rosso' : az.tipo === 'giallo' ? 'giallo' : 'verde'} size={18} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, color: "#fff", fontWeight: 500 }}>{az.testo}</div>
                  <div style={{ fontSize: 11, color: "#4A6A5E", marginTop: 1 }}>{az.sub}</div>
                </div>
                <div style={{ fontSize: 11, color: "#27AE60", fontWeight: 700 }}>Vai →</div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* ── KPI ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 16 }}>
        {[
          { label: 'Clienti attivi', val: String(dash.totaleClienti), href: '/clients', warn: false, dark: false },
          { label: 'Report generati', val: String(dash.reportGenerati), href: '/clients', warn: false, dark: false },
          { label: 'In ritardo', val: String(dash.inRitardo), href: '/clients', warn: dash.inRitardo > 0, dark: false },
          { label: 'Emissioni gestite', val: `${dash.totaleEmissioni} t`, href: '/clients', warn: false, dark: true },
        ].map((k, i) => (
          <Link key={i} href={k.href} style={{
            background: k.dark ? "#1C2B28" : k.warn ? "#FFF8EC" : "#fff",
            border: `0.5px solid ${k.warn ? "#E8B84B" : k.dark ? "#1C2B28" : "#E2EAE8"}`,
            borderRadius: 12, padding: "14px 16px", textDecoration: "none",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
              <EnworiaNode stato={k.warn ? 'rosso' : 'verde'} size={14} />
              <span style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color: k.dark ? "#6FCF97" : k.warn ? "#C8860A" : "#8AB5AC" }}>{k.label}</span>
            </div>
            <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: -0.8, color: k.dark ? "#fff" : k.warn ? "#C8860A" : "#1C2B28", fontFamily: "var(--font-dm-mono), monospace" }}>{k.val}</div>
            <div style={{ fontSize: 11, color: k.dark ? "#4A6A5E" : "#8AB5AC", marginTop: 4 }}>
              {k.dark ? "CO₂e · portafoglio" : k.warn ? "richiedono attenzione" : ""}
            </div>
          </Link>
        ))}
      </div>

      {/* ── CLIENTI ── */}
      <div style={{ fontSize: 10, fontWeight: 600, color: "#8AB5AC", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Clienti</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {dash.clientiConStato.map(c => {
          const borderColor = c.colore === 'rosso' ? '#C0392B' : c.colore === 'giallo' ? '#C8860A' : c.colore === 'verde' ? '#27AE60' : '#E2EAE8';
          return (
            <Link key={c.id} href={`/clients/${c.id}`} className="hover:shadow-sm transition-all" style={{
              display: "flex", alignItems: "center", gap: 12, padding: "12px 16px",
              background: "#fff", borderRadius: 10, border: "0.5px solid #E2EAE8",
              borderLeft: c.colore !== 'grigio' ? `3px solid ${borderColor}` : undefined,
              textDecoration: "none",
            }}>
              {/* Avatar */}
              <div style={{ width: 36, height: 36, borderRadius: "50%", background: "#1C2B28", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 600, color: "#6FCF97", flexShrink: 0 }}>
                {(c.company_name || '??').split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase()).join('')}
              </div>
              {/* Name */}
              <div style={{ minWidth: 160, flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#1C2B28" }}>{c.company_name}</div>
              </div>
              {/* Status */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1 }}>
                <EnworiaNode stato={c.colore} size={16} />
                <span style={{ fontSize: 12, fontWeight: 500, color: "#1C2B28" }}>{c.badge}</span>
              </div>
              {/* Total */}
              <div style={{ width: 80, textAlign: "right" }}>
                {c.totale && c.totale > 0 ? (
                  <span style={{ fontSize: 14, fontWeight: 500, color: "#1C2B28", fontFamily: "var(--font-dm-mono), monospace" }}>{c.totale.toFixed(2)} t</span>
                ) : (
                  <span style={{ fontSize: 12, color: "#8AB5AC" }}>—</span>
                )}
              </div>
              {/* Arrow */}
              <span style={{ fontSize: 12, color: "#8AB5AC" }}>→</span>
            </Link>
          );
        })}
      </div>

      {/* Empty state */}
      {dash.totaleClienti === 0 && (
        <div style={{ background: "#fff", border: "1px dashed #27AE60", borderRadius: 12, padding: 32, textAlign: "center", marginTop: 16 }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: "#1C2B28", marginBottom: 6 }}>Inizia con il primo cliente</div>
          <div style={{ fontSize: 13, color: "#5A9088", marginBottom: 16 }}>Crea un cliente e carica la prima bolletta per partire</div>
          <Link href="/clients/new" style={{ background: "#27AE60", color: "#fff", padding: "10px 28px", borderRadius: 8, fontSize: 14, fontWeight: 700, textDecoration: "none" }}>+ Nuovo cliente</Link>
        </div>
      )}
    </div>
  );
}
