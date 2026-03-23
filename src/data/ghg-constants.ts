// GHG Module Constants

export const MONTHS = [
  "Gen", "Feb", "Mar", "Apr", "Mag", "Giu",
  "Lug", "Ago", "Set", "Ott", "Nov", "Dic",
] as const;

export const DATA_QUALITY_OPTIONS = [
  { value: "dato_misurato", label: "Dato misurato (contatore certificato)", uncertainty: 0.5 },
  { value: "bolletta", label: "Bolletta / fattura", uncertainty: 1 },
  { value: "contatore", label: "Lettura contatore", uncertainty: 2 },
  { value: "stima_storici", label: "Stima da storici", uncertainty: 10 },
  { value: "stima_ragionata", label: "Stima ragionata", uncertainty: 20 },
  { value: "stima_benchmark", label: "Stima da benchmark settoriale", uncertainty: 25 },
] as const;

// ISO 14064-1 Annex B — activity data uncertainty
export const ACTIVITY_UNCERTAINTY: Record<string, number> = {
  dato_misurato: 0.5,
  bolletta: 1.0,
  contatore: 2.0,
  stima_storici: 10.0,
  stima_ragionata: 20.0,
  stima_benchmark: 25.0,
};

export const GAS_UNIT_OPTIONS = [
  { value: "sm3", label: "Sm³" },
  { value: "mwh", label: "MWh" },
] as const;

// GWP IPCC AR6
export const GWP_CH4 = 27.9;
export const GWP_N2O = 273;

// Per-gas emission factors (tCO₂/unit, tCH₄/unit, tN₂O/unit) — null = use fe_co2eq only
export type PerGasEf = { fe_co2: number | null; fe_ch4: number | null; fe_n2o: number | null };

export const COMBUSTION_GAS_EF: Record<string, PerGasEf> = {
  // Stationary
  natural_gas: { fe_co2: 0.001962, fe_ch4: 0.0000000372, fe_n2o: 0.0000000037 },
  lpg:         { fe_co2: 0.001580, fe_ch4: 0.0000000240, fe_n2o: 0.0000000024 },
  biogas:      { fe_co2: 0.001800, fe_ch4: 0.0000000372, fe_n2o: 0.0000000037 },
  diesel:      { fe_co2: 0.002610, fe_ch4: 0.0000000120, fe_n2o: 0.0000000024 },
  fuel_oil:    { fe_co2: 0.003130, fe_ch4: 0.0000000120, fe_n2o: 0.0000000024 },
  coal:        { fe_co2: 0.002380, fe_ch4: 0.0000000300, fe_n2o: 0.0000000060 },
  wood_pellet: { fe_co2: 0.000384, fe_ch4: 0.0000001200, fe_n2o: 0.0000000140 },
  wood:        { fe_co2: 0.000384, fe_ch4: 0.0000001800, fe_n2o: 0.0000000140 },
  hydrogen:    { fe_co2: null, fe_ch4: null, fe_n2o: null },
  other:       { fe_co2: null, fe_ch4: null, fe_n2o: null },
  // Mobile
  benzina:     { fe_co2: 0.002280, fe_ch4: 0.0000000920, fe_n2o: 0.0000000320 },
  gasolio:     { fe_co2: 0.002610, fe_ch4: 0.0000000120, fe_n2o: 0.0000000240 },
  gpl:         { fe_co2: 0.001580, fe_ch4: 0.0000000680, fe_n2o: 0.0000000020 },
  metano:      { fe_co2: 0.002720, fe_ch4: 0.0000000920, fe_n2o: 0.0000000037 },
  forklift_diesel:   { fe_co2: 0.002620, fe_ch4: 0.0000000120, fe_n2o: 0.0000000240 },
  forklift_lpg:      { fe_co2: 0.001600, fe_ch4: 0.0000000680, fe_n2o: 0.0000000020 },
  generator_diesel:  { fe_co2: 0.002620, fe_ch4: 0.0000000120, fe_n2o: 0.0000000240 },
  excavator_diesel:  { fe_co2: 0.002720, fe_ch4: 0.0000000120, fe_n2o: 0.0000000240 },
  truck_diesel:      { fe_co2: 0.002620, fe_ch4: 0.0000000120, fe_n2o: 0.0000000240 },
  van_diesel:        { fe_co2: 0.002520, fe_ch4: 0.0000000120, fe_n2o: 0.0000000240 },
  van_petrol:        { fe_co2: 0.002280, fe_ch4: 0.0000000920, fe_n2o: 0.0000000320 },
};

// Stationary combustion fuel types
export type StationaryFuelOption = {
  value: string; label: string; substance: string; unit: string;
  fe: number; fe_unit: string; fe_uncertainty: number; biogenic: boolean;
};
export type StationaryFuelGroup = { label: string; options: StationaryFuelOption[] };

export const STATIONARY_FUEL_GROUPS: StationaryFuelGroup[] = [
  {
    label: "Gas",
    options: [
      { value: "natural_gas", label: "Gas naturale", substance: "natural_gas", unit: "Sm³", fe: 0.001983, fe_unit: "tCO₂e/Sm³", fe_uncertainty: 3, biogenic: false },
      { value: "lpg",         label: "GPL riscaldamento", substance: "lpg", unit: "litri", fe: 0.001612, fe_unit: "tCO₂e/litro", fe_uncertainty: 5, biogenic: false },
      { value: "biogas",      label: "Biogas", substance: "biogas", unit: "Sm³", fe: 0.001820, fe_unit: "tCO₂e/Sm³", fe_uncertainty: 10, biogenic: true },
    ],
  },
  {
    label: "Liquidi",
    options: [
      { value: "diesel",   label: "Gasolio / Gruppo di continuità", substance: "diesel", unit: "litri", fe: 0.002640, fe_unit: "tCO₂e/litro", fe_uncertainty: 3, biogenic: false },
      { value: "fuel_oil", label: "Olio combustibile", substance: "fuel_oil", unit: "litri", fe: 0.003170, fe_unit: "tCO₂e/litro", fe_uncertainty: 3, biogenic: false },
    ],
  },
  {
    label: "Solidi",
    options: [
      { value: "coal",        label: "Carbone", substance: "coal", unit: "kg", fe: 0.002420, fe_unit: "tCO₂e/kg", fe_uncertainty: 5, biogenic: false },
      { value: "wood_pellet", label: "Pellet", substance: "wood_pellet", unit: "kg", fe: 0.000390, fe_unit: "tCO₂e/kg", fe_uncertainty: 10, biogenic: true },
      { value: "wood",        label: "Legna", substance: "wood", unit: "kg", fe: 0.000390, fe_unit: "tCO₂e/kg", fe_uncertainty: 15, biogenic: true },
    ],
  },
  {
    label: "Altro",
    options: [
      { value: "hydrogen", label: "Idrogeno", substance: "hydrogen", unit: "kg", fe: 0, fe_unit: "tCO₂e/kg", fe_uncertainty: 10, biogenic: false },
      { value: "other",    label: "Altro (inserisci FE manualmente)", substance: "other", unit: "kg", fe: 0, fe_unit: "tCO₂e/unità", fe_uncertainty: 10, biogenic: false },
    ],
  },
];

export const STATIONARY_FUEL_OPTIONS: readonly StationaryFuelOption[] =
  STATIONARY_FUEL_GROUPS.flatMap((g) => g.options);

// Mobile combustion fuel types (grouped)
export type MobileFuelGroup = { label: string; options: { value: string; label: string }[] };

export const MOBILE_FUEL_GROUPS: MobileFuelGroup[] = [
  {
    label: "Flotta aziendale",
    options: [
      { value: "gasolio", label: "Diesel auto" },
      { value: "benzina", label: "Benzina auto" },
      { value: "gpl", label: "GPL auto" },
      { value: "metano", label: "Metano auto" },
      { value: "electric_car_it", label: "Elettrico" },
      { value: "hybrid_petrol_car_avg", label: "Ibrido plug-in benzina" },
      { value: "hybrid_diesel_car_avg", label: "Ibrido plug-in diesel" },
      { value: "mild_hybrid_petrol_avg", label: "Mild hybrid benzina" },
      { value: "mild_hybrid_diesel_avg", label: "Mild hybrid diesel" },
    ],
  },
  {
    label: "Macchinari e attrezzature",
    options: [
      { value: "forklift_diesel", label: "Muletto diesel" },
      { value: "forklift_lpg", label: "Muletto GPL" },
      { value: "generator_diesel", label: "Generatore / Gruppo di continuità diesel" },
      { value: "excavator_diesel", label: "Escavatore / Mezzo movimento terra" },
    ],
  },
  {
    label: "Mezzi pesanti",
    options: [
      { value: "truck_diesel", label: "Camion / TIR diesel" },
      { value: "van_diesel", label: "Furgone diesel" },
      { value: "van_petrol", label: "Furgone benzina" },
    ],
  },
];

export const FUEL_TYPE_OPTIONS = [
  { value: "benzina", label: "Benzina" },
  { value: "gasolio", label: "Gasolio" },
  { value: "gpl", label: "GPL" },
  { value: "metano", label: "Metano" },
  { value: "electric_car_it", label: "Elettrico" },
  { value: "hybrid_petrol_car_avg", label: "Ibrido Plug-in benzina" },
  { value: "hybrid_diesel_car_avg", label: "Ibrido Plug-in diesel" },
  { value: "mild_hybrid_petrol_avg", label: "Mild Hybrid benzina" },
  { value: "mild_hybrid_diesel_avg", label: "Mild Hybrid diesel" },
  { value: "forklift_diesel", label: "Muletto diesel" },
  { value: "forklift_lpg", label: "Muletto GPL" },
  { value: "generator_diesel", label: "Generatore diesel" },
  { value: "excavator_diesel", label: "Escavatore diesel" },
  { value: "truck_diesel", label: "Camion / TIR diesel" },
  { value: "van_diesel", label: "Furgone diesel" },
  { value: "van_petrol", label: "Furgone benzina" },
] as const;

export const USAGE_CATEGORY_OPTIONS = [
  { value: "aziendale", label: "100% aziendale" },
  { value: "fringe_benefit", label: "Fringe benefit" },
  { value: "privato", label: "Privato" },
] as const;

export const CONTRACT_TYPE_OPTIONS = [
  { value: "maggior_tutela", label: "Maggior tutela" },
  { value: "mercato_libero", label: "Mercato libero" },
  { value: "garanzia_origine", label: "Garanzia di Origine (GO)" },
  { value: "ppa", label: "PPA (Power Purchase Agreement)" },
] as const;

export const COUNTRY_EF_OPTIONS = [
  { value: "IT", label: "\u{1F1EE}\u{1F1F9} Italia",           substance: "grid_it_location_2023",  fe: 0.0002331, residual_mix_substance: "residual_mix_it_2023", residual_mix_ef: 0.000371 },
  { value: "DE", label: "\u{1F1E9}\u{1F1EA} Germania",         substance: "grid_de_location_2023",  fe: 0.0003794, residual_mix_substance: "residual_mix_de_2023", residual_mix_ef: 0.000624 },
  { value: "FR", label: "\u{1F1EB}\u{1F1F7} Francia",          substance: "grid_fr_location_2023",  fe: 0.0000521, residual_mix_substance: "residual_mix_fr_2023", residual_mix_ef: 0.000441 },
  { value: "ES", label: "\u{1F1EA}\u{1F1F8} Spagna",           substance: "grid_es_location_2023",  fe: 0.0001634, residual_mix_substance: "residual_mix_es_2023", residual_mix_ef: 0.000229 },
  { value: "PL", label: "\u{1F1F5}\u{1F1F1} Polonia",          substance: "grid_pl_location_2023",  fe: 0.000720,  residual_mix_substance: "residual_mix_pl_2023", residual_mix_ef: 0.000812 },
  { value: "RO", label: "\u{1F1F7}\u{1F1F4} Romania",          substance: "grid_ro_location_2023",  fe: 0.000310,  residual_mix_substance: "residual_mix_ro_2023", residual_mix_ef: 0.000389 },
  { value: "CH", label: "\u{1F1E8}\u{1F1ED} Svizzera",         substance: "grid_ch_location_2023",  fe: 0.000045,  residual_mix_substance: "residual_mix_ch_2023", residual_mix_ef: 0.000053 },
  { value: "UK", label: "\u{1F1EC}\u{1F1E7} Regno Unito",      substance: "grid_uk_location_2023",  fe: 0.000225,  residual_mix_substance: "residual_mix_uk_2023", residual_mix_ef: 0.000268 },
  { value: "US", label: "\u{1F1FA}\u{1F1F8} USA",              substance: "grid_us_location_2023",  fe: 0.000386,  residual_mix_substance: null, residual_mix_ef: null },
  { value: "CN", label: "\u{1F1E8}\u{1F1F3} Cina",             substance: "grid_cn_location_2023",  fe: 0.000581,  residual_mix_substance: null, residual_mix_ef: null },
  { value: "BR", label: "\u{1F1E7}\u{1F1F7} Brasile",          substance: "grid_br_location_2023",  fe: 0.000074,  residual_mix_substance: null, residual_mix_ef: null },
  { value: "IN", label: "\u{1F1EE}\u{1F1F3} India",            substance: "grid_in_location_2023",  fe: 0.000708,  residual_mix_substance: null, residual_mix_ef: null },
  { value: "EU", label: "\u{1F30D} Media EU",                   substance: "grid_eu_market",         fe: 0.0003765, residual_mix_substance: "residual_mix_eu_2023", residual_mix_ef: 0.000428 },
  { value: "GO", label: "\u267B\uFE0F Rinnovabile con GO",      substance: "go_renewable",           fe: 0.0,       residual_mix_substance: null, residual_mix_ef: null },
  { value: "WORLD", label: "\u{1F310} Altro paese (IEA world)", substance: "grid_world_avg_2023",    fe: 0.000494,  residual_mix_substance: null, residual_mix_ef: null },
] as const;

export const MARKET_INSTRUMENT_OPTIONS = [
  { value: "none",          label: "Nessuno (residual mix nazionale AIB)" },
  { value: "go",            label: "GO - Garanzia d'Origine (EU)" },
  { value: "rec",           label: "REC - Renewable Energy Certificate (USA)" },
  { value: "i_rec",         label: "I-REC - International REC" },
  { value: "ppa",           label: "PPA - Power Purchase Agreement" },
  { value: "supplier_rate", label: "Tariffa specifica fornitore" },
] as const;

export type HfcGasOption = { value: string; label: string; gwp: number };
export type HfcGasGroup = { label: string; options: HfcGasOption[] };

export const HFC_GAS_GROUPS: HfcGasGroup[] = [
  {
    label: "Refrigeranti puri",
    options: [
      { value: "R-23",    label: "R-23",    gwp: 14800 },
      { value: "R-32",    label: "R-32",    gwp: 675 },
      { value: "R-41",    label: "R-41",    gwp: 220 },
      { value: "R-125",   label: "R-125",   gwp: 3740 },
      { value: "R-134a",  label: "R-134a",  gwp: 1430 },
      { value: "R-143a",  label: "R-143a",  gwp: 5810 },
      { value: "R-152a",  label: "R-152a",  gwp: 164 },
      { value: "R-227ea", label: "R-227ea", gwp: 3600 },
      { value: "R-236fa", label: "R-236fa", gwp: 8690 },
      { value: "R-245fa", label: "R-245fa", gwp: 962 },
    ],
  },
  {
    label: "Miscele comuni",
    options: [
      { value: "R-404A",  label: "R-404A",  gwp: 3922 },
      { value: "R-407A",  label: "R-407A",  gwp: 2107 },
      { value: "R-407C",  label: "R-407C",  gwp: 1774 },
      { value: "R-407F",  label: "R-407F",  gwp: 1825 },
      { value: "R-407H",  label: "R-407H",  gwp: 1495 },
      { value: "R-408A",  label: "R-408A",  gwp: 3152 },
      { value: "R-410A",  label: "R-410A",  gwp: 2088 },
      { value: "R-422D",  label: "R-422D",  gwp: 2729 },
      { value: "R-427A",  label: "R-427A",  gwp: 2138 },
      { value: "R-438A",  label: "R-438A",  gwp: 2265 },
      { value: "R-442A",  label: "R-442A",  gwp: 1888 },
      { value: "R-448A",  label: "R-448A",  gwp: 1387 },
      { value: "R-449A",  label: "R-449A",  gwp: 1282 },
      { value: "R-450A",  label: "R-450A",  gwp: 605 },
      { value: "R-452A",  label: "R-452A",  gwp: 2141 },
      { value: "R-452B",  label: "R-452B",  gwp: 698 },
      { value: "R-454B",  label: "R-454B",  gwp: 466 },
      { value: "R-454C",  label: "R-454C",  gwp: 148 },
      { value: "R-455A",  label: "R-455A",  gwp: 148 },
      { value: "R-507A",  label: "R-507A",  gwp: 3985 },
      { value: "R-513A",  label: "R-513A",  gwp: 573 },
    ],
  },
  {
    label: "Basso GWP (post F-Gas 2024)",
    options: [
      { value: "R-290",     label: "R-290 (Propano)",  gwp: 3 },
      { value: "R-717",     label: "R-717 (Ammoniaca)", gwp: 0 },
      { value: "R-744",     label: "R-744 (CO₂)",      gwp: 1 },
      { value: "R-1234yf",  label: "R-1234yf",         gwp: 1 },
      { value: "R-1233zd",  label: "R-1233zd",         gwp: 1 },
      { value: "R-1336mzz", label: "R-1336mzz",        gwp: 2 },
    ],
  },
  {
    label: "Altri F-Gas",
    options: [
      { value: "SF6",    label: "SF₆",    gwp: 24300 },
      { value: "NF3",    label: "NF₃",    gwp: 17400 },
      { value: "PFC-14", label: "PFC-14", gwp: 7380 },
      { value: "PFC-116",label: "PFC-116",gwp: 12400 },
      { value: "R-22",   label: "R-22 (HCFC)", gwp: 1810 },
    ],
  },
];

// Flat list for lookups (backward-compatible)
export const HFC_GAS_OPTIONS: readonly HfcGasOption[] =
  HFC_GAS_GROUPS.flatMap((g) => g.options);

export const PERIMETER_OPTIONS = [
  { value: "individuale", label: "Individuale" },
  { value: "consolidato", label: "Consolidato" },
] as const;

export const CONSOLIDATION_APPROACH_OPTIONS = [
  {
    value: "operational",
    label: "Controllo Operativo",
    description: "Includi 100% delle emissioni delle entità su cui hai controllo operativo",
  },
  {
    value: "financial",
    label: "Controllo Finanziario",
    description: "Includi 100% delle entità consolidate nel bilancio (IFRS/ITA GAAP)",
  },
  {
    value: "equity_share",
    label: "Quota Azionaria",
    description: "Includi le emissioni proporzionalmente alla quota di proprietà",
  },
] as const;

export const ENTITY_CONTROL_TYPE_OPTIONS = [
  { value: "operational", label: "Operativo" },
  { value: "financial", label: "Finanziario" },
  { value: "both", label: "Entrambi" },
] as const;

// Standard emission factors (ISPRA / DEFRA / IPCC AR5)
export const DEFAULT_EMISSION_FACTORS = {
  gas_naturale_sm3: { value: 0.001983, unit: "tCO₂e/Sm³", uncertainty: 3, source: "ISPRA 2023" },
  gas_naturale_mwh: { value: 0.202, unit: "tCO₂e/MWh", uncertainty: 3, source: "ISPRA 2023" },
  benzina: { value: 0.002302, unit: "tCO₂e/litro", uncertainty: 3, source: "DEFRA 2023" },
  gasolio: { value: 0.002640, unit: "tCO₂e/litro", uncertainty: 3, source: "DEFRA 2023" },
  gpl: { value: 0.001612, unit: "tCO₂e/litro", uncertainty: 5, source: "DEFRA 2023" },
  metano: { value: 0.002743, unit: "tCO₂e/kg", uncertainty: 5, source: "DEFRA 2023" },
  electric_car_it: { value: 0.000050, unit: "tCO₂e/km", uncertainty: 5, source: "ISPRA 2023 (mix IT)" },
  // Per-km factors (for vehicles where only km are known)
  benzina_km: { value: 0.000171, unit: "tCO₂e/km", uncertainty: 10, source: "ISPRA 2023 (media auto benzina)" },
  gasolio_km: { value: 0.000165, unit: "tCO₂e/km", uncertainty: 10, source: "ISPRA 2023 (media auto diesel)" },
  gpl_km: { value: 0.000140, unit: "tCO₂e/km", uncertainty: 10, source: "ISPRA 2023 (media auto GPL)" },
  metano_km: { value: 0.000130, unit: "tCO₂e/km", uncertainty: 10, source: "ISPRA 2023 (media auto metano)" },
  hybrid_petrol_car_avg_km: { value: 0.000100, unit: "tCO₂e/km", uncertainty: 10, source: "ISPRA 2023" },
  hybrid_diesel_car_avg_km: { value: 0.000110, unit: "tCO₂e/km", uncertainty: 10, source: "ISPRA 2023" },
  mild_hybrid_petrol_avg_km: { value: 0.000125, unit: "tCO₂e/km", uncertainty: 10, source: "ISPRA 2023" },
  mild_hybrid_diesel_avg_km: { value: 0.000130, unit: "tCO₂e/km", uncertainty: 10, source: "ISPRA 2023" },
  truck_diesel_km: { value: 0.000850, unit: "tCO₂e/km", uncertainty: 15, source: "DEFRA 2023 (HGV avg)" },
  van_diesel_km: { value: 0.000250, unit: "tCO₂e/km", uncertainty: 10, source: "DEFRA 2023 (van diesel)" },
  van_petrol_km: { value: 0.000230, unit: "tCO₂e/km", uncertainty: 10, source: "DEFRA 2023 (van petrol)" },
  hybrid_petrol_car_avg: { value: 0.000120, unit: "tCO₂e/litro", uncertainty: 5, source: "ISPRA 2023" },
  hybrid_diesel_car_avg: { value: 0.000135, unit: "tCO₂e/litro", uncertainty: 5, source: "ISPRA 2023" },
  mild_hybrid_petrol_avg: { value: 0.000148, unit: "tCO₂e/litro", uncertainty: 5, source: "ISPRA 2023" },
  mild_hybrid_diesel_avg: { value: 0.000158, unit: "tCO₂e/litro", uncertainty: 5, source: "ISPRA 2023" },
  forklift_diesel: { value: 0.002650, unit: "tCO₂e/litro", uncertainty: 5, source: "IPCC AR6" },
  forklift_lpg: { value: 0.001630, unit: "tCO₂e/litro", uncertainty: 5, source: "IPCC AR6" },
  generator_diesel: { value: 0.002650, unit: "tCO₂e/litro", uncertainty: 5, source: "IPCC AR6" },
  excavator_diesel: { value: 0.002750, unit: "tCO₂e/litro", uncertainty: 5, source: "IPCC AR6" },
  truck_diesel: { value: 0.002650, unit: "tCO₂e/litro", uncertainty: 5, source: "IPCC AR6" },
  van_diesel: { value: 0.002550, unit: "tCO₂e/litro", uncertainty: 5, source: "IPCC AR6" },
  van_petrol: { value: 0.002310, unit: "tCO₂e/litro", uncertainty: 5, source: "IPCC AR6" },
  elettricita_location: { value: 0.000233, unit: "tCO₂e/kWh", uncertainty: 5, source: "ISPRA 2023 (Location-based)" },
  elettricita_market_go: { value: 0, unit: "tCO₂e/kWh", uncertainty: 0, source: "Garanzia di Origine" },
} as const;
