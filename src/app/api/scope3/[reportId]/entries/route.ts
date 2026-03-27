import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

// Spend-based emission factors (kgCO2e per EUR)
const SPEND_FACTORS: Record<string, number> = {
  raw: 0.45,
  fin: 0.32,
  srv: 0.18,
  mix: 0.35,
};

// Category-specific spend factors
const CATEGORY_SPEND_FACTORS: Record<string, number> = {
  "3.1": 0.12, // trasporto fornitori
  "3.2": 0.12, // trasporto clienti
  "3.3": 0.12, // pendolarismo
  "3.5": 0.25, // viaggi aziendali
  "4.3": 0.18, // rifiuti
  "4.2": 0.35, // acquisti strumentali
};

// GET — entries for a report
export async function GET(
  _req: NextRequest,
  { params }: { params: { reportId: string } },
) {
  const { reportId } = params;

  const { data, error } = await sb
    .from("scope3_entries")
    .select("*, scope3_subcategories(subcategory_code, name_it, card_icon)")
    .eq("report_id", reportId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

// POST — save entry + auto-calculate co2e spend-based
export async function POST(
  req: NextRequest,
  { params }: { params: { reportId: string } },
) {
  const { reportId } = params;
  const body = await req.json();
  const {
    subcategory_id,
    screening_id,
    spend_eur,
    purchase_type,
    has_category_detail,
    quantity_kg,
    material_type,
    supplier_name,
    data_source,
    notes,
    subcategory_code,
  } = body;

  if (!subcategory_id) {
    return NextResponse.json({ error: "subcategory_id required" }, { status: 400 });
  }

  // Determine emission factor + method
  let ef = 0;
  let efSource = "";
  let efMethod: "spend_based" | "activity_based" = "spend_based";
  let co2eTonnes = 0;
  let precisionLevel = 1;

  if (quantity_kg && quantity_kg > 0) {
    // Activity-based (Tier 2+) — placeholder factor
    ef = 0.5; // kgCO2e per kg — generic placeholder
    efSource = "Generic activity-based placeholder";
    efMethod = "activity_based";
    co2eTonnes = (quantity_kg * ef) / 1000;
    precisionLevel = 2;
  } else if (spend_eur && spend_eur > 0) {
    // Spend-based
    const catFactor = subcategory_code ? CATEGORY_SPEND_FACTORS[subcategory_code] : null;
    ef = catFactor ?? SPEND_FACTORS[purchase_type ?? "mix"] ?? 0.35;
    efSource = `Spend-based ${subcategory_code ?? purchase_type ?? "mix"}`;
    efMethod = "spend_based";
    co2eTonnes = (spend_eur * ef) / 1000;
    precisionLevel = 1;
  }

  const row = {
    report_id: reportId,
    subcategory_id,
    screening_id: screening_id ?? null,
    spend_eur: spend_eur ?? null,
    purchase_type: purchase_type ?? null,
    has_category_detail: has_category_detail ?? false,
    quantity_kg: quantity_kg ?? null,
    material_type: material_type ?? null,
    supplier_name: supplier_name ?? null,
    emission_factor: ef,
    emission_factor_source: efSource,
    emission_factor_method: efMethod,
    co2e_tonnes: co2eTonnes,
    precision_level: precisionLevel,
    data_source: data_source ?? null,
    notes: notes ?? null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await sb
    .from("scope3_entries")
    .upsert(row, { onConflict: "report_id,subcategory_id" })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
