/**
 * ADEME Base Carbone v23.9 — Import per Enworia
 * ================================================
 * Parsifica Base_Carbone_V23.9.csv e popola emission_factors su Supabase.
 * Strategia: DELETE source='ADEME Base Carbone' poi INSERT (idempotente).
 *
 * node import_ademe_2025.mjs --file Base_Carbone_V23.9.csv --dry-run
 * node import_ademe_2025.mjs --file Base_Carbone_V23.9.csv
 */

import fs from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// ── Config ──────────────────────────────────────────────────────────────────
function loadEnv() {
  const p = resolve(__dirname, '.env.local')
  if (!fs.existsSync(p)) return
  for (const l of fs.readFileSync(p, 'utf-8').split('\n')) {
    const t = l.trim()
    if (!t || t.startsWith('#') || !t.includes('=')) continue
    const i = t.indexOf('=')
    if (!process.env[t.slice(0, i).trim()]) process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/^["']|["']$/g, '')
  }
}
loadEnv()

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SOURCE = 'ADEME Base Carbone'
const YEAR = 2025

const args = process.argv.slice(2)
let filePath = 'Base_Carbone_V23.9.csv', dryRun = false
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
    method: 'POST', headers: { ...hdrs, Prefer: 'return=minimal' }, body: JSON.stringify(recs),
  })
  if (r.status !== 200 && r.status !== 201) { console.error(`INSERT ${r.status}: ${await r.text()}`); return false }
  return true
}

// ── CSV Parser ──────────────────────────────────────────────────────────────
function parseCsv(content) {
  const lines = content.split('\n')
  const headers = lines[0].split(';').map(h => h.trim().replace(/^\uFEFF/, ''))
  const out = []
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    const vals = line.split(';')
    const row = {}
    for (let j = 0; j < headers.length; j++) row[headers[j]] = (vals[j] || '').trim()
    out.push(row)
  }
  return out
}

function num(v) {
  if (!v || v === '' || v === 'NaN') return null
  const n = parseFloat(v.replace(',', '.'))
  return isNaN(n) ? null : n
}

// ── Mappings ────────────────────────────────────────────────────────────────
// Category → DB category
function mapDbCategory(cat) {
  const c = cat.toLowerCase()
  if (c.includes('combustibles')) return 'combustion'
  if (c.includes('électricité') || c.includes('electricité') || c.includes('electricite')) return 'electricity'
  if (c.includes('réseaux de chaleur') || c.includes('chaleur')) return 'heat'
  if (c.includes('transport de marchandises')) return 'freight'
  if (c.includes('transport de personnes')) return 'travel'
  if (c.includes('traitement des déchets') || c.includes('déchets')) return 'waste'
  if (c.includes('achats de biens')) return 'material'
  if (c.includes('achats de services')) return 'material'
  if (c.includes('process') || c.includes('fugitives')) return 'hfc'
  return 'material'
}

// Unit mapping
function mapUnit(u) {
  if (!u) return null
  const s = u.toLowerCase()
  if (s.includes('kg de poids') || s === 'kgco2e/kg') return 'kg'
  if (s.includes('kwh')) return 'kWh'
  if (s.includes('t.km') || s.includes('tonne.km')) return 'tkm'
  if (s.includes('tonne de déchets') || s.includes('tonne')) return 'tonnellate'
  if (s.includes('passager.km') || s.includes('passenger.km')) return 'pkm'
  if (s.includes('litre')) return 'litri'
  if (s.includes('m3') || s.includes('m³')) return 'm3'
  if (s.includes('km')) return 'km'
  if (s.includes('unité')) return 'unita'
  return null // skip unknown units
}

// Accepted units
const UNIT_OK = new Set([
  'kgCO2e/kg de poids net', 'kgCO2e/kg', 'kgCO2e/kWh', 'kgCO2e/kWh PCI',
  'kgCO2e/t.km', 'kgCO2e/tonne.km', 'kgCO2e/tonne', 'kgCO2e/tonne de déchets',
  'kgCO2e/passager.km', 'kgCO2e/litre', 'kgCO2e/m3', 'kgCO2e/m²',
  'kgCO2e/unité', 'kgCO2e/km', 'kgCO2e/véhicule.km', 'kgCO2e/TEU.km',
])

// Top-level categories to include
const CAT_OK = [
  'Combustibles', 'Electricité', 'Électricité', 'Réseaux de chaleur',
  'Transport de marchandises', 'Transport de personnes',
  'Traitement des déchets', 'Achats de biens', 'Achats de services',
  'Process et émissions fugitives',
]

function slug(s) { return s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '').substring(0, 80) }

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  if (!fs.existsSync(filePath)) { console.error(`File not found: ${filePath}`); process.exit(1) }

  console.log(`Loading: ${filePath}`)
  const content = fs.readFileSync(filePath).toString('latin1')
  const csvRows = parseCsv(content)
  console.log(`Total CSV rows: ${csvRows.length}`)

  // Filter valid elements
  const elements = csvRows.filter(r =>
    r['Type Ligne'] === 'Elément' &&
    (r["Statut de l'élément"] === 'Valide générique' || r["Statut de l'élément"] === 'Valide spécifique')
  )
  console.log(`Valid elements: ${elements.length}`)

  const records = []
  const seen = new Set()
  const catCounts = {}

  for (const row of elements) {
    const cat = row['Code de la catégorie'] || ''
    const catPrimary = cat.split('>')[0].trim()
    const unitRaw = row['Unité français'] || ''

    // Filter category
    if (!CAT_OK.some(c => catPrimary.startsWith(c))) continue
    // Filter unit
    if (!UNIT_OK.has(unitRaw)) continue

    const value = num(row['Total poste non décomposé'])
    if (value == null || value <= 0) continue

    const unitDb = mapUnit(unitRaw)
    if (!unitDb) continue

    // Build substance name: ADEME ID + slug of name
    const id = row["Identifiant de l'élément"] || ''
    const nom = row['Nom base français'] || ''
    const attr = row['Nom attribut français'] || ''
    const substance = `ademe_${id}_${slug(nom + '_' + attr)}`.substring(0, 120)

    if (seen.has(substance)) continue
    seen.add(substance)

    const category = mapDbCategory(cat)
    const fe_co2 = num(row['CO2f'])
    const fe_ch4 = num(row['CH4f'])
    const fe_n2o = num(row['N2O'])
    const geo = row['Localisation géographique'] || ''
    const country = geo.includes('France') ? 'FR' : geo.includes('Europe') ? 'EU' : 'INT'

    records.push({
      category,
      substance,
      unit_input: unitDb,
      fe_co2eq: value,
      fe_co2: fe_co2,
      fe_ch4: fe_ch4,
      fe_n2o: fe_n2o,
      gwp_source: 'IPCC AR6',
      source: SOURCE,
      year: YEAR,
      country,
      notes: cat.substring(0, 200),
      is_default: false,
    })

    catCounts[catPrimary] = (catCounts[catPrimary] || 0) + 1
  }

  console.log('\nRecords per category:')
  for (const [c, n] of Object.entries(catCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${c.padEnd(50)} ${n}`)
  }
  console.log(`\nTotal unique records: ${records.length}`)

  // Per DB category
  const dbCats = {}
  for (const r of records) dbCats[r.category] = (dbCats[r.category] || 0) + 1
  console.log('\nPer DB category:')
  for (const [c, n] of Object.entries(dbCats).sort((a, b) => b[1] - a[1])) console.log(`  ${c}: ${n}`)

  if (dryRun) {
    console.log('\n--- DRY RUN --- (first 15)')
    for (const r of records.slice(0, 15)) {
      const d = [r.fe_co2 != null ? `co2=${r.fe_co2}` : '', r.fe_ch4 != null ? `ch4=${r.fe_ch4}` : '', r.fe_n2o != null ? `n2o=${r.fe_n2o}` : ''].filter(Boolean).join(' ')
      console.log(`  [${r.category}] ${r.substance.substring(0, 60)}: ${r.fe_co2eq} ${r.unit_input} ${d} (${r.country})`)
    }
    return
  }

  if (!SUPA_URL || !SUPA_KEY) { console.error('Missing Supabase env vars'); process.exit(1) }

  console.log(`\nDeleting existing source='${SOURCE}'...`)
  if (!await deleteExisting()) { process.exit(1) }
  console.log('  OK')

  const BS = 100
  let ok = 0
  for (let i = 0; i < records.length; i += BS) {
    const batch = records.slice(i, i + BS)
    if (await insertBatch(batch)) { ok += batch.length; process.stdout.write(`\r  Inserted ${ok}/${records.length}...`) }
    else { console.error(`\n  FAILED batch ${i}-${i + BS}`); process.exit(1) }
  }
  console.log(`\n\nDone: ${ok} ADEME Base Carbone factors inserted into emission_factors.`)
}

main().catch(e => { console.error('ERROR:', e.message); process.exit(1) })
