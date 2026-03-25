/**
 * DEFRA 2025 Emission Factors Import Script for Enworia
 * ======================================================
 * Parsifica il file ufficiale DEFRA 2025 e popola la tabella emission_factors su Supabase.
 *
 * Uso:
 *     node import_defra_2025.mjs --file ghg-conversion-factors-2025-full-set.xlsx --dry-run
 *     node import_defra_2025.mjs --file ghg-conversion-factors-2025-full-set.xlsx
 *
 * Strategia: DELETE tutti i record source='DEFRA 2025' poi INSERT — idempotente.
 * Schema target: emission_factors (category, substance, unit_input, fe_co2, fe_ch4, fe_n2o, fe_co2eq, ...)
 */

import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import XLSX from 'xlsx'

const __dirname = dirname(fileURLToPath(import.meta.url))

// ---------------------------------------------------------------------------
// CONFIG
// ---------------------------------------------------------------------------
function loadEnv() {
  const envPath = resolve(__dirname, '.env.local')
  if (!existsSync(envPath)) return
  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#') || !t.includes('=')) continue
    const idx = t.indexOf('=')
    const k = t.slice(0, idx).trim()
    const v = t.slice(idx + 1).trim().replace(/^["']|["']$/g, '')
    if (!process.env[k]) process.env[k] = v
  }
}
loadEnv()

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('ERRORE: NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY non trovati in .env.local')
  process.exit(1)
}

const SOURCE = 'DEFRA 2025'
const YEAR = 2025

// CLI
const cliArgs = process.argv.slice(2)
let filePath = 'ghg-conversion-factors-2025-full-set.xlsx'
let dryRun = false
for (let i = 0; i < cliArgs.length; i++) {
  if (cliArgs[i] === '--file' && cliArgs[i + 1]) filePath = cliArgs[++i]
  else if (cliArgs[i] === '--dry-run') dryRun = true
}

// ---------------------------------------------------------------------------
// SUPABASE helpers
// ---------------------------------------------------------------------------
async function supaFetch(path, opts = {}) {
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
  })
  return resp
}

async function deleteExisting() {
  const resp = await supaFetch(`emission_factors?source=eq.${encodeURIComponent(SOURCE)}`, { method: 'DELETE' })
  if (resp.status !== 200 && resp.status !== 204) {
    console.error(`DELETE failed: ${resp.status} — ${await resp.text()}`)
    return false
  }
  return true
}

async function insertBatch(records) {
  const resp = await supaFetch('emission_factors', {
    method: 'POST',
    headers: { 'Prefer': 'return=representation' },
    body: JSON.stringify(records),
  })
  if (resp.status !== 200 && resp.status !== 201) {
    const text = await resp.text()
    console.error(`INSERT failed: ${resp.status} — ${text}`)
    return false
  }
  return true
}

// ---------------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------------
function sf(v) { if (v == null) return null; const n = Number(v); return isNaN(n) ? null : n }

function sheetRows(wb, name) {
  const ws = wb.Sheets[name]
  if (!ws) { console.error(`  Foglio "${name}" non trovato`); return [] }
  return XLSX.utils.sheet_to_json(ws, { header: 1, defval: null })
}

/**
 * Build a record matching the emission_factors table schema.
 * @param {string} category - combustion, electricity, heat, hfc, freight, travel, hotel, waste, material
 * @param {string} substance - snake_case identifier
 * @param {string} unitInput - unit of the input quantity
 * @param {number} feCo2eq - total kgCO2e per unit (DEFRA total column)
 * @param {number|null} feCo2 - kgCO2e of CO2 component
 * @param {number|null} feCh4 - kgCO2e of CH4 component
 * @param {number|null} feN2o - kgCO2e of N2O component
 * @param {string} country
 * @param {string|null} notes
 */
function rec(category, substance, unitInput, feCo2eq, feCo2, feCh4, feN2o, country = 'UK', notes = null) {
  const v = sf(feCo2eq)
  if (v == null) return null
  return {
    category,
    substance,
    unit_input: unitInput,
    fe_co2eq: v,
    fe_co2: sf(feCo2),
    fe_ch4: sf(feCh4),
    fe_n2o: sf(feN2o),
    gwp_source: 'IPCC AR6',
    source: SOURCE,
    year: YEAR,
    country,
    notes,
    is_default: false,
  }
}

// ---------------------------------------------------------------------------
// PARSE: FUELS (Scope 1) — cols: [3]=total [4]=CO2 [5]=CH4 [6]=N2O
// ---------------------------------------------------------------------------
function parseFuels(wb) {
  const rows = sheetRows(wb, 'Fuels')
  const records = []
  let currentFuel = null

  // substance mapping: DEFRA fuel name → { unitKey: [substance, unitInput] }
  const targets = {
    'Natural gas':                    { 'cubic metres': ['gas_natural_defra', 'm3'] },
    'Diesel (100% mineral diesel)':   { 'litres': ['diesel_defra', 'litri'] },
    'Diesel (average biofuel blend)': { 'litres': ['diesel_blend_defra', 'litri'] },
    'Petrol (100% mineral petrol)':   { 'litres': ['petrol_defra', 'litri'] },
    'Petrol (average biofuel blend)': { 'litres': ['petrol_blend_defra', 'litri'] },
    'LPG':                            { 'litres': ['gpl_defra', 'litri'] },
    'Burning oil':                    { 'litres': ['fuel_oil_defra', 'litri'] },
  }

  for (const row of rows) {
    if (row[1] && typeof row[1] === 'string') currentFuel = row[1]
    if (!currentFuel || !targets[currentFuel]) continue
    const unitKey = row[2] ? String(row[2]).trim() : null
    if (!unitKey || !targets[currentFuel][unitKey]) continue

    const [substance, unitInput] = targets[currentFuel][unitKey]
    const r = rec('combustion', substance, unitInput, row[3], row[4], row[5], row[6], 'UK',
      `DEFRA 2025 - ${currentFuel} - ${unitKey}`)
    if (r) records.push(r)
  }
  return records
}

// ---------------------------------------------------------------------------
// PARSE: UK ELECTRICITY (Scope 2) — cols: [4]=total [5]=CO2 [6]=CH4 [7]=N2O
// ---------------------------------------------------------------------------
function parseElectricity(wb) {
  const rows = sheetRows(wb, 'UK electricity')
  const records = []
  for (const row of rows) {
    if (row[1] && String(row[1]).includes('Electricity: UK')) {
      const r = rec('electricity', 'uk_grid_defra', 'kWh', row[4], row[5], row[6], row[7], 'UK',
        'DEFRA 2025 UK grid average — usare ISPRA/GSE per inventari italiani')
      if (r) records.push(r)
    }
  }
  return records
}

// ---------------------------------------------------------------------------
// PARSE: HEAT AND STEAM (Scope 2) — cols: [4]=total [5]=CO2 [6]=CH4 [7]=N2O
// ---------------------------------------------------------------------------
function parseHeat(wb) {
  const rows = sheetRows(wb, 'Heat and steam')
  const records = []
  for (const row of rows) {
    if (row[1] && String(row[1]).includes('Onsite heat and steam')) {
      const r = rec('heat', 'heat_onsite_defra', 'kWh', row[4], row[5], row[6], row[7], 'UK',
        'DEFRA 2025 - onsite CHP')
      if (r) records.push(r)
    }
    if (row[1] && String(row[1]).includes('District heat and steam')) {
      const r = rec('heat', 'heat_district_defra', 'kWh', row[4], row[5], row[6], row[7], 'UK',
        'DEFRA 2025 - district heat')
      if (r) records.push(r)
    }
  }
  return records
}

// ---------------------------------------------------------------------------
// PARSE: FREIGHTING GOODS (Scope 3 — 3_1/3_2)
// Vans: cols [3]=total [4]=CO2 [5]=CH4 [6]=N2O
// HGVs: cols [7]=total [8]=CO2 [9]=CH4 [10]=N2O (col 3 is null for tonne.km)
// ---------------------------------------------------------------------------
function parseFreight(wb) {
  const rows = sheetRows(wb, 'Freighting goods')
  const records = []

  const targets = {
    'Average (up to 3.5 tonnes)': 'freight_van_avg_defra',
    'All HGVs':                   'freight_hgv_all_defra',
    'All rigids':                 'freight_hgv_rigid_defra',
    'All artics':                 'freight_hgv_artic_defra',
  }

  for (const row of rows) {
    const label = row[1] ? String(row[1]).trim() : null
    if (!label || !targets[label] || row[2] !== 'tonne.km') continue
    const substance = targets[label]

    // Pick the column group that has data
    const total = sf(row[3]) ?? sf(row[7])
    const co2   = sf(row[4]) ?? sf(row[8])
    const ch4   = sf(row[5]) ?? sf(row[9])
    const n2o   = sf(row[6]) ?? sf(row[10])

    if (total == null) continue

    // Upstream (3_1) and downstream (3_2) — same factor
    const rUp = rec('freight', substance + '_upstream', 'tkm', total, co2, ch4, n2o, 'UK',
      `DEFRA 2025 - ${label} - tonne.km (upstream)`)
    const rDw = rec('freight', substance + '_downstream', 'tkm', total, co2, ch4, n2o, 'UK',
      `DEFRA 2025 - ${label} - tonne.km (downstream)`)
    if (rUp) records.push(rUp)
    if (rDw) records.push(rDw)
  }

  // Rail freight
  for (const row of rows) {
    if (row[0] && String(row[0]).trim() === 'Rail' && row[1] && String(row[1]).includes('Freight train') && row[2] === 'tonne.km') {
      const total = sf(row[3]) ?? sf(row[7])
      const co2   = sf(row[4]) ?? sf(row[8])
      const ch4   = sf(row[5]) ?? sf(row[9])
      const n2o   = sf(row[6]) ?? sf(row[10])
      const r = rec('freight', 'freight_rail_defra', 'tkm', total, co2, ch4, n2o, 'UK', 'DEFRA 2025 - freight train')
      if (r) records.push(r)
    }
  }

  return records
}

// ---------------------------------------------------------------------------
// PARSE: BUSINESS TRAVEL LAND (Scope 3) — cols: [3]=total [4]=CO2 [5]=CH4 [6]=N2O
// ---------------------------------------------------------------------------
function parseTravelLand(wb) {
  const rows = sheetRows(wb, 'Business travel- land')
  const records = []

  const targets = {
    'Average car|km': [
      ['travel_car_avg_commute_defra', 'km', 'Pendolarismo auto media'],
      ['travel_car_avg_business_defra', 'km', 'Trasferte auto media'],
      ['travel_car_avg_visitor_defra', 'km', 'Trasporto clienti auto'],
    ],
    'National rail|passenger.km': [
      ['travel_train_commute_defra', 'passenger.km', 'Pendolarismo treno'],
      ['travel_train_business_defra', 'passenger.km', 'Trasferte treno'],
    ],
    'Average local bus|passenger.km': [
      ['travel_bus_commute_defra', 'passenger.km', 'Pendolarismo bus'],
    ],
    'Light rail and tram|passenger.km': [
      ['travel_tram_commute_defra', 'passenger.km', 'Pendolarismo tram'],
    ],
  }

  function emit(key, row) {
    if (!targets[key]) return
    for (const [substance, unitInput, note] of targets[key]) {
      const r = rec('travel', substance, unitInput, row[3], row[4], row[5], row[6], 'UK', `DEFRA 2025 - ${note}`)
      if (r) records.push(r)
    }
  }

  for (const row of rows) {
    const label = row[1] ? String(row[1]).trim() : null
    const unit = row[2] || null
    if (label && label.includes('Average car') && unit === 'km') emit('Average car|km', row)
    if (label === 'National rail' && unit === 'passenger.km') emit('National rail|passenger.km', row)
    if (label && label.includes('Average local bus') && unit === 'passenger.km') emit('Average local bus|passenger.km', row)
    if (label && label.includes('Light rail and tram') && unit === 'passenger.km') emit('Light rail and tram|passenger.km', row)
  }
  return records
}

// ---------------------------------------------------------------------------
// PARSE: BUSINESS TRAVEL AIR (Scope 3 — 3_5)
// Cols: [0]=Activity [1]=Haul [2]=Class [3]=Unit [4]=total(withRF) [5]=CO2 [6]=CH4 [7]=N2O
// Haul appears only on first row of group, then null for class sub-rows
// ---------------------------------------------------------------------------
function parseTravelAir(wb) {
  const rows = sheetRows(wb, 'Business travel- air')
  const records = []
  let currentHaul = null

  for (const row of rows) {
    if (row[1] && typeof row[1] === 'string') currentHaul = String(row[1]).trim()
    if (row[3] !== 'passenger.km') continue
    const cls = row[2] ? String(row[2]).trim() : null
    if (!cls || sf(row[4]) == null) continue

    if (currentHaul === 'Short-haul, to/from UK' && cls === 'Economy class') {
      const r = rec('travel', 'flight_short_economy_defra', 'passenger.km', row[4], row[5], row[6], row[7], 'UK',
        'DEFRA 2025 - Short-haul economy with radiative forcing')
      if (r) records.push(r)
    } else if (currentHaul === 'Long-haul, to/from UK' && cls === 'Economy class') {
      const r = rec('travel', 'flight_long_economy_defra', 'passenger.km', row[4], row[5], row[6], row[7], 'UK',
        'DEFRA 2025 - Long-haul economy with radiative forcing')
      if (r) records.push(r)
    } else if (currentHaul === 'Long-haul, to/from UK' && cls === 'Business class') {
      const r = rec('travel', 'flight_long_business_defra', 'passenger.km', row[4], row[5], row[6], row[7], 'UK',
        'DEFRA 2025 - Long-haul business with radiative forcing')
      if (r) records.push(r)
    }
  }
  return records
}

// ---------------------------------------------------------------------------
// PARSE: HOTEL STAY (Scope 3 — 3_5) — cols: [3]=total only (no CO2/CH4/N2O split)
// ---------------------------------------------------------------------------
function parseHotel(wb) {
  const rows = sheetRows(wb, 'Hotel stay')
  const records = []

  const countryMap = { Italy: 'IT', UK: 'UK', France: 'FR', Germany: 'DE', 'United States': 'US', Spain: 'ES', Switzerland: 'CH', Netherlands: 'NL', Portugal: 'PT', Belgium: 'BE' }
  function cc(name) { return countryMap[name] || 'INT' }
  function slug(name) { return name.toLowerCase().replace(/[\s,()]+/g, '_').replace(/_+/g, '_').replace(/_$/, '') }

  for (const row of rows) {
    let countryName = null, value = null
    if (row[0] && String(row[0]).trim() === 'Hotel stay' && row[1]) {
      countryName = String(row[1]).trim(); value = sf(row[3])
    } else if (row[0] == null && row[1] && row[2] === 'Room per night' && row[3]) {
      countryName = String(row[1]).trim(); value = sf(row[3])
    }
    if (!countryName || value == null) continue

    const r = rec('hotel', `hotel_${slug(countryName)}_defra`, 'notte', value, null, null, null,
      cc(countryName), `DEFRA 2025 - Hotel ${countryName} - room per night`)
    if (r) records.push(r)
  }

  // Deduplica per substance
  const seen = new Set()
  return records.filter(r => { if (seen.has(r.substance)) return false; seen.add(r.substance); return true })
}

// ---------------------------------------------------------------------------
// PARSE: WASTE DISPOSAL (Scope 3 — 4_3 / 5_3)
// Column layout varies by disposal method column index
// Each disposal method col contains kgCO2e total only (no CO2/CH4/N2O split per method)
// ---------------------------------------------------------------------------
function parseWaste(wb) {
  const rows = sheetRows(wb, 'Waste disposal')
  const records = []

  const targets = {
    'Commercial and industrial waste': {
      landfill:     [7, 'waste_ci_landfill_defra', 'Rifiuti C&I discarica'],
      incineration: [5, 'waste_ci_incineration_defra', 'Rifiuti C&I incenerimento'],
      recycling:    [3, 'waste_ci_recycling_defra', 'Rifiuti C&I riciclo'],
    },
    'Plastics: average plastics': {
      landfill:     [7, 'waste_plastic_landfill_defra', 'Plastica discarica'],
      recycling:    [3, 'waste_plastic_recycling_defra', 'Plastica riciclo'],
      incineration: [5, 'waste_plastic_incineration_defra', 'Plastica incenerimento'],
    },
    'Metal: scrap metal': {
      recycling:    [3, 'waste_metal_recycling_defra', 'Rottame metallico riciclo'],
    },
    'Glass': {
      recycling:    [3, 'waste_glass_recycling_defra', 'Vetro riciclo'],
      landfill:     [7, 'waste_glass_landfill_defra', 'Vetro discarica'],
    },
    'Organic: food and drink waste': {
      landfill:     [7, 'waste_food_landfill_defra', 'Rifiuti alimentari discarica'],
      composting:   [6, 'waste_food_compost_defra', 'Rifiuti alimentari compostaggio'],
      anaerobic:    [8, 'waste_food_anaerobic_defra', 'Rifiuti alimentari digestione anaerobica'],
    },
    'WEEE - mixed': {
      recycling:    [3, 'waste_weee_recycling_defra', 'WEEE riciclo'],
    },
  }

  for (const row of rows) {
    const wasteType = row[1] ? String(row[1]).trim() : null
    if (!wasteType || !targets[wasteType] || row[2] !== 'tonnes') continue

    for (const [, [colIdx, substance, note]] of Object.entries(targets[wasteType])) {
      const value = sf(row[colIdx])
      if (value == null) continue
      // waste (scope 3 cat 4_3)
      records.push(rec('waste', substance, 'tonnellate', value, null, null, null, 'UK', `DEFRA 2025 - ${note}`))
      // end-of-life (scope 3 cat 5_3) — same factor
      records.push(rec('waste', substance.replace('waste_', 'eol_'), 'tonnellate', value, null, null, null, 'UK',
        `DEFRA 2025 - Fine vita - ${note}`))
    }
  }
  return records.filter(Boolean)
}

// ---------------------------------------------------------------------------
// PARSE: MATERIAL USE (Scope 3 — 4_1) — cols: [3]=primary total only
// ---------------------------------------------------------------------------
function parseMaterials(wb) {
  const rows = sheetRows(wb, 'Material use')
  const records = []

  const targets = {
    'Metals':                                           'material_metals_defra',
    'Metal: aluminium cans and foil (excl. forming)':   'material_aluminium_defra',
    'Metal: scrap metal':                               'material_scrap_metal_defra',
    'Metal: steel cans':                                'material_steel_defra',
    'Plastics: average plastics':                       'material_plastic_avg_defra',
    'Plastics: HDPE (incl. forming)':                   'material_hdpe_defra',
    'Plastics: PET (incl. forming)':                    'material_pet_defra',
    'Plastics: PP (incl. forming)':                     'material_pp_defra',
    'Glass':                                            'material_glass_defra',
    'Wood':                                             'material_wood_defra',
    'Aggregates':                                       'material_aggregates_defra',
    'Concrete':                                         'material_concrete_defra',
  }

  for (const row of rows) {
    const material = row[1] ? String(row[1]).trim() : null
    if (!material || !targets[material] || row[2] !== 'tonnes') continue
    const r = rec('material', targets[material], 'tonnellate', row[3], null, null, null, 'UK',
      `DEFRA 2025 - ${material} - primary production per tonne`)
    if (r) records.push(r)
  }
  return records
}

// ---------------------------------------------------------------------------
// PARSE: REFRIGERANTS — cols: [3]=kgCO2e (GWP, single gas = all CO2eq)
// ---------------------------------------------------------------------------
function parseRefrigerants(wb) {
  const rows = sheetRows(wb, 'Refrigerant & other')
  const records = []

  const targets = {
    'HFC-32':   'hfc32_defra',
    'HFC-134a': 'hfc134a_defra',
    'HFC-125':  'hfc125_defra',
    'R410A':    'r410a_defra',
    'R407C':    'r407c_defra',
    'R404A':    'r404a_defra',
    'R32':      'r32_defra',
    'Sulphur hexafluoride (SF6)': 'sf6_defra',
  }

  for (const row of rows) {
    const gasName = row[1] ? String(row[1]).trim() : null
    if (!gasName || !targets[gasName]) continue
    const value = sf(row[3])
    if (value == null) continue
    // GWP is pure CO2eq — the entire value IS CO2eq, no disaggregation
    records.push(rec('hfc', targets[gasName], 'kg', value, value, null, null, 'UK',
      `DEFRA 2025 - GWP ${gasName}`))
  }
  return records
}

// ---------------------------------------------------------------------------
// MAIN
// ---------------------------------------------------------------------------
async function main() {
  if (!existsSync(filePath)) {
    console.error(`ERRORE: file non trovato: ${filePath}`)
    process.exit(1)
  }

  console.log(`Caricamento file: ${filePath}`)
  const wb = XLSX.readFile(filePath)

  const allRecords = []
  const parsers = [
    ['Fuels (Scope 1)', parseFuels],
    ['UK Electricity (Scope 2)', parseElectricity],
    ['Heat and Steam (Scope 2)', parseHeat],
    ['Freight (Scope 3)', parseFreight],
    ['Business Travel Land (Scope 3)', parseTravelLand],
    ['Business Travel Air (Scope 3)', parseTravelAir],
    ['Hotel Stay (Scope 3)', parseHotel],
    ['Waste Disposal (Scope 3)', parseWaste],
    ['Material Use (Scope 3)', parseMaterials],
    ['Refrigerants', parseRefrigerants],
  ]

  for (const [label, parseFn] of parsers) {
    try {
      const recs = parseFn(wb)
      console.log(`  ${label}: ${recs.length} record`)
      allRecords.push(...recs)
    } catch (e) {
      console.error(`  ERRORE in ${label}: ${e.message}`)
    }
  }

  // Deduplica per substance + unit_input
  const seen = new Set()
  const deduped = allRecords.filter(r => {
    if (!r) return false
    const key = `${r.substance}|${r.unit_input}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  console.log(`\nTotale record unici: ${deduped.length}`)

  if (dryRun) {
    console.log('\n--- DRY RUN ---')
    for (const r of deduped) {
      const co2 = r.fe_co2 != null ? ` co2=${r.fe_co2}` : ''
      const ch4 = r.fe_ch4 != null ? ` ch4=${r.fe_ch4}` : ''
      const n2o = r.fe_n2o != null ? ` n2o=${r.fe_n2o}` : ''
      console.log(`  [${r.category}] ${r.substance}: ${r.fe_co2eq} ${r.unit_input}${co2}${ch4}${n2o}  (${r.country})`)
    }
    return
  }

  // 1) Delete existing DEFRA 2025 records
  console.log(`\nEliminazione record esistenti source='${SOURCE}'...`)
  if (!await deleteExisting()) { process.exit(1) }
  console.log('  OK')

  // 2) Insert in batch da 50
  const batchSize = 50
  let success = 0
  for (let i = 0; i < deduped.length; i += batchSize) {
    const batch = deduped.slice(i, i + batchSize)
    if (await insertBatch(batch)) {
      success += batch.length
      console.log(`  Inseriti ${success}/${deduped.length}...`)
    } else {
      console.error(`  ERRORE nel batch ${i}-${i + batchSize}`)
      process.exit(1)
    }
  }

  console.log(`\nImport completato: ${success} fattori di emissione DEFRA 2025 inseriti in emission_factors.`)
}

main()
