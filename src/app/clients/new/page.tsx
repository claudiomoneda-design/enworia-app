"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

const SETTORI = [
  { value: '', label: '— Seleziona settore —' },
  { value: 'Manifattura', label: 'Manifattura' },
  { value: 'Commercio', label: 'Commercio' },
  { value: 'Servizi', label: 'Servizi' },
  { value: 'Edilizia', label: 'Edilizia' },
  { value: 'Agricoltura', label: 'Agricoltura' },
  { value: 'Altro', label: 'Altro' },
]

const S = {
  label: { fontSize: 13, fontWeight: 500, color: '#1C2B28', display: 'block', marginBottom: 4 } as const,
  input: { width: '100%', border: '0.5px solid #E2EAE8', borderRadius: 6, height: 40, padding: '0 12px', fontSize: 14, color: '#1C2B28', boxSizing: 'border-box' as const, outline: 'none' },
  row: { display: 'flex', gap: 14 } as const,
  aiBadge: { background: '#E8F9EE', color: '#1A8A47', fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 3, marginLeft: 6 } as const,
}

export default function NewClientPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    company_name: '', website: '', responsible_name: '',
    nace_description: '', number_of_employees: '',
    turnover_eur: '', country: 'Italia', reference_year: String(new Date().getFullYear()),
  });
  const [aiFields, setAiFields] = useState<Set<string>>(new Set());
  const [scraping, setScraping] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function set(key: string, val: string) { setForm(prev => ({ ...prev, [key]: val })); }

  async function handleScrape() {
    if (!form.website) return;
    setScraping(true); setError('');
    try {
      let url = form.website.trim();
      if (!url.startsWith('http')) url = 'https://' + url;
      const resp = await fetch('/api/ai/scrape-company', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) });
      const data = await resp.json();
      if (!data.ok) { setError(data.error || 'Errore AI'); setScraping(false); return; }
      const d = data.data;
      const filled = new Set<string>();
      if (d.company_name && !form.company_name) { set('company_name', d.company_name); filled.add('company_name'); }
      if (d.responsible_name) { set('responsible_name', d.responsible_name); filled.add('responsible_name'); }
      if (d.sector_macro) { set('nace_description', d.sector_macro); filled.add('nace_description'); }
      if (d.number_of_employees) { set('number_of_employees', String(d.number_of_employees)); filled.add('number_of_employees'); }
      if (d.turnover_eur) { set('turnover_eur', String(d.turnover_eur)); filled.add('turnover_eur'); }
      if (d.country) { set('country', d.country); filled.add('country'); }
      if (d.nace_description && !d.sector_macro) { set('nace_description', d.nace_description); filled.add('nace_description'); }
      setAiFields(filled);
    } catch { setError('Errore di connessione'); }
    setScraping(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.company_name.trim()) { setError('Nome azienda obbligatorio'); return; }
    setSaving(true); setError('');
    const row = {
      company_name: form.company_name.trim(),
      website: form.website.trim() || null,
      responsible_name: form.responsible_name.trim() || null,
      nace_description: form.nace_description || null,
      number_of_employees: form.number_of_employees ? parseInt(form.number_of_employees) : null,
      turnover_eur: form.turnover_eur ? parseFloat(form.turnover_eur) : null,
      country: form.country || 'Italia',
      reference_year: parseInt(form.reference_year) || new Date().getFullYear(),
      form_status: 'draft',
    };
    const { data, error: err } = await supabase.from('companies').insert([row]).select('id').single();
    if (err) { setError(err.message); setSaving(false); return; }
    router.push(`/clients/${data.id}`);
  }

  function AiBadge({ field }: { field: string }) {
    return aiFields.has(field) ? <span style={S.aiBadge}>AI</span> : null;
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '40px 16px' }}>
      <form onSubmit={handleSubmit} style={{ background: '#fff', borderRadius: 12, border: '0.5px solid #E2EAE8', padding: 32, width: '100%', maxWidth: 560 }}>

        <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: -0.4, color: '#1C2B28', margin: '0 0 4px' }}>Nuovo cliente</h1>
        <p style={{ fontSize: 13, color: '#5A9088', margin: '0 0 24px' }}>Ci vogliono 30 secondi</p>

        {error && <div style={{ background: '#FEF2F2', color: '#C0392B', fontSize: 13, padding: '8px 12px', borderRadius: 6, marginBottom: 16 }}>{error}</div>}

        {/* Nome azienda */}
        <div style={{ marginBottom: 14 }}>
          <label style={S.label}>Nome azienda *<AiBadge field="company_name" /></label>
          <input value={form.company_name} onChange={e => set('company_name', e.target.value)} placeholder="Es. Acme Srl" required
            style={S.input} onFocus={e => { e.target.style.borderColor = '#27AE60'; e.target.style.boxShadow = '0 0 0 2px rgba(39,174,96,0.12)'; }}
            onBlur={e => { e.target.style.borderColor = '#E2EAE8'; e.target.style.boxShadow = 'none'; }} />
        </div>

        {/* Sito web + AI button */}
        <div style={{ marginBottom: 14 }}>
          <label style={S.label}>Sito web</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input value={form.website} onChange={e => set('website', e.target.value)} placeholder="www.azienda.it"
              style={{ ...S.input, flex: 1 }}
              onFocus={e => { e.target.style.borderColor = '#27AE60'; e.target.style.boxShadow = '0 0 0 2px rgba(39,174,96,0.12)'; }}
              onBlur={e => { e.target.style.borderColor = '#E2EAE8'; e.target.style.boxShadow = 'none'; }} />
            <button type="button" onClick={handleScrape} disabled={form.website.trim().length < 3 || scraping}
              style={{ fontSize: 12, fontWeight: 700, padding: '0 14px', borderRadius: 6, border: '1.5px solid #27AE60', color: '#27AE60', background: '#fff', cursor: form.website.trim().length >= 3 && !scraping ? 'pointer' : 'default', whiteSpace: 'nowrap', opacity: form.website.trim().length >= 3 ? 1 : 0.4 }}>
              {scraping ? 'Analisi...' : 'Compila con AI →'}
            </button>
          </div>
        </div>

        {/* Responsabile */}
        <div style={{ marginBottom: 14 }}>
          <label style={S.label}>Responsabile<AiBadge field="responsible_name" /></label>
          <input value={form.responsible_name} onChange={e => set('responsible_name', e.target.value)} placeholder="Chi firma il report"
            style={S.input}
            onFocus={e => { e.target.style.borderColor = '#27AE60'; e.target.style.boxShadow = '0 0 0 2px rgba(39,174,96,0.12)'; }}
            onBlur={e => { e.target.style.borderColor = '#E2EAE8'; e.target.style.boxShadow = 'none'; }} />
        </div>

        {/* Settore */}
        <div style={{ marginBottom: 14 }}>
          <label style={S.label}>Settore<AiBadge field="nace_description" /></label>
          <select value={form.nace_description} onChange={e => set('nace_description', e.target.value)}
            style={{ ...S.input, appearance: 'auto' as const, background: '#fff' }}>
            {SETTORI.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>

        {/* Dipendenti + Fatturato */}
        <div style={{ ...S.row, marginBottom: 14 }}>
          <div style={{ flex: 1 }}>
            <label style={S.label}>Dipendenti<AiBadge field="number_of_employees" /></label>
            <input type="number" min="0" value={form.number_of_employees} onChange={e => set('number_of_employees', e.target.value)} placeholder="10"
              style={S.input}
              onFocus={e => { e.target.style.borderColor = '#27AE60'; e.target.style.boxShadow = '0 0 0 2px rgba(39,174,96,0.12)'; }}
              onBlur={e => { e.target.style.borderColor = '#E2EAE8'; e.target.style.boxShadow = 'none'; }} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={S.label}>Fatturato EUR<AiBadge field="turnover_eur" /> <span style={{ color: '#8AB5AC', fontWeight: 400 }}>(opzionale)</span></label>
            <input type="number" min="0" value={form.turnover_eur} onChange={e => set('turnover_eur', e.target.value)} placeholder="Per indici intensità"
              style={S.input}
              onFocus={e => { e.target.style.borderColor = '#27AE60'; e.target.style.boxShadow = '0 0 0 2px rgba(39,174,96,0.12)'; }}
              onBlur={e => { e.target.style.borderColor = '#E2EAE8'; e.target.style.boxShadow = 'none'; }} />
          </div>
        </div>

        {/* Paese + Anno */}
        <div style={{ ...S.row, marginBottom: 24 }}>
          <div style={{ flex: 1 }}>
            <label style={S.label}>Paese<AiBadge field="country" /></label>
            <input value={form.country} onChange={e => set('country', e.target.value)} style={S.input}
              onFocus={e => { e.target.style.borderColor = '#27AE60'; e.target.style.boxShadow = '0 0 0 2px rgba(39,174,96,0.12)'; }}
              onBlur={e => { e.target.style.borderColor = '#E2EAE8'; e.target.style.boxShadow = 'none'; }} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={S.label}>Anno riferimento</label>
            <input type="number" min="2020" max="2030" value={form.reference_year} onChange={e => set('reference_year', e.target.value)}
              style={S.input}
              onFocus={e => { e.target.style.borderColor = '#27AE60'; e.target.style.boxShadow = '0 0 0 2px rgba(39,174,96,0.12)'; }}
              onBlur={e => { e.target.style.borderColor = '#E2EAE8'; e.target.style.boxShadow = 'none'; }} />
          </div>
        </div>

        {/* Submit */}
        <button type="submit" disabled={saving}
          style={{ width: '100%', background: '#27AE60', color: '#fff', padding: '12px 0', borderRadius: 8, fontSize: 15, fontWeight: 700, border: 'none', cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
          {saving ? 'Creazione...' : 'Crea cliente →'}
        </button>

        <div style={{ textAlign: 'center', marginTop: 10 }}>
          <Link href="/clients" style={{ fontSize: 12, color: '#8AB5AC', textDecoration: 'none' }}>← Torna ai clienti</Link>
        </div>
      </form>
    </div>
  );
}
