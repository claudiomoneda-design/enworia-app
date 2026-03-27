import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

// POST — calculate significance scores from screening answers + entries
export async function POST(
  _req: NextRequest,
  { params }: { params: { reportId: string } },
) {
  const { reportId } = params;

  // Load screenings + entries
  const [{ data: screenings, error: scrErr }, { data: entries, error: entErr }] =
    await Promise.all([
      sb.from("scope3_screening").select("*").eq("report_id", reportId),
      sb.from("scope3_entries").select("subcategory_id, spend_eur").eq("report_id", reportId),
    ]);

  if (scrErr) return NextResponse.json({ error: scrErr.message }, { status: 500 });
  if (entErr) return NextResponse.json({ error: entErr.message }, { status: 500 });

  // Build spend map
  const spendMap: Record<string, number> = {};
  (entries ?? []).forEach((e: Record<string, unknown>) => {
    spendMap[e.subcategory_id as string] = Number(e.spend_eur ?? 0);
  });

  const updates = [];

  for (const scr of screenings ?? []) {
    const s = scr as Record<string, unknown>;
    if (s.has_activity === false) {
      updates.push({
        id: s.id,
        significance: "na",
        score_a: 0,
        score_b: 0,
        score_c: 0,
        updated_at: new Date().toISOString(),
      });
      continue;
    }

    const spend = spendMap[s.subcategory_id as string] ?? 0;
    const scoreA = spend > 100000 ? 3 : spend > 10000 ? 2 : 1;
    const scoreB = s.has_activity ? 2 : 0;
    const dataAvail = s.data_availability as string | null;
    const scoreC = dataAvail === "si" ? 2 : dataAvail === "parziali" ? 1 : 0;
    const total = scoreA + scoreB + scoreC;
    const significance = total >= 5 ? "high" : total >= 3 ? "medium" : "low";

    updates.push({
      id: s.id,
      significance,
      score_a: scoreA,
      score_b: scoreB,
      score_c: scoreC,
      updated_at: new Date().toISOString(),
    });
  }

  // Batch update
  for (const u of updates) {
    const { id, ...rest } = u;
    await sb.from("scope3_screening").update(rest).eq("id", id);
  }

  return NextResponse.json({ updated: updates.length });
}
