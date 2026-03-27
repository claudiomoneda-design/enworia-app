import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

// GET — screening + subcategories for a report
export async function GET(
  _req: NextRequest,
  { params }: { params: { reportId: string } },
) {
  const { reportId } = params;

  const [{ data: subcategories, error: subErr }, { data: screenings, error: scrErr }] =
    await Promise.all([
      sb.from("scope3_subcategories").select("*").eq("is_active", true).order("sort_order"),
      sb.from("scope3_screening").select("*").eq("report_id", reportId),
    ]);

  if (subErr) return NextResponse.json({ error: subErr.message }, { status: 500 });
  if (scrErr) return NextResponse.json({ error: scrErr.message }, { status: 500 });

  // Build a map subcategory_id → screening row
  const screeningMap: Record<string, unknown> = {};
  (screenings ?? []).forEach((s: Record<string, unknown>) => {
    screeningMap[s.subcategory_id as string] = s;
  });

  return NextResponse.json({ subcategories, screeningMap });
}

// POST — upsert screening answer
export async function POST(
  req: NextRequest,
  { params }: { params: { reportId: string } },
) {
  const { reportId } = params;
  const body = await req.json();
  const { subcategory_id, has_activity, data_availability, data_source } = body;

  if (!subcategory_id) {
    return NextResponse.json({ error: "subcategory_id required" }, { status: 400 });
  }

  const row = {
    report_id: reportId,
    subcategory_id,
    has_activity: has_activity ?? null,
    data_availability: has_activity ? (data_availability ?? null) : null,
    data_source: has_activity && data_availability && data_availability !== "no" ? (data_source ?? null) : null,
    significance: has_activity === false ? "na" : "na",
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await sb
    .from("scope3_screening")
    .upsert(row, { onConflict: "report_id,subcategory_id" })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
