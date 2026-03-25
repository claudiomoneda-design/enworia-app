/**
 * DEFRA 2025 — Comprehensive Emission Factors Import for Enworia
 * ================================================================
 * Parsifica TUTTI i fogli rilevanti del file DEFRA 2025 e popola emission_factors su Supabase.
 * Strategia: DELETE source='DEFRA 2025' poi INSERT (idempotente).
 *
 * node import_defra_2025.mjs --file ghg-conversion-factors-2025-full-set.xlsx --dry-run
 * node import_defra_2025.mjs --file ghg-conversion-factors-2025-full-set.xlsx
 */

import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import XLSX from 'xlsx'

const __dirname = dirname(fileURLToPath(import.meta.url))

// ── Config ──────────────────────────────────────────────────────────────────
function loadEnv() {
  const p = resolve(__dirname, '.env.local')
  if (!existsSync(p)) return
  for (const l of readFileSync(p, 'utf-8').split('\n')) {
    const t = l.trim()
    if (!t || t.startsWith('#') || !t.includes('=')) continue
    const i = t.indexOf('=')
    const k = t.slice(0, i).trim(), v = t.slice(i + 1).trim().replace(/^["']|["']$/g, '')
    if (!process.env[k]) process.env[k] = v
  }
}
loadEnv()

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
if (!SUPA_URL || !SUPA_KEY) { console.error('Missing Supabase env vars'); process.exit(1) }

const SOURCE = 'DEFRA 2025', YEAR = 2025
const args = process.argv.slice(2)
let filePath = 'ghg-conversion-factors-2025-full-set.xlsx', dryRun = false
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--file' && args[i + 1]) filePath = args[++i]
  else if (args[i] === '--dry-run') dryRun = true
}

// ── Supabase ────────────────────────────────────────────────────────────────
const hdrs = { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}`, 'Content-Type': 'application/json' }
async function deleteExisting() {
  const r = await fetch(`${SUPA_URL}/rest/v1/emission_factors?source=eq.${encodeURIComponent(SOURCE)}`, { method: 'DELETE', headers: hdrs })
  return r.status === 200 || r.status === 204
}
async function insertBatch(recs) {
  const r = await fetch(`${SUPA_URL}/rest/v1/emission_factors`, {
    method: 'POST', headers: { ...hdrs, Prefer: 'return=representation' }, body: JSON.stringify(recs),
  })
  if (r.status !== 200 && r.status !== 201) { console.error(`INSERT ${r.status}: ${await r.text()}`); return false }
  return true
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function sf(v) { if (v == null) return null; const n = Number(v); return isNaN(n) ? null : n }
function rows(wb, name) {
  const ws = wb.Sheets[name]
  if (!ws) { console.error(`  Sheet "${name}" not found`); return [] }
  return XLSX.utils.sheet_to_json(ws, { header: 1, defval: null })
}

/** Metric units only — exclude miles, imperial gallons etc. */
const METRIC = new Set(['litres','cubic metres','kWh','kWh (Net CV)','kWh (Gross CV)',
  'tonnes','kg','km','tonne.km','passenger.km','Room per night','million litres',
  'per FTE Working Hour'])
function isMetric(u) { return u && METRIC.has(String(u).trim()) }

/** Map raw unit to clean unit for DB */
function cleanUnit(u) {
  const s = String(u).trim()
  if (s === 'cubic metres') return 'm3'
  if (s === 'kWh (Net CV)' || s === 'kWh (Gross CV)') return 'kWh'
  if (s === 'tonnes') return 'tonnellate'
  if (s === 'tonne.km') return 'tkm'
  if (s === 'passenger.km') return 'pkm'
  if (s === 'Room per night') return 'notte'
  if (s === 'million litres') return 'Ml'
  if (s === 'per FTE Working Hour') return 'ora_FTE'
  return s
}

function slug(s) { return s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '') }

function rec(category, substance, unitInput, co2eq, co2, ch4, n2o, country = 'UK', notes = null) {
  const v = sf(co2eq)
  if (v == null) return null
  return { category, substance, unit_input: unitInput, fe_co2eq: v, fe_co2: sf(co2), fe_ch4: sf(ch4), fe_n2o: sf(n2o),
    gwp_source: 'IPCC AR6', source: SOURCE, year: YEAR, country, notes, is_default: false }
}

// ── 1. FUELS — all combustibles ─────────────────────────────────────────────
// cols: 0=Activity 1=Fuel 2=Unit 3=total 4=CO2 5=CH4 6=N2O
function parseFuels(wb) {
  const data = rows(wb, 'Fuels'), out = []
  let currentFuel = null
  for (const r of data) {
    if (r[1] && typeof r[1] === 'string') currentFuel = r[1]
    if (!currentFuel || !isMetric(r[2])) continue
    if (sf(r[3]) == null) continue
    const sub = slug(currentFuel) + '_defra'
    const unit = cleanUnit(r[2])
    // Skip kWh variants to avoid duplicates (keep litres/m3/tonnes/kg)
    if ((unit === 'kWh') && (r[2] === 'kWh (Gross CV)')) continue
    const o = rec('combustion', sub + '_' + slug(r[2]), unit, r[3], r[4], r[5], r[6], 'UK', `DEFRA 2025 - ${currentFuel}`)
    if (o) out.push(o)
  }
  return out
}

// ── 2. UK ELECTRICITY ────────────────────────────────────────────────────────
// cols: 0=Act 1=Country 2=Unit 3=Year 4=total 5=CO2 6=CH4 7=N2O
function parseElectricity(wb) {
  const data = rows(wb, 'UK electricity'), out = []
  for (const r of data) {
    if (r[1] && String(r[1]).includes('Electricity: UK') && r[2] === 'kWh') {
      const o = rec('electricity', 'uk_grid_defra', 'kWh', r[4], r[5], r[6], r[7], 'UK', 'DEFRA 2025 UK grid')
      if (o) out.push(o)
    }
  }
  return out
}

// ── 3. HEAT AND STEAM ────────────────────────────────────────────────────────
function parseHeat(wb) {
  const data = rows(wb, 'Heat and steam'), out = []
  for (const r of data) {
    if (!r[1] || r[2] !== 'kWh') continue
    const label = String(r[1]).trim()
    if (label.includes('Onsite')) out.push(rec('heat', 'heat_onsite_defra', 'kWh', r[4], r[5], r[6], r[7], 'UK', 'DEFRA 2025 onsite CHP'))
    if (label.includes('District')) out.push(rec('heat', 'heat_district_defra', 'kWh', r[4], r[5], r[6], r[7], 'UK', 'DEFRA 2025 district'))
  }
  return out.filter(Boolean)
}

// ── 4. PASSENGER VEHICLES — multi-fuel: cols 3-6=Diesel, 7-10=Petrol, 11-14=Hybrid ──
function parsePassengerVehicles(wb) {
  const data = rows(wb, 'Passenger vehicles'), out = []
  let currentActivity = null
  const fuelGroups = [
    { offset: 3, suffix: 'diesel' },
    { offset: 7, suffix: 'petrol' },
    // hybrid often null, skip if no data
  ]
  for (const r of data) {
    if (r[0] && typeof r[0] === 'string' && !r[0].startsWith('●') && !r[0].startsWith('Company') && r[0].length < 60
        && !['UK Government','Passenger vehicles','Index','Emissions source:','Scope:','Guidance','Activity'].includes(r[0]))
      currentActivity = r[0]
    if (r[2] !== 'km') continue
    const type = r[1] ? String(r[1]).trim() : null
    if (!type) continue
    for (const fg of fuelGroups) {
      const total = sf(r[fg.offset])
      if (total == null) continue
      const sub = `vehicle_${slug(type)}_${fg.suffix}_defra`
      out.push(rec('vehicle', sub, 'km', total, sf(r[fg.offset + 1]), sf(r[fg.offset + 2]), sf(r[fg.offset + 3]),
        'UK', `DEFRA 2025 - ${currentActivity} - ${type} - ${fg.suffix}`))
    }
    // Hybrid col 11
    if (sf(r[11]) != null) {
      out.push(rec('vehicle', `vehicle_${slug(type)}_hybrid_defra`, 'km', r[11], sf(r[12]), sf(r[13]), sf(r[14]),
        'UK', `DEFRA 2025 - ${currentActivity} - ${type} - hybrid`))
    }
  }
  return out.filter(Boolean)
}

// ── 5. DELIVERY VEHICLES — same multi-fuel layout ───────────────────────────
function parseDeliveryVehicles(wb) {
  const data = rows(wb, 'Delivery vehicles'), out = []
  let currentActivity = null
  for (const r of data) {
    if (r[0] && typeof r[0] === 'string' && r[0].length < 40 && !r[0].startsWith('●') && !r[0].startsWith('Company')
        && !['UK Government','Delivery vehicles','Index','Emissions source:','Scope:','Guidance','Activity'].includes(r[0]))
      currentActivity = r[0]
    if (r[2] !== 'km') continue
    const type = r[1] ? String(r[1]).trim() : null
    if (!type) continue
    // Diesel cols 3-6
    if (sf(r[3]) != null) {
      out.push(rec('vehicle', `delivery_${slug(type)}_diesel_defra`, 'km', r[3], r[4], r[5], r[6],
        'UK', `DEFRA 2025 - ${currentActivity || 'Delivery'} - ${type} - diesel`))
    }
    // Petrol cols 7-10
    if (sf(r[7]) != null) {
      out.push(rec('vehicle', `delivery_${slug(type)}_petrol_defra`, 'km', r[7], r[8], r[9], r[10],
        'UK', `DEFRA 2025 - ${currentActivity || 'Delivery'} - ${type} - petrol`))
    }
  }
  return out.filter(Boolean)
}

// ── 6. FREIGHTING GOODS — multi-fuel, tonne.km AND km ───────────────────────
function parseFreight(wb) {
  const data = rows(wb, 'Freighting goods'), out = []
  let currentActivity = null
  const seen = new Set()
  for (const r of data) {
    if (r[0] && typeof r[0] === 'string' && r[0].length < 60 && !r[0].startsWith('●')
        && !['UK Government','Freighting goods','Index','Emissions source:','Scope:','Guidance','Activity'].includes(r[0]))
      currentActivity = r[0]
    const type = r[1] ? String(r[1]).trim() : null
    const unit = r[2] ? String(r[2]).trim() : null
    if (!type || !isMetric(unit)) continue

    const cu = cleanUnit(unit)
    // Try diesel (col 3) then petrol (col 7)
    const totalD = sf(r[3]), totalP = sf(r[7])
    if (totalD == null && totalP == null) continue

    // Use whichever has data (or both for different column groups)
    const total = totalD ?? totalP
    const co2 = sf(r[totalD != null ? 4 : 8])
    const ch4 = sf(r[totalD != null ? 5 : 9])
    const n2o = sf(r[totalD != null ? 6 : 10])

    const base = `freight_${slug(type)}_defra`
    if (cu === 'tkm') {
      // Upstream 3_1 + Downstream 3_2
      const keyUp = `${base}_upstream|${cu}`
      const keyDw = `${base}_downstream|${cu}`
      if (!seen.has(keyUp)) {
        out.push(rec('freight', `${base}_upstream`, cu, total, co2, ch4, n2o, 'UK', `DEFRA 2025 - ${currentActivity || ''} - ${type} - ${unit}`))
        seen.add(keyUp)
      }
      if (!seen.has(keyDw)) {
        out.push(rec('freight', `${base}_downstream`, cu, total, co2, ch4, n2o, 'UK', `DEFRA 2025 - ${currentActivity || ''} - ${type} - ${unit}`))
        seen.add(keyDw)
      }
    } else if (cu === 'km') {
      const key = `${base}|${cu}`
      if (!seen.has(key)) {
        out.push(rec('freight', base, cu, total, co2, ch4, n2o, 'UK', `DEFRA 2025 - ${currentActivity || ''} - ${type} - km`))
        seen.add(key)
      }
    }
  }
  return out.filter(Boolean)
}

// ── 7. BUSINESS TRAVEL LAND — multi-fuel ────────────────────────────────────
function parseTravelLand(wb) {
  const data = rows(wb, 'Business travel- land'), out = []
  let currentActivity = null
  const seen = new Set()
  for (const r of data) {
    if (r[0] && typeof r[0] === 'string' && r[0].length < 60 && !r[0].startsWith('●') && !r[0].startsWith('Company')
        && !['UK Government','Business travel- land','Index','Emissions source:','Scope:','Guidance','Activity'].includes(r[0]))
      currentActivity = r[0]
    const type = r[1] ? String(r[1]).trim() : null
    const rawUnit = r[2] ? String(r[2]).trim() : null
    if (!type || !isMetric(rawUnit)) continue

    const cu = cleanUnit(rawUnit)
    // First column group with data (col 3 = diesel/first, col 7 = petrol/second)
    const total = sf(r[3]) ?? sf(r[7])
    if (total == null) continue
    const idx = sf(r[3]) != null ? 3 : 7
    const co2 = sf(r[idx + 1]), ch4 = sf(r[idx + 2]), n2o = sf(r[idx + 3])

    const sub = `travel_${slug(type)}_defra`
    const key = `${sub}|${cu}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(rec('travel', sub, cu, total, co2, ch4, n2o, 'UK', `DEFRA 2025 - ${currentActivity || ''} - ${type}`))
  }
  return out.filter(Boolean)
}

// ── 8. BUSINESS TRAVEL AIR — With RF cols 4-7, Without RF cols 8-11 ─────────
function parseTravelAir(wb) {
  const data = rows(wb, 'Business travel- air'), out = []
  let currentHaul = null
  for (const r of data) {
    if (r[1] && typeof r[1] === 'string') currentHaul = String(r[1]).trim()
    if (r[3] !== 'passenger.km') continue
    const cls = r[2] ? String(r[2]).trim() : null
    if (!cls || sf(r[4]) == null) continue
    const sub = `flight_${slug(currentHaul || 'unknown')}_${slug(cls)}_defra`
    out.push(rec('travel', sub, 'pkm', r[4], r[5], r[6], r[7], 'UK',
      `DEFRA 2025 - ${currentHaul} - ${cls} (with radiative forcing)`))
  }
  return out.filter(Boolean)
}

// ── 9. HOTEL STAY ───────────────────────────────────────────────────────────
function parseHotel(wb) {
  const data = rows(wb, 'Hotel stay'), out = []
  const ccMap = { Italy:'IT', UK:'UK', France:'FR', Germany:'DE', 'United States':'US', Spain:'ES',
    Switzerland:'CH', Netherlands:'NL', Portugal:'PT', Belgium:'BE', Japan:'JP', China:'CN',
    Australia:'AU', Canada:'CA', Brazil:'BR', India:'IN', Mexico:'MX', Singapore:'SG' }
  for (const r of data) {
    let country = null, val = null
    if (r[0] && String(r[0]).trim() === 'Hotel stay' && r[1]) { country = String(r[1]).trim(); val = sf(r[3]) }
    else if (r[0] == null && r[1] && r[2] === 'Room per night') { country = String(r[1]).trim(); val = sf(r[3]) }
    if (!country || val == null) continue
    out.push(rec('hotel', `hotel_${slug(country)}_defra`, 'notte', val, null, null, null,
      ccMap[country] || 'INT', `DEFRA 2025 - Hotel ${country}`))
  }
  const seen = new Set()
  return out.filter(Boolean).filter(r => { if (seen.has(r.substance)) return false; seen.add(r.substance); return true })
}

// ── 10. WASTE DISPOSAL — cols: 3=open-loop 4=closed-loop 5=incineration 6=composting 7=landfill 8=AD
function parseWaste(wb) {
  const data = rows(wb, 'Waste disposal'), out = []
  let currentActivity = null
  const methods = [
    [3, 'open_loop'], [4, 'closed_loop'], [5, 'incineration'],
    [6, 'composting'], [7, 'landfill'], [8, 'anaerobic_digestion'],
  ]
  for (const r of data) {
    if (r[0] && typeof r[0] === 'string' && r[0].length < 50 && !r[0].startsWith('●')
        && !['UK Government','Waste disposal','Index','Emissions source:','Scope:','Guidance','Activity'].includes(r[0]))
      currentActivity = r[0]
    if (r[2] !== 'tonnes') continue
    const type = r[1] ? String(r[1]).trim() : null
    if (!type) continue
    for (const [col, method] of methods) {
      const val = sf(r[col])
      if (val == null) continue
      out.push(rec('waste', `waste_${slug(type)}_${method}_defra`, 'tonnellate', val, null, null, null, 'UK',
        `DEFRA 2025 - ${currentActivity || ''} - ${type} - ${method}`))
    }
  }
  return out.filter(Boolean)
}

// ── 11. MATERIAL USE — cols: 3=primary 4=reused 5=open-loop 6=closed-loop ──
function parseMaterials(wb) {
  const data = rows(wb, 'Material use'), out = []
  let currentActivity = null
  const sources = [[3, 'primary'], [4, 'reused'], [5, 'open_loop'], [6, 'closed_loop']]
  for (const r of data) {
    if (r[0] && typeof r[0] === 'string' && r[0].length < 50 && !r[0].startsWith('●')
        && !['UK Government','Material use','Index','Emissions source:','Scope:','Guidance','Activity'].includes(r[0]))
      currentActivity = r[0]
    if (r[2] !== 'tonnes') continue
    const mat = r[1] ? String(r[1]).trim() : null
    if (!mat) continue
    for (const [col, src] of sources) {
      const val = sf(r[col])
      if (val == null) continue
      out.push(rec('material', `material_${slug(mat)}_${src}_defra`, 'tonnellate', val, null, null, null, 'UK',
        `DEFRA 2025 - ${currentActivity || ''} - ${mat} - ${src}`))
    }
  }
  return out.filter(Boolean)
}

// ── 12. REFRIGERANT & OTHER — col 3=Kyoto, 5=Total ─────────────────────────
function parseRefrigerants(wb) {
  const data = rows(wb, 'Refrigerant & other'), out = []
  let currentActivity = null
  for (const r of data) {
    if (r[0] && typeof r[0] === 'string' && r[0].length < 60 && !r[0].startsWith('●')
        && !['UK Government','Refrigerant & other','Index','Emissions source:','Scope:','Guidance','Activity'].includes(r[0]))
      currentActivity = r[0]
    if (r[2] !== 'kg') continue
    const gas = r[1] ? String(r[1]).trim() : null
    if (!gas) continue
    // Use col 5 (Total) if available, else col 3 (Kyoto only)
    const val = sf(r[5]) ?? sf(r[3])
    if (val == null) continue
    out.push(rec('hfc', `${slug(gas)}_defra`, 'kg', val, val, null, null, 'UK',
      `DEFRA 2025 - ${currentActivity || ''} - GWP ${gas}`))
  }
  return out.filter(Boolean)
}

// ── 13. WATER SUPPLY — simple: col 3=total ──────────────────────────────────
function parseWaterSupply(wb) {
  const data = rows(wb, 'Water supply'), out = []
  for (const r of data) {
    if (r[0] === 'Water supply' && r[1] === 'Water supply' && r[2] === 'cubic metres') {
      out.push(rec('water', 'water_supply_defra', 'm3', r[3], null, null, null, 'UK', 'DEFRA 2025 - Water supply'))
    }
  }
  return out.filter(Boolean)
}

// ── 14. WATER TREATMENT — simple: col 3=total ──────────────────────────────
function parseWaterTreatment(wb) {
  const data = rows(wb, 'Water treatment'), out = []
  for (const r of data) {
    if (r[0] === 'Water treatment' && r[1] === 'Water treatment' && r[2] === 'cubic metres') {
      out.push(rec('water', 'water_treatment_defra', 'm3', r[3], null, null, null, 'UK', 'DEFRA 2025 - Water treatment'))
    }
  }
  return out.filter(Boolean)
}

// ── 15. HOMEWORKING — shifted layout: col 0=Activity, 1=Unit, 2=kgCO2e ─────
function parseHomeworking(wb) {
  const data = rows(wb, 'Homeworking'), out = []
  for (const r of data) {
    if (r[1] !== 'per FTE Working Hour') continue
    const act = r[0] ? String(r[0]).trim() : null
    if (!act) continue
    out.push(rec('homeworking', `homeworking_${slug(act)}_defra`, 'ora_FTE', r[2], null, null, null, 'UK',
      `DEFRA 2025 - ${act}`))
  }
  return out.filter(Boolean)
}

// ── 16. TRANSMISSION & DISTRIBUTION — year-prefixed: col 4=total 5=CO2 6=CH4 7=N2O
function parseTD(wb) {
  const data = rows(wb, 'Transmission and distribution'), out = []
  for (const r of data) {
    if (r[2] !== 'kWh' || sf(r[4]) == null) continue
    const type = r[1] ? String(r[1]).trim() : (r[0] ? String(r[0]).trim() : null)
    if (!type) continue
    out.push(rec('transmission', `td_${slug(type)}_defra`, 'kWh', r[4], r[5], r[6], r[7], 'UK',
      `DEFRA 2025 - T&D - ${type}`))
  }
  return out.filter(Boolean)
}

// ── MAIN ────────────────────────────────────────────────────────────────────
async function main() {
  if (!existsSync(filePath)) { console.error(`File not found: ${filePath}`); process.exit(1) }
  console.log(`Loading: ${filePath}`)
  const wb = XLSX.readFile(filePath)

  const allRecords = []
  const parsers = [
    ['Fuels', parseFuels],
    ['UK Electricity', parseElectricity],
    ['Heat and Steam', parseHeat],
    ['Passenger Vehicles', parsePassengerVehicles],
    ['Delivery Vehicles', parseDeliveryVehicles],
    ['Freighting Goods', parseFreight],
    ['Business Travel Land', parseTravelLand],
    ['Business Travel Air', parseTravelAir],
    ['Hotel Stay', parseHotel],
    ['Waste Disposal', parseWaste],
    ['Material Use', parseMaterials],
    ['Refrigerant & Other', parseRefrigerants],
    ['Water Supply', parseWaterSupply],
    ['Water Treatment', parseWaterTreatment],
    ['Homeworking', parseHomeworking],
    ['Transmission & Distribution', parseTD],
  ]

  for (const [label, fn] of parsers) {
    try {
      const recs = fn(wb)
      console.log(`  ${label}: ${recs.length} record`)
      allRecords.push(...recs)
    } catch (e) { console.error(`  ERROR ${label}: ${e.message}`) }
  }

  // Deduplicate by substance + unit_input
  const seen = new Set()
  const deduped = allRecords.filter(r => {
    if (!r) return false
    const key = `${r.substance}|${r.unit_input}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  console.log(`\nTotal unique records: ${deduped.length}`)

  if (dryRun) {
    console.log('\n--- DRY RUN ---')
    const byCat = {}
    for (const r of deduped) { byCat[r.category] = (byCat[r.category] || 0) + 1 }
    console.log('\nPer category:')
    for (const [cat, n] of Object.entries(byCat).sort((a, b) => b[1] - a[1])) console.log(`  ${cat}: ${n}`)
    console.log('\nSample (first 30):')
    for (const r of deduped.slice(0, 30)) {
      const d = [r.fe_co2 != null ? `co2=${r.fe_co2}` : '', r.fe_ch4 != null ? `ch4=${r.fe_ch4}` : '', r.fe_n2o != null ? `n2o=${r.fe_n2o}` : ''].filter(Boolean).join(' ')
      console.log(`  [${r.category}] ${r.substance}: ${r.fe_co2eq} ${r.unit_input} ${d}`)
    }
    return
  }

  console.log(`\nDeleting existing source='${SOURCE}'...`)
  if (!await deleteExisting()) { process.exit(1) }
  console.log('  OK')

  const BS = 50
  let ok = 0
  for (let i = 0; i < deduped.length; i += BS) {
    const batch = deduped.slice(i, i + BS)
    if (await insertBatch(batch)) { ok += batch.length; console.log(`  Inserted ${ok}/${deduped.length}...`) }
    else { console.error(`  FAILED batch ${i}-${i + BS}`); process.exit(1) }
  }
  console.log(`\nDone: ${ok} DEFRA 2025 emission factors inserted into emission_factors.`)
}

main()
