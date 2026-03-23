export const LEGAL_FORMS = [
  "Srl",
  "SpA",
  "Sas",
  "Snc",
  "Ditta individuale",
  "Cooperativa",
  "Altro",
] as const;

export const CURRENCIES = [
  { value: "EUR", label: "EUR — Euro" },
  { value: "USD", label: "USD — Dollaro USA" },
  { value: "GBP", label: "GBP — Sterlina" },
  { value: "CHF", label: "CHF — Franco svizzero" },
] as const;

export const VSME_MODULES = [
  { value: "Basic", label: "Basic" },
  { value: "Comprehensive", label: "Comprehensive" },
] as const;

export const REPORTING_PERIMETERS = [
  { value: "individuale", label: "Individuale" },
  { value: "consolidato", label: "Consolidato" },
] as const;

export const COUNTING_METHODS = [
  { value: "fine_periodo", label: "Fine periodo" },
  { value: "media", label: "Media annua" },
] as const;

export const EMPLOYEE_UNITS = [
  { value: "headcount", label: "Headcount" },
  { value: "fte", label: "FTE" },
] as const;

export const EU_COUNTRIES = [
  { value: "IT", label: "Italia" },
  { value: "AT", label: "Austria" },
  { value: "BE", label: "Belgio" },
  { value: "BG", label: "Bulgaria" },
  { value: "CY", label: "Cipro" },
  { value: "HR", label: "Croazia" },
  { value: "DK", label: "Danimarca" },
  { value: "EE", label: "Estonia" },
  { value: "FI", label: "Finlandia" },
  { value: "FR", label: "Francia" },
  { value: "DE", label: "Germania" },
  { value: "GR", label: "Grecia" },
  { value: "IE", label: "Irlanda" },
  { value: "LV", label: "Lettonia" },
  { value: "LT", label: "Lituania" },
  { value: "LU", label: "Lussemburgo" },
  { value: "MT", label: "Malta" },
  { value: "NL", label: "Paesi Bassi" },
  { value: "PL", label: "Polonia" },
  { value: "PT", label: "Portogallo" },
  { value: "CZ", label: "Repubblica Ceca" },
  { value: "RO", label: "Romania" },
  { value: "SK", label: "Slovacchia" },
  { value: "SI", label: "Slovenia" },
  { value: "ES", label: "Spagna" },
  { value: "SE", label: "Svezia" },
  { value: "HU", label: "Ungheria" },
] as const;

export const POLICY_TOPICS = [
  "Clima",
  "Energia",
  "Biodiversità",
  "Acqua",
  "Rifiuti",
  "Diritti lavoratori",
  "Salute e sicurezza",
  "Governance",
  "Anticorruzione",
  "Supply chain",
] as const;

export const EFRAG_TOOLTIPS: Record<string, string> = {
  company_name: "VSME B1.1 — Ragione sociale dell'impresa come da registro delle imprese.",
  reporting_period_start: "VSME B1.2 — Data di inizio del periodo di rendicontazione coperto dal report.",
  reporting_period_end: "VSME B1.2 — Data di fine del periodo di rendicontazione coperto dal report.",
  currency: "VSME B1.3 — Valuta di presentazione utilizzata nel report.",
  vsme_module: "VSME B1.4 — Modulo VSME selezionato per la rendicontazione (Basic o Comprehensive).",
  legal_form: "VSME B1.5 — Forma giuridica dell'impresa.",
  nace_code: "VSME B1.6 — Codice ATECO (NACE Rev.2) dell'attività economica principale.",
  reporting_perimeter: "VSME B1.7 — Se il report copre l'impresa individuale o il gruppo consolidato.",
  total_assets_eur: "VSME B1.8 — Totale dell'attivo patrimoniale alla data di chiusura dell'esercizio.",
  turnover_eur: "VSME B1.9 — Fatturato netto dell'esercizio di riferimento.",
  number_of_employees: "VSME B1.10 — Numero totale di dipendenti alla data specificata.",
  employee_counting_method: "VSME B1.10a — Metodo utilizzato per il conteggio dei dipendenti.",
  employee_unit: "VSME B1.10b — Unità di misura: numero di persone (headcount) o equivalenti a tempo pieno (FTE).",
  primary_country: "VSME B1.11 — Paese in cui l'impresa svolge le proprie operazioni principali.",
  registered_address: "VSME B1.12 — Indirizzo della sede legale/principale dell'impresa.",
  sites: "VSME B1.13 — Elenco delle sedi operative significative dell'impresa.",
  subsidiaries: "VSME B1.14 — Elenco delle società controllate incluse nel perimetro.",
  has_sustainability_policies: "VSME B2.1 — Indicare se l'impresa ha adottato politiche di sostenibilità.",
  policy_topics: "VSME B2.2 — Temi materiali coperti dalle politiche di sostenibilità.",
  has_esg_targets: "VSME B2.3 — Indicare se l'impresa ha definito obiettivi ESG misurabili.",
  esg_targets_description: "VSME B2.4 — Descrizione degli obiettivi ESG e relativi KPI.",
  has_transition_plan: "VSME B2.5 — Indicare se l'impresa ha un piano di transizione climatica.",
  transition_plan_description: "VSME B2.6 — Descrizione del piano di transizione e delle azioni previste.",
  certifications: "VSME B2.7 — Certificazioni ambientali o sociali ottenute dall'impresa.",
  first_report: "VSME B2.8 — Indicare se questo è il primo report di sostenibilità dell'impresa.",
  previous_report_url: "VSME B2.9 — Link al report di sostenibilità precedente, se disponibile.",
};
