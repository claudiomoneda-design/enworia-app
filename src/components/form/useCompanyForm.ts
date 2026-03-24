"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase";
import type { Company, Site, Subsidiary } from "@/types/database";

const AUTOSAVE_INTERVAL = 30000;

const EMPTY_SITE: Site = { address: "", postal_code: "", city: "", country: "IT" };
const EMPTY_SUBSIDIARY: Subsidiary = { name: "", registered_address: "" };

type FormData = Omit<Company, "id" | "created_at" | "updated_at">;

function defaultFormData(): FormData {
  return {
    consultant_id: null,
    company_name: "",
    legal_form: "",
    nace_code: "",
    nace_description: "",
    number_of_employees: null,
    employee_counting_method: "fine_periodo",
    employee_unit: "headcount",
    turnover_eur: null,
    total_assets_eur: null,
    reference_year: new Date().getFullYear() - 1,
    country: "Italia",
    registered_address: "",
    reporting_period_start: null,
    reporting_period_end: null,
    currency: "EUR",
    vsme_module: "Basic",
    reporting_perimeter: null,
    primary_country: "IT",
    sites: [],
    subsidiaries: [],
    has_sustainability_policies: null,
    policy_topics: [],
    has_esg_targets: null,
    esg_targets_description: null,
    has_transition_plan: null,
    transition_plan_description: null,
    certifications: [],
    first_report: true,
    previous_report_url: null,
    responsible_name: null,
    website: null,
    email: null,
    form_status: "draft",
    last_saved_at: null,
  };
}

const TRACKED_FIELDS = [
  "company_name",
  "reporting_period_start",
  "reporting_period_end",
  "legal_form",
  "nace_code",
  "number_of_employees",
  "employee_counting_method",
  "employee_unit",
  "primary_country",
  "registered_address",
  "reporting_perimeter",
  "has_sustainability_policies",
  "has_esg_targets",
  "has_transition_plan",
  "first_report",
] as const;

export function countCompleted(data: FormData): { filled: number; total: number } {
  let filled = 0;
  const total = TRACKED_FIELDS.length;
  for (const key of TRACKED_FIELDS) {
    const v = data[key];
    if (v !== null && v !== undefined && v !== "") filled++;
  }
  return { filled, total };
}

export function useCompanyForm(companyId?: string) {
  const [data, setData] = useState<FormData>(defaultFormData);
  const [loading, setLoading] = useState(!!companyId);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dbId, setDbId] = useState<string | null>(companyId ?? null);
  const dirty = useRef(false);

  // Load existing company
  useEffect(() => {
    if (!companyId) {
      setLoading(false);
      return;
    }
    (async () => {
      const { data: row, error } = await supabase
        .from("companies")
        .select("*")
        .eq("id", companyId)
        .single();
      if (error || !row) {
        setError("Impossibile caricare il cliente.");
        setLoading(false);
        return;
      }
      const company = row as Company;
      setDbId(company.id);
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { id: _rowId, created_at: _c, updated_at: _u, ...rest } = company;
      setData(rest as FormData);
      setLoading(false);
    })();
  }, [companyId]);

  const save = useCallback(async () => {
    setSaving(true);
    setError(null);
    const payload = { ...data, last_saved_at: new Date().toISOString() };

    let err;
    if (dbId) {
      const res = await supabase.from("companies").update(payload).eq("id", dbId);
      err = res.error;
    } else {
      const res = await supabase.from("companies").insert(payload).select("id").single();
      err = res.error;
      if (!err && res.data) setDbId(res.data.id);
    }

    if (err) {
      setError(err.message);
    } else {
      setLastSaved(new Date());
      dirty.current = false;
    }
    setSaving(false);
  }, [data, dbId]);

  // Autosave every 30s
  useEffect(() => {
    const interval = setInterval(() => {
      if (dirty.current) save();
    }, AUTOSAVE_INTERVAL);
    return () => clearInterval(interval);
  }, [save]);

  function updateField<K extends keyof FormData>(key: K, value: FormData[K]) {
    setData((prev) => ({ ...prev, [key]: value }));
    dirty.current = true;
  }

  // Sites helpers
  function addSite() {
    if (data.sites.length >= 10) return;
    updateField("sites", [...data.sites, { ...EMPTY_SITE }]);
  }
  function updateSite(index: number, field: keyof Site, value: string) {
    const next = data.sites.map((s, i) => (i === index ? { ...s, [field]: value } : s));
    updateField("sites", next);
  }
  function removeSite(index: number) {
    updateField("sites", data.sites.filter((_, i) => i !== index));
  }

  // Subsidiaries helpers
  function addSubsidiary() {
    updateField("subsidiaries", [...data.subsidiaries, { ...EMPTY_SUBSIDIARY }]);
  }
  function updateSubsidiary(index: number, field: keyof Subsidiary, value: string) {
    const next = data.subsidiaries.map((s, i) => (i === index ? { ...s, [field]: value } : s));
    updateField("subsidiaries", next);
  }
  function removeSubsidiary(index: number) {
    updateField("subsidiaries", data.subsidiaries.filter((_, i) => i !== index));
  }

  // Certifications helpers
  function addCertification() {
    updateField("certifications", [...data.certifications, ""]);
  }
  function updateCertification(index: number, value: string) {
    const next = data.certifications.map((c, i) => (i === index ? value : c));
    updateField("certifications", next);
  }
  function removeCertification(index: number) {
    updateField("certifications", data.certifications.filter((_, i) => i !== index));
  }

  // Policy topics toggle
  function togglePolicyTopic(topic: string) {
    const current = data.policy_topics;
    const next = current.includes(topic)
      ? current.filter((t) => t !== topic)
      : [...current, topic];
    updateField("policy_topics", next);
  }

  return {
    data,
    loading,
    saving,
    lastSaved,
    error,
    dbId,
    save,
    updateField,
    addSite,
    updateSite,
    removeSite,
    addSubsidiary,
    updateSubsidiary,
    removeSubsidiary,
    addCertification,
    updateCertification,
    removeCertification,
    togglePolicyTopic,
  };
}
