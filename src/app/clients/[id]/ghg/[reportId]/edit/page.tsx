"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function GhgEditRedirect() {
  const params = useParams();
  const router = useRouter();
  const companyId = params.id as string;
  const reportId = params.reportId as string;
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    (async () => {
      // Load report to get form_data and step_reached
      const { data: rep } = await supabase
        .from("ghg_reports")
        .select("id, status, step_reached, form_data")
        .eq("id", reportId)
        .single();

      if (!rep) {
        router.replace(`/clients/${companyId}`);
        return;
      }

      // If form_data exists, save it and redirect to /ghg/new with report param
      // The /ghg/new page will load from scope1/scope2 sources via the ?report= param
      router.replace(`/clients/${companyId}/ghg/new?report=${reportId}&edit=1`);
      setChecking(false);
    })();
  }, [companyId, reportId, router]);

  if (checking) {
    return <p className="text-[var(--muted)] text-sm py-8">Caricamento report...</p>;
  }
  return null;
}
