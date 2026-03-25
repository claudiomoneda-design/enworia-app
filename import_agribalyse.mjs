/**
 * AGRIBALYSE 3.2 — Import fattori emissione alimentari per Enworia
 * ==================================================================
 * Parsifica Agribalyse_Synthese.csv e popola emission_factors su Supabase.
 * Strategia: DELETE source='AGRIBALYSE 3.2' poi INSERT (idempotente).
 *
 * node import_agribalyse.mjs --file Agribalyse_Synthese.csv --dry-run
 * node import_agribalyse.mjs --file Agribalyse_Synthese.csv
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
const SOURCE = 'AGRIBALYSE 3.2'
const YEAR = 2025

const cliArgs = process.argv.slice(2)
let filePath = 'Agribalyse_Synthese.csv', dryRun = false
for (let i = 0; i < cliArgs.length; i++) {
  if (cliArgs[i] === '--file' && cliArgs[i + 1]) filePath = cliArgs[++i]
  else if (cliArgs[i] === '--dry-run') dryRun = true
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

// ── CSV parser with proper quote handling ────────────────────────────────────
function parseCsvLine(line) {
  const fields = []
  let current = '', inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++ } // escaped quote
      else inQuotes = !inQuotes
    } else if (ch === ',' && !inQuotes) {
      fields.push(current.trim())
      current = ''
    } else {
      current += ch
    }
  }
  fields.push(current.trim())
  return fields
}

function parseCsv(content) {
  const lines = content.split('\n')
  const headers = parseCsvLine(lines[0])
  const out = []
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    const vals = parseCsvLine(line)
    const row = {}
    for (let j = 0; j < headers.length; j++) row[headers[j]] = vals[j] || ''
    out.push(row)
  }
  return out
}

function num(v) {
  if (!v || v === '' || v === 'Pas de préparation') return null
  const n = parseFloat(v.replace(',', '.'))
  return isNaN(n) ? null : n
}

function slug(s) { return s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '').substring(0, 80) }

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  if (!fs.existsSync(filePath)) { console.error(`File not found: ${filePath}`); process.exit(1) }

  console.log(`Loading: ${filePath}`)
  const content = fs.readFileSync(filePath, 'utf-8')
  const csvRows = parseCsv(content)
  console.log(`Total CSV rows: ${csvRows.length}`)

  const records = []
  const seen = new Set()
  const groupCounts = {}

  for (const row of csvRows) {
    const codeAgb = row['Code AGB'] || ''
    const nom = row['Nom du Produit en Français'] || ''
    const lciName = row['LCI Name'] || ''
    const groupe = row["Groupe d'aliment"] || ''
    const sousGroupe = row["Sous-groupe d'aliment"] || ''
    const ccValue = num(row['Changement climatique'])

    if (!codeAgb || ccValue == null || ccValue <= 0) continue
    if (seen.has(codeAgb)) continue
    seen.add(codeAgb)

    const substance = `agribalyse_${codeAgb}_${slug(nom)}`.substring(0, 120)
    const notes = [groupe, sousGroupe].filter(Boolean).join(' / ').substring(0, 200)

    records.push({
      category: 'material',
      substance,
      unit_input: 'kg',
      fe_co2eq: ccValue,
      fe_co2: null,
      fe_ch4: null,
      fe_n2o: null,
      gwp_source: 'IPCC AR6',
      source: SOURCE,
      year: YEAR,
      country: 'FR',
      notes,
      is_default: false,
    })

    groupCounts[groupe] = (groupCounts[groupe] || 0) + 1
  }

  console.log('\nRecords per gruppo alimentare:')
  for (const [g, n] of Object.entries(groupCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${g.padEnd(55)} ${n}`)
  }
  console.log(`\nTotal unique records: ${records.length}`)

  if (dryRun) {
    console.log('\n--- DRY RUN --- (first 15)')
    for (const r of records.slice(0, 15)) {
      console.log(`  ${r.substance.substring(0, 65).padEnd(65)} ${String(r.fe_co2eq).padStart(8)} ${r.unit_input}`)
    }
    return
  }

  if (!SUPA_URL || !SUPA_KEY) { console.error('Missing Supabase env vars'); process.exit(1) }

  console.log(`\nDeleting existing source='${SOURCE}'...`)
  if (!await deleteExisting()) { process.exit(1) }
  console.log('  OK')

  const BS = 50
  let ok = 0
  for (let i = 0; i < records.length; i += BS) {
    const batch = records.slice(i, i + BS)
    if (await insertBatch(batch)) { ok += batch.length; if (ok % 200 === 0 || ok === records.length) console.log(`  Inserted ${ok}/${records.length}...`) }
    else { console.error(`\n  FAILED batch ${i}-${i + BS}`); process.exit(1) }
  }
  console.log(`\n\nDone: ${ok} AGRIBALYSE 3.2 factors inserted into emission_factors.`)
}

main().catch(e => { console.error('ERROR:', e.message); process.exit(1) })
