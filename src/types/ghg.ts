// GHG Module Types

export type GhgReportStatus = "draft" | "completed";
export type PerimeterType = "individuale" | "consolidato";
export type DataQuality = "dato_misurato" | "bolletta" | "contatore" | "stima_storici" | "stima_ragionata" | "stima_benchmark";
export type EfMode = "standard" | "custom";
export type GasUnit = "sm3" | "mwh";
export type FuelType = "benzina" | "gasolio" | "gpl" | "metano" | "electric_car_it" | "hybrid_petrol_car_avg" | "hybrid_diesel_car_avg" | "mild_hybrid_petrol_avg" | "mild_hybrid_diesel_avg" | "forklift_diesel" | "forklift_lpg" | "generator_diesel" | "excavator_diesel" | "truck_diesel" | "van_diesel" | "van_petrol";
export type UsageCategory = "aziendale" | "fringe_benefit" | "privato";
export type ContractType = "maggior_tutela" | "mercato_libero" | "garanzia_origine" | "ppa";
export type MarketInstrument = "none" | "go" | "rec" | "i_rec" | "ppa" | "supplier_rate";
export type ConsolidationApproach = "operational" | "financial" | "equity_share";
export type EntityControlType = "operational" | "financial" | "both";

export interface OrganizationalEntity {
  name: string;
  ownership_pct: number;
  control_type: EntityControlType;
  included: boolean;
  exclusion_reason: string;
}

export const DATA_QUALITY_UNCERTAINTY: Record<DataQuality, number> = {
  dato_misurato: 0.5,
  bolletta: 1,
  contatore: 2,
  stima_storici: 10,
  stima_ragionata: 20,
  stima_benchmark: 25,
};

export interface GhgReport {
  id: string;
  company_id: string;
  year: number;
  perimeter: PerimeterType;
  included_entities: string;
  notes: string;
  status: GhgReportStatus;
  scope1_total: number | null;
  scope2_lb_total: number | null;
  scope2_mb_total: number | null;
  total_co2eq: number | null;
  created_at: string;
  updated_at: string;
}

export interface Scope1Source {
  id: string;
  report_id: string;
  source_type: "gas_naturale" | "carburante" | "hfc";
  site_name: string | null;
  monthly_values: number[];
  unit: GasUnit | null;
  plate: string | null;
  fuel_type: FuelType | null;
  liters_annual: number | null;
  km_annual: number | null;
  usage_category: UsageCategory | null;
  gas_name: string | null;
  kg_annual: number | null;
  data_quality: DataQuality;
  ef_mode: EfMode;
  ef_value: number | null;
  ef_unit: string | null;
  ef_reference: string | null;
  ef_uncertainty: number | null;
  data_uncertainty: number | null;
  tco2e: number | null;
  combined_uncertainty: number | null;
  created_at: string;
}

export interface Scope2Source {
  id: string;
  report_id: string;
  pod_code: string;
  contract_type: ContractType;
  monthly_values: number[];
  fv_self_consumed: number | null;
  data_quality: DataQuality;
  ef_mode: EfMode;
  ef_value: number | null;
  ef_unit: string | null;
  ef_reference: string | null;
  ef_uncertainty: number | null;
  data_uncertainty: number | null;
  tco2e: number | null;
  combined_uncertainty: number | null;
  created_at: string;
}

export interface EmissionFactor {
  id: string;
  category: string;
  subcategory: string;
  unit: string;
  factor_value: number;
  uncertainty_pct: number;
  source: string;
  year: number;
}

// Gas breakdown — ISO 14064-1 §6.2
export interface GasBreakdown {
  co2_fossil: number;
  ch4: number;
  n2o: number;
  hfc: number;
  co2_biogenic: number;
  total_co2eq: number;
}

// Form state types
export type StationaryFuelType = "natural_gas" | "lpg" | "biogas" | "diesel" | "fuel_oil" | "coal" | "wood_pellet" | "wood" | "hydrogen" | "other";

export interface StationarySource {
  source_name: string;
  fuel_type: StationaryFuelType;
  unit: string;
  monthly: number[];
  data_quality: DataQuality;
  ef_mode: EfMode;
  ef_value: number | null;
  ef_reference: string;
}

/** @deprecated Use StationarySource */
export type GasNaturaleSite = StationarySource;

export interface FleetVehicle {
  plate: string;
  fuel_type: FuelType;
  liters_annual: number | null;
  km_annual: number | null;
  usage_category: UsageCategory;
  data_quality: DataQuality;
  ef_mode: EfMode;
  ef_value: number | null;
  ef_reference: string;
}

export interface HfcGas {
  gas_name: string;
  kg_annual: number | null;
  data_quality: DataQuality;
  ef_mode: EfMode;
  ef_value: number | null;
  ef_reference: string;
}

export interface ElectricityPod {
  site_name: string;
  country: string;
  pod_code: string;
  contract_type: ContractType;
  monthly: number[];
  fv_self_consumed: number | null;
  // FV fields (ISO 14064-1)
  has_fv: boolean;
  fv_production_kwh: number;
  fv_autoconsumato_kwh: number;
  fv_go_vendute: boolean;
  fv_immesso_kwh: number;
  data_quality: DataQuality;
  ef_mode: EfMode;
  ef_value: number | null;
  ef_reference: string;
  // Market-based fields
  market_instrument: MarketInstrument;
  market_certified_kwh: number;
  market_ppa_coverage: number;
  market_supplier_ef: number;
  market_emissions: number;
}

export interface GhgFormData {
  // Step 1
  year: number;
  base_year: number;
  base_year_recalculation: string[];
  base_year_recalculation_notes: string;
  perimeter: PerimeterType;
  consolidation_approach: ConsolidationApproach;
  entities: OrganizationalEntity[];
  included_entities: string;
  notes: string;
  // Step 2 — Combustione stazionaria
  stationary_sources: StationarySource[];
  // Step 3
  fleet_vehicles: FleetVehicle[];
  // Step 4
  hfc_gases: HfcGas[];
  // Step 5
  electricity_pods: ElectricityPod[];
}
