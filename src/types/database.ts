export type CountingMethod = "fine_periodo" | "media";
export type EmployeeUnit = "headcount" | "fte";
export type ReportingPerimeter = "individuale" | "consolidato";
export type VsmeModule = "Basic" | "Comprehensive";
export type FormStatus = "draft" | "completed";

export interface Site {
  address: string;
  postal_code: string;
  city: string;
  country: string;
}

export interface Subsidiary {
  name: string;
  registered_address: string;
}

export interface Company {
  id: string;
  consultant_id: string | null;
  company_name: string;
  legal_form: string;
  nace_code: string;
  nace_description: string;
  number_of_employees: number | null;
  employee_counting_method: CountingMethod;
  employee_unit: EmployeeUnit;
  turnover_eur: number | null;
  total_assets_eur: number | null;
  reference_year: number;
  country: string;
  registered_address: string;
  reporting_period_start: string | null;
  reporting_period_end: string | null;
  currency: string;
  vsme_module: VsmeModule;
  reporting_perimeter: ReportingPerimeter | null;
  primary_country: string;
  sites: Site[];
  subsidiaries: Subsidiary[];
  has_sustainability_policies: boolean | null;
  policy_topics: string[];
  has_esg_targets: boolean | null;
  esg_targets_description: string | null;
  has_transition_plan: boolean | null;
  transition_plan_description: string | null;
  certifications: string[];
  first_report: boolean;
  previous_report_url: string | null;
  form_status: FormStatus;
  last_saved_at: string | null;
  created_at: string;
  updated_at: string;
}

export type CompanyInsert = Omit<Company, "id" | "created_at" | "updated_at">;
