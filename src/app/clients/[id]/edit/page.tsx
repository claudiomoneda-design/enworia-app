"use client";

import { useParams, useRouter } from "next/navigation";
import { CompanyForm } from "@/components/form/CompanyForm";

export default function EditClientPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[var(--primary)]">Modifica cliente</h1>
        <p className="text-sm text-[var(--muted)] mt-1">
          VSME Digital Template EFRAG v1.2.0 — General Information (B1 + B2)
        </p>
      </div>
      <CompanyForm companyId={id} onSaved={(savedId) => router.push(`/clients/${savedId}`)} />
    </div>
  );
}
