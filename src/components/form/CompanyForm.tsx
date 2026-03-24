"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { FormField } from "@/components/ui/FormField";
import { NaceAutocomplete } from "@/components/ui/NaceAutocomplete";
import { useCompanyForm, countCompleted } from "./useCompanyForm";
import {
  LEGAL_FORMS,
  CURRENCIES,
  VSME_MODULES,
  REPORTING_PERIMETERS,
  COUNTING_METHODS,
  EMPLOYEE_UNITS,
  EU_COUNTRIES,
  POLICY_TOPICS,
  EFRAG_TOOLTIPS,
} from "@/data/constants";

interface CompanyFormProps {
  companyId?: string;
  onSaved?: (id: string) => void;
}

export function CompanyForm({ companyId, onSaved }: CompanyFormProps) {
  const form = useCompanyForm(companyId);
  const { data, loading, saving, lastSaved, error, save, updateField } = form;
  const completion = countCompleted(data);
  const [autofillLoading, setAutofillLoading] = useState(false);
  const [autofillBanner, setAutofillBanner] = useState(false);
  const [autofillError, setAutofillError] = useState<string | null>(null);

  async function handleSave() {
    await save();
    if (form.dbId && onSaved) onSaved(form.dbId);
  }

  if (loading) {
    return <p className="text-[var(--muted)] text-sm py-8">Caricamento...</p>;
  }

  return (
    <div className="space-y-6">
      {/* Status bar */}
      <div className="flex items-center justify-between bg-white border border-[var(--border)] rounded-lg px-5 py-3">
        <div className="flex items-center gap-4">
          <div className="text-sm text-[var(--muted)]">
            <span className="font-semibold text-[#1E5C3A]">{completion.filled}</span>
            /{completion.total} campi completati
          </div>
          <div className="h-2 w-40 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-[#1E5C3A] rounded-full transition-all duration-300"
              style={{ width: `${(completion.filled / completion.total) * 100}%` }}
            />
          </div>
        </div>
        <div className="flex items-center gap-3">
          {lastSaved && (
            <span className="text-xs text-[var(--muted)]">
              Salvato alle {lastSaved.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="bg-[#1E5C3A] text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-[#174a2e] transition-colors disabled:opacity-50"
          >
            {saving ? "Salvataggio..." : "Salva bozza"}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md text-sm">
          {error}
        </div>
      )}

      {/* AI Autofill */}
      {!companyId && (
        <Card title="Compila automaticamente dal sito web">
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <label className="text-sm font-medium text-[var(--foreground)] mb-1.5 block">Sito web aziendale</label>
              <input
                value={data.website ?? ""}
                onChange={(e) => updateField("website", e.target.value || null)}
                placeholder="https://www.azienda.it"
                className="w-full border border-[var(--border)] rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1E5C3A]/30 focus:border-[#1E5C3A]"
              />
            </div>
            <button
              type="button"
              disabled={autofillLoading || !data.website}
              onClick={async () => {
                setAutofillLoading(true);
                setAutofillError(null);
                setAutofillBanner(false);
                try {
                  const res = await fetch("/api/company/autofill", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ url: data.website }),
                  });
                  if (!res.ok) {
                    const e = await res.json().catch(() => ({}));
                    throw new Error((e as { error?: string }).error || "Errore");
                  }
                  const ai = await res.json();
                  if (ai.company_name) updateField("company_name", ai.company_name);
                  if (ai.legal_form) updateField("legal_form", ai.legal_form);
                  if (ai.registered_address) updateField("registered_address", ai.registered_address);
                  if (ai.email) updateField("email", ai.email);
                  if (ai.responsible_name) updateField("responsible_name", ai.responsible_name);
                  if (ai.nace_description) updateField("nace_description", ai.nace_description);
                  if (ai.country) updateField("country", ai.country);
                  if (ai.number_of_employees && typeof ai.number_of_employees === "number") {
                    updateField("number_of_employees", ai.number_of_employees);
                  }
                  setAutofillBanner(true);
                } catch (err) {
                  setAutofillError(err instanceof Error ? err.message : "Errore durante l'analisi");
                } finally {
                  setAutofillLoading(false);
                }
              }}
              className="px-4 py-2 rounded-md text-sm font-medium text-white transition-colors disabled:opacity-50 whitespace-nowrap"
              style={{ backgroundColor: autofillLoading ? "#999" : "#1E5C3A" }}
            >
              {autofillLoading ? "Analisi sito in corso..." : "Compila con AI"}
            </button>
          </div>
          {autofillBanner && (
            <div className="mt-3 bg-green-50 border border-green-200 text-green-800 px-4 py-2.5 rounded-md text-sm">
              Dati compilati automaticamente — verifica e correggi se necessario
            </div>
          )}
          {autofillError && (
            <div className="mt-3 bg-red-50 border border-red-200 text-red-700 px-4 py-2.5 rounded-md text-sm">
              {autofillError}
            </div>
          )}
        </Card>
      )}

      {/* B1 — Report Information */}
      <Card title="B1 — Informazioni report">
        <FormField
          label="Nome azienda"
          name="company_name"
          required
          tooltip={EFRAG_TOOLTIPS.company_name}
          value={data.company_name}
          onChange={(e) => updateField("company_name", e.target.value)}
        />
        <div className="grid grid-cols-2 gap-4">
          <FormField
            label="Inizio periodo"
            name="reporting_period_start"
            type="date"
            tooltip={EFRAG_TOOLTIPS.reporting_period_start}
            value={data.reporting_period_start ?? ""}
            onChange={(e) => updateField("reporting_period_start", e.target.value || null)}
          />
          <FormField
            label="Fine periodo"
            name="reporting_period_end"
            type="date"
            tooltip={EFRAG_TOOLTIPS.reporting_period_end}
            value={data.reporting_period_end ?? ""}
            onChange={(e) => updateField("reporting_period_end", e.target.value || null)}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Valuta" name="currency" tooltip={EFRAG_TOOLTIPS.currency}>
            <select
              value={data.currency}
              onChange={(e) => updateField("currency", e.target.value)}
              className="w-full border border-[var(--border)] rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1E5C3A]/30 focus:border-[#1E5C3A]"
            >
              {CURRENCIES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </FormField>
          <FormField label="Modulo VSME" name="vsme_module" tooltip={EFRAG_TOOLTIPS.vsme_module}>
            <select
              value={data.vsme_module}
              onChange={(e) => updateField("vsme_module", e.target.value as "Basic" | "Comprehensive")}
              className="w-full border border-[var(--border)] rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1E5C3A]/30 focus:border-[#1E5C3A]"
            >
              {VSME_MODULES.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </FormField>
        </div>
      </Card>

      {/* B1 — Company Information */}
      <Card title="B1 — Informazioni generali azienda">
        <FormField label="Forma giuridica" name="legal_form" tooltip={EFRAG_TOOLTIPS.legal_form}>
          <select
            value={data.legal_form}
            onChange={(e) => updateField("legal_form", e.target.value)}
            className="w-full border border-[var(--border)] rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1E5C3A]/30 focus:border-[#1E5C3A]"
          >
            <option value="">Seleziona...</option>
            {LEGAL_FORMS.map((f) => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
        </FormField>

        <NaceAutocomplete
          codeValue={data.nace_code}
          descriptionValue={data.nace_description}
          onCodeChange={(code, desc) => {
            updateField("nace_code", code);
            updateField("nace_description", desc);
          }}
          tooltip={EFRAG_TOOLTIPS.nace_code}
        />

        <FormField label="Perimetro rendicontazione" name="reporting_perimeter" tooltip={EFRAG_TOOLTIPS.reporting_perimeter}>
          <select
            value={data.reporting_perimeter ?? ""}
            onChange={(e) => updateField("reporting_perimeter", (e.target.value || null) as typeof data.reporting_perimeter)}
            className="w-full border border-[var(--border)] rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1E5C3A]/30 focus:border-[#1E5C3A]"
          >
            <option value="">Seleziona...</option>
            {REPORTING_PERIMETERS.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
        </FormField>

        <div className="grid grid-cols-2 gap-4">
          <FormField
            label="Totale attivo (EUR)"
            name="total_assets_eur"
            type="number"
            tooltip={EFRAG_TOOLTIPS.total_assets_eur}
            value={data.total_assets_eur ?? ""}
            onChange={(e) => updateField("total_assets_eur", e.target.value ? parseFloat(e.target.value) : null)}
            step="0.01"
            min={0}
          />
          <FormField
            label="Fatturato (EUR)"
            name="turnover_eur"
            type="number"
            tooltip={EFRAG_TOOLTIPS.turnover_eur}
            value={data.turnover_eur ?? ""}
            onChange={(e) => updateField("turnover_eur", e.target.value ? parseFloat(e.target.value) : null)}
            step="0.01"
            min={0}
          />
        </div>

        <div className="grid grid-cols-3 gap-4">
          <FormField
            label="Numero dipendenti"
            name="number_of_employees"
            type="number"
            required
            tooltip={EFRAG_TOOLTIPS.number_of_employees}
            value={data.number_of_employees ?? ""}
            onChange={(e) => updateField("number_of_employees", e.target.value ? parseInt(e.target.value) : null)}
            min={0}
          />
          <FormField label="Metodo conteggio" name="employee_counting_method" tooltip={EFRAG_TOOLTIPS.employee_counting_method}>
            <select
              value={data.employee_counting_method}
              onChange={(e) => updateField("employee_counting_method", e.target.value as typeof data.employee_counting_method)}
              className="w-full border border-[var(--border)] rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1E5C3A]/30 focus:border-[#1E5C3A]"
            >
              {COUNTING_METHODS.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </FormField>
          <FormField label="Unità conteggio" name="employee_unit" tooltip={EFRAG_TOOLTIPS.employee_unit}>
            <select
              value={data.employee_unit}
              onChange={(e) => updateField("employee_unit", e.target.value as typeof data.employee_unit)}
              className="w-full border border-[var(--border)] rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1E5C3A]/30 focus:border-[#1E5C3A]"
            >
              {EMPLOYEE_UNITS.map((u) => (
                <option key={u.value} value={u.value}>{u.label}</option>
              ))}
            </select>
          </FormField>
        </div>

        <FormField label="Paese operazioni primarie" name="primary_country" tooltip={EFRAG_TOOLTIPS.primary_country}>
          <select
            value={data.primary_country}
            onChange={(e) => updateField("primary_country", e.target.value)}
            className="w-full border border-[var(--border)] rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1E5C3A]/30 focus:border-[#1E5C3A]"
          >
            {EU_COUNTRIES.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </FormField>

        <FormField label="Indirizzo sede principale" name="registered_address" tooltip={EFRAG_TOOLTIPS.registered_address}>
          <textarea
            value={data.registered_address}
            onChange={(e) => updateField("registered_address", e.target.value)}
            rows={2}
            className="w-full border border-[var(--border)] rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1E5C3A]/30 focus:border-[#1E5C3A] resize-none"
          />
        </FormField>

        <FormField label="Responsabile ESG / Inventario GHG" name="responsible_name">
          <input
            value={data.responsible_name ?? ""}
            onChange={(e) => updateField("responsible_name", e.target.value || null)}
            placeholder="Nome e cognome del responsabile"
            className="w-full border border-[var(--border)] rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1E5C3A]/30 focus:border-[#1E5C3A]"
          />
        </FormField>

        <div className="grid grid-cols-2 gap-4">
          <FormField label="Sito web" name="website">
            <input
              value={data.website ?? ""}
              onChange={(e) => updateField("website", e.target.value || null)}
              placeholder="https://www.azienda.it"
              className="w-full border border-[var(--border)] rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1E5C3A]/30 focus:border-[#1E5C3A]"
            />
          </FormField>
          <FormField label="Email aziendale" name="email">
            <input
              type="email"
              value={data.email ?? ""}
              onChange={(e) => updateField("email", e.target.value || null)}
              placeholder="info@azienda.it"
              className="w-full border border-[var(--border)] rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1E5C3A]/30 focus:border-[#1E5C3A]"
            />
          </FormField>
        </div>
      </Card>

      {/* B1 — Sites */}
      <Card title="B1 — Sedi operative">
        <p className="text-xs text-[var(--muted)] -mt-1 mb-2">
          {EFRAG_TOOLTIPS.sites}
        </p>
        {data.sites.map((site, i) => (
          <div key={i} className="grid grid-cols-[1fr_120px_1fr_140px_auto] gap-3 items-end">
            <FormField label={i === 0 ? "Indirizzo" : ""} name="">
              <input
                value={site.address}
                onChange={(e) => form.updateSite(i, "address", e.target.value)}
                placeholder="Indirizzo"
                className="w-full border border-[var(--border)] rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1E5C3A]/30 focus:border-[#1E5C3A]"
              />
            </FormField>
            <FormField label={i === 0 ? "CAP" : ""} name="">
              <input
                value={site.postal_code}
                onChange={(e) => form.updateSite(i, "postal_code", e.target.value)}
                placeholder="CAP"
                className="w-full border border-[var(--border)] rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1E5C3A]/30 focus:border-[#1E5C3A]"
              />
            </FormField>
            <FormField label={i === 0 ? "Città" : ""} name="">
              <input
                value={site.city}
                onChange={(e) => form.updateSite(i, "city", e.target.value)}
                placeholder="Città"
                className="w-full border border-[var(--border)] rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1E5C3A]/30 focus:border-[#1E5C3A]"
              />
            </FormField>
            <FormField label={i === 0 ? "Paese" : ""} name="">
              <select
                value={site.country}
                onChange={(e) => form.updateSite(i, "country", e.target.value)}
                className="w-full border border-[var(--border)] rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1E5C3A]/30 focus:border-[#1E5C3A]"
              >
                {EU_COUNTRIES.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </FormField>
            <button
              type="button"
              onClick={() => form.removeSite(i)}
              className="text-red-400 hover:text-red-600 text-xs pb-2.5 transition-colors"
            >
              Rimuovi
            </button>
          </div>
        ))}
        {data.sites.length < 10 && (
          <button
            type="button"
            onClick={form.addSite}
            className="text-[#1E5C3A] text-sm font-medium hover:underline"
          >
            + Aggiungi sede
          </button>
        )}
        {data.sites.length === 0 && (
          <p className="text-xs text-[var(--muted)]">Nessuna sede aggiunta.</p>
        )}
      </Card>

      {/* B1 — Subsidiaries */}
      <Card title="B1 — Sussidiarie">
        <p className="text-xs text-[var(--muted)] -mt-1 mb-2">
          {EFRAG_TOOLTIPS.subsidiaries}
        </p>
        {data.subsidiaries.map((sub, i) => (
          <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-3 items-end">
            <FormField label={i === 0 ? "Nome" : ""} name="">
              <input
                value={sub.name}
                onChange={(e) => form.updateSubsidiary(i, "name", e.target.value)}
                placeholder="Nome sussidiaria"
                className="w-full border border-[var(--border)] rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1E5C3A]/30 focus:border-[#1E5C3A]"
              />
            </FormField>
            <FormField label={i === 0 ? "Indirizzo registrato" : ""} name="">
              <input
                value={sub.registered_address}
                onChange={(e) => form.updateSubsidiary(i, "registered_address", e.target.value)}
                placeholder="Indirizzo"
                className="w-full border border-[var(--border)] rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1E5C3A]/30 focus:border-[#1E5C3A]"
              />
            </FormField>
            <button
              type="button"
              onClick={() => form.removeSubsidiary(i)}
              className="text-red-400 hover:text-red-600 text-xs pb-2.5 transition-colors"
            >
              Rimuovi
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={form.addSubsidiary}
          className="text-[#1E5C3A] text-sm font-medium hover:underline"
        >
          + Aggiungi sussidiaria
        </button>
        {data.subsidiaries.length === 0 && (
          <p className="text-xs text-[var(--muted)]">Nessuna sussidiaria aggiunta.</p>
        )}
      </Card>

      {/* B2 — ESG Policies */}
      <Card title="B2 — Politiche ESG">
        <FormField label="Ha politiche di sostenibilità?" name="has_sustainability_policies" tooltip={EFRAG_TOOLTIPS.has_sustainability_policies}>
          <div className="flex gap-4 pt-1">
            {([
              [true, "Sì"],
              [false, "No"],
            ] as const).map(([val, label]) => (
              <label key={label} className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="radio"
                  name="has_sustainability_policies"
                  checked={data.has_sustainability_policies === val}
                  onChange={() => updateField("has_sustainability_policies", val)}
                  className="accent-[#1E5C3A]"
                />
                {label}
              </label>
            ))}
          </div>
        </FormField>

        {data.has_sustainability_policies && (
          <FormField label="Temi coperti" name="policy_topics" tooltip={EFRAG_TOOLTIPS.policy_topics}>
            <div className="flex flex-wrap gap-2 pt-1">
              {POLICY_TOPICS.map((topic) => {
                const active = data.policy_topics.includes(topic);
                return (
                  <button
                    key={topic}
                    type="button"
                    onClick={() => form.togglePolicyTopic(topic)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                      active
                        ? "bg-[#1E5C3A] text-white border-[#1E5C3A]"
                        : "bg-white text-[var(--muted)] border-[var(--border)] hover:border-[#1E5C3A] hover:text-[#1E5C3A]"
                    }`}
                  >
                    {topic}
                  </button>
                );
              })}
            </div>
          </FormField>
        )}

        <FormField label="Ha obiettivi ESG quantificati?" name="has_esg_targets" tooltip={EFRAG_TOOLTIPS.has_esg_targets}>
          <div className="flex gap-4 pt-1">
            {([
              [true, "Sì"],
              [false, "No"],
            ] as const).map(([val, label]) => (
              <label key={label} className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="radio"
                  name="has_esg_targets"
                  checked={data.has_esg_targets === val}
                  onChange={() => updateField("has_esg_targets", val)}
                  className="accent-[#1E5C3A]"
                />
                {label}
              </label>
            ))}
          </div>
        </FormField>

        {data.has_esg_targets && (
          <FormField label="Descrizione obiettivi" name="esg_targets_description" tooltip={EFRAG_TOOLTIPS.esg_targets_description}>
            <textarea
              value={data.esg_targets_description ?? ""}
              onChange={(e) => updateField("esg_targets_description", e.target.value || null)}
              rows={3}
              placeholder="Descrivi gli obiettivi ESG e i relativi KPI..."
              className="w-full border border-[var(--border)] rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1E5C3A]/30 focus:border-[#1E5C3A] resize-none"
            />
          </FormField>
        )}

        <FormField label="Ha un piano di transizione?" name="has_transition_plan" tooltip={EFRAG_TOOLTIPS.has_transition_plan}>
          <div className="flex gap-4 pt-1">
            {([
              [true, "Sì"],
              [false, "No"],
            ] as const).map(([val, label]) => (
              <label key={label} className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="radio"
                  name="has_transition_plan"
                  checked={data.has_transition_plan === val}
                  onChange={() => updateField("has_transition_plan", val)}
                  className="accent-[#1E5C3A]"
                />
                {label}
              </label>
            ))}
          </div>
        </FormField>

        {data.has_transition_plan && (
          <FormField label="Descrizione piano" name="transition_plan_description" tooltip={EFRAG_TOOLTIPS.transition_plan_description}>
            <textarea
              value={data.transition_plan_description ?? ""}
              onChange={(e) => updateField("transition_plan_description", e.target.value || null)}
              rows={3}
              placeholder="Descrivi il piano di transizione climatica..."
              className="w-full border border-[var(--border)] rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1E5C3A]/30 focus:border-[#1E5C3A] resize-none"
            />
          </FormField>
        )}
      </Card>

      {/* B2 — Certifications */}
      <Card title="B2 — Certificazioni">
        <p className="text-xs text-[var(--muted)] -mt-1 mb-2">
          {EFRAG_TOOLTIPS.certifications}
        </p>
        {data.certifications.map((cert, i) => (
          <div key={i} className="flex gap-3 items-center">
            <input
              value={cert}
              onChange={(e) => form.updateCertification(i, e.target.value)}
              placeholder="es. ISO 14001, SA8000..."
              className="flex-1 border border-[var(--border)] rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1E5C3A]/30 focus:border-[#1E5C3A]"
            />
            <button
              type="button"
              onClick={() => form.removeCertification(i)}
              className="text-red-400 hover:text-red-600 text-xs transition-colors"
            >
              Rimuovi
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={form.addCertification}
          className="text-[#1E5C3A] text-sm font-medium hover:underline"
        >
          + Aggiungi certificazione
        </button>
      </Card>

      {/* B2 — Previous report */}
      <Card title="B2 — Informazioni report precedente">
        <FormField label="Primo report di sostenibilità?" name="first_report" tooltip={EFRAG_TOOLTIPS.first_report}>
          <div className="flex gap-4 pt-1">
            {([
              [true, "Sì"],
              [false, "No"],
            ] as const).map(([val, label]) => (
              <label key={label} className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="radio"
                  name="first_report"
                  checked={data.first_report === val}
                  onChange={() => updateField("first_report", val)}
                  className="accent-[#1E5C3A]"
                />
                {label}
              </label>
            ))}
          </div>
        </FormField>

        {!data.first_report && (
          <FormField
            label="URL report precedente"
            name="previous_report_url"
            tooltip={EFRAG_TOOLTIPS.previous_report_url}
            value={data.previous_report_url ?? ""}
            onChange={(e) => updateField("previous_report_url", e.target.value || null)}
            placeholder="https://..."
          />
        )}
      </Card>

      {/* Bottom save */}
      <div className="flex items-center justify-between pt-2 pb-8">
        <div className="text-xs text-[var(--muted)]">
          Il salvataggio automatico avviene ogni 30 secondi.
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="bg-[#1E5C3A] text-white px-6 py-2.5 rounded-md text-sm font-medium hover:bg-[#174a2e] transition-colors disabled:opacity-50"
        >
          {saving ? "Salvataggio..." : "Salva bozza"}
        </button>
      </div>
    </div>
  );
}
