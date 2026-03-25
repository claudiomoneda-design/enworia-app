"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useCompanyForm } from "@/components/form/useCompanyForm";
import {
  LEGAL_FORMS, CURRENCIES, VSME_MODULES, REPORTING_PERIMETERS,
  COUNTING_METHODS, EMPLOYEE_UNITS, EU_COUNTRIES, POLICY_TOPICS,
} from "@/data/constants";

// ── Accordion ───────────────────────────────────────────────────────────────
function Accordion({ title, defaultOpen, children }: { title: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen || false);
  return (
    <div style={{ borderBottom: "0.5px solid #E2EAE8" }}>
      <button type="button" onClick={() => setOpen(!open)}
        style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 0", background: "none", border: "none", cursor: "pointer" }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: "#1C2B28" }}>{open ? "▼" : "▶"} {title}</span>
      </button>
      {open && <div style={{ paddingBottom: 16 }}>{children}</div>}
    </div>
  );
}

// ── Field helpers ───────────────────────────────────────────────────────────
const S = {
  label: { fontSize: 12, fontWeight: 500, color: "#1C2B28", display: "block" as const, marginBottom: 3 },
  input: { width: "100%", border: "0.5px solid #E2EAE8", borderRadius: 6, height: 38, padding: "0 10px", fontSize: 13, color: "#1C2B28", boxSizing: "border-box" as const },
  select: { width: "100%", border: "0.5px solid #E2EAE8", borderRadius: 6, height: 38, padding: "0 10px", fontSize: 13, color: "#1C2B28", boxSizing: "border-box" as const, background: "#fff" },
  textarea: { width: "100%", border: "0.5px solid #E2EAE8", borderRadius: 6, padding: "8px 10px", fontSize: 13, color: "#1C2B28", boxSizing: "border-box" as const, minHeight: 60, resize: "vertical" as const },
  row: { display: "flex" as const, gap: 12, marginBottom: 12 },
  field: { flex: 1, marginBottom: 12 },
  check: { display: "flex" as const, alignItems: "center" as const, gap: 6, fontSize: 13, cursor: "pointer" as const, marginBottom: 8 },
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div style={S.field}><label style={S.label}>{label}</label>{children}</div>;
}

export default function VsmeBasicNewPage() {
  const { id: companyId } = useParams() as { id: string };
  const form = useCompanyForm(companyId);
  const { data, loading, saving, updateField, save } = form;
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    await save();
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  if (loading) return <p style={{ color: "#8AB5AC", padding: 32 }}>Caricamento...</p>;

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "24px 0" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, letterSpacing: -0.4, color: "#1C2B28", margin: 0 }}>VSME Basic — Dati azienda</h1>
          <p style={{ fontSize: 13, color: "#5A9088", margin: "4px 0 0" }}>B1 Informazioni generali · VSME Digital Template EFRAG v1.2.0</p>
        </div>
        <Link href={`/clients/${companyId}`} style={{ fontSize: 13, color: "#5A9088", textDecoration: "none" }}>← Torna al cliente</Link>
      </div>

      <div style={{ background: "#fff", borderRadius: 12, border: "0.5px solid #E2EAE8", padding: "0 24px" }}>

        {/* ── Accordion 1: Report info ── */}
        <Accordion title="Informazioni report" defaultOpen>
          <div style={S.row}>
            <Field label="Periodo inizio">
              <input type="date" value={data.reporting_period_start ?? ""} onChange={e => updateField("reporting_period_start", e.target.value || null)} style={S.input} />
            </Field>
            <Field label="Periodo fine">
              <input type="date" value={data.reporting_period_end ?? ""} onChange={e => updateField("reporting_period_end", e.target.value || null)} style={S.input} />
            </Field>
          </div>
          <div style={S.row}>
            <Field label="Valuta">
              <select value={data.currency} onChange={e => updateField("currency", e.target.value)} style={S.select}>
                {CURRENCIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </Field>
            <Field label="Modulo VSME">
              <select value={data.vsme_module} onChange={e => updateField("vsme_module", e.target.value as "Basic" | "Comprehensive")} style={S.select}>
                {VSME_MODULES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Perimetro di rendicontazione">
            <select value={data.reporting_perimeter ?? ""} onChange={e => updateField("reporting_perimeter", (e.target.value || null) as typeof data.reporting_perimeter)} style={S.select}>
              <option value="">— Seleziona —</option>
              {REPORTING_PERIMETERS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </Field>
        </Accordion>

        {/* ── Accordion 2: Economic data ── */}
        <Accordion title="Dati economici">
          <div style={S.row}>
            <Field label="Forma giuridica">
              <select value={data.legal_form} onChange={e => updateField("legal_form", e.target.value)} style={S.select}>
                <option value="">—</option>
                {LEGAL_FORMS.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </Field>
            <Field label="Totale attivo (EUR)">
              <input type="number" value={data.total_assets_eur ?? ""} onChange={e => updateField("total_assets_eur", e.target.value ? parseFloat(e.target.value) : null)} style={S.input} placeholder="Stato patrimoniale" />
            </Field>
          </div>
          <div style={S.row}>
            <Field label="Fatturato (EUR)">
              <input type="number" value={data.turnover_eur ?? ""} onChange={e => updateField("turnover_eur", e.target.value ? parseFloat(e.target.value) : null)} style={S.input} />
            </Field>
            <Field label="Dipendenti">
              <input type="number" value={data.number_of_employees ?? ""} onChange={e => updateField("number_of_employees", e.target.value ? parseInt(e.target.value) : null)} style={S.input} />
            </Field>
          </div>
          <div style={S.row}>
            <Field label="Metodo conteggio">
              <select value={data.employee_counting_method} onChange={e => updateField("employee_counting_method", e.target.value as typeof data.employee_counting_method)} style={S.select}>
                {COUNTING_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </Field>
            <Field label="Unità dipendenti">
              <select value={data.employee_unit} onChange={e => updateField("employee_unit", e.target.value as typeof data.employee_unit)} style={S.select}>
                {EMPLOYEE_UNITS.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
              </select>
            </Field>
          </div>
        </Accordion>

        {/* ── Accordion 3: Organization ── */}
        <Accordion title="Struttura organizzativa">
          <Field label="Sede legale">
            <input value={data.registered_address ?? ""} onChange={e => updateField("registered_address", e.target.value)} style={S.input} placeholder="Indirizzo completo" />
          </Field>
          <Field label="Paese principale">
            <select value={data.primary_country} onChange={e => updateField("primary_country", e.target.value)} style={S.select}>
              {EU_COUNTRIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </Field>
          <Field label="Siti operativi (JSON)">
            <textarea value={typeof data.sites === "string" ? data.sites : JSON.stringify(data.sites ?? [], null, 2)} onChange={e => { try { updateField("sites", JSON.parse(e.target.value)); } catch { /* wait for valid json */ } }} style={S.textarea} placeholder='[{"name": "Sede Milano", "address": "..."}]' />
          </Field>
          <Field label="Società controllate (JSON)">
            <textarea value={typeof data.subsidiaries === "string" ? data.subsidiaries : JSON.stringify(data.subsidiaries ?? [], null, 2)} onChange={e => { try { updateField("subsidiaries", JSON.parse(e.target.value)); } catch { /* wait */ } }} style={S.textarea} placeholder='[{"name": "Filiale Roma"}]' />
          </Field>
        </Accordion>

        {/* ── Accordion 4: ESG Policies ── */}
        <Accordion title="Politiche ESG">
          <label style={S.check}>
            <input type="checkbox" checked={!!data.has_sustainability_policies} onChange={e => updateField("has_sustainability_policies", e.target.checked)} />
            L&apos;azienda ha politiche di sostenibilità
          </label>
          {data.has_sustainability_policies && (
            <Field label="Tematiche coperte">
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {POLICY_TOPICS.map(t => {
                  const selected = (data.policy_topics || []).includes(t);
                  return (
                    <button key={t} type="button"
                      onClick={() => {
                        const cur = data.policy_topics || [];
                        updateField("policy_topics", selected ? cur.filter((x: string) => x !== t) : [...cur, t]);
                      }}
                      style={{ fontSize: 11, padding: "4px 10px", borderRadius: 4, border: "0.5px solid #E2EAE8", background: selected ? "#E8F9EE" : "#fff", color: selected ? "#1A8A47" : "#5A9088", cursor: "pointer", fontWeight: selected ? 600 : 400 }}>
                      {t}
                    </button>
                  );
                })}
              </div>
            </Field>
          )}
          <label style={S.check}>
            <input type="checkbox" checked={!!data.has_esg_targets} onChange={e => updateField("has_esg_targets", e.target.checked)} />
            L&apos;azienda ha obiettivi ESG
          </label>
          {data.has_esg_targets && (
            <Field label="Descrizione obiettivi">
              <textarea value={data.esg_targets_description ?? ""} onChange={e => updateField("esg_targets_description", e.target.value || null)} style={S.textarea} />
            </Field>
          )}
          <label style={S.check}>
            <input type="checkbox" checked={!!data.has_transition_plan} onChange={e => updateField("has_transition_plan", e.target.checked)} />
            L&apos;azienda ha un piano di transizione
          </label>
          {data.has_transition_plan && (
            <Field label="Descrizione piano">
              <textarea value={data.transition_plan_description ?? ""} onChange={e => updateField("transition_plan_description", e.target.value || null)} style={S.textarea} />
            </Field>
          )}
          <Field label="Certificazioni">
            <textarea value={typeof data.certifications === "string" ? data.certifications : JSON.stringify(data.certifications ?? [], null, 2)} onChange={e => { try { updateField("certifications", JSON.parse(e.target.value)); } catch { /* wait */ } }} style={S.textarea} placeholder='["ISO 14001", "ISO 9001"]' />
          </Field>
        </Accordion>

        {/* ── Accordion 5: Report history ── */}
        <Accordion title="Storico report">
          <label style={S.check}>
            <input type="checkbox" checked={!!data.first_report} onChange={e => updateField("first_report", e.target.checked)} />
            Questo è il primo report VSME dell&apos;azienda
          </label>
          <Field label="URL report precedente">
            <input value={data.previous_report_url ?? ""} onChange={e => updateField("previous_report_url", e.target.value || null)} style={S.input} placeholder="https://..." />
          </Field>
        </Accordion>
      </div>

      {/* Save */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16 }}>
        <Link href={`/clients/${companyId}`} style={{ fontSize: 13, color: "#5A9088", textDecoration: "none" }}>← Torna al cliente</Link>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {saved && <span style={{ fontSize: 12, color: "#1A8A47" }}>✓ Salvato</span>}
          <button onClick={handleSave} disabled={saving}
            style={{ background: "#27AE60", color: "#fff", padding: "10px 24px", borderRadius: 8, fontSize: 14, fontWeight: 700, border: "none", cursor: "pointer", opacity: saving ? 0.6 : 1 }}>
            {saving ? "Salvataggio..." : "Salva dati azienda"}
          </button>
        </div>
      </div>
    </div>
  );
}
