'use client'
import { useParams } from 'next/navigation'
import GhgDataEntry from '@/components/ghg/GhgDataEntry'

export default function EditPeriodPage() {
  const { id: clientId, periodId } = useParams()
  return <GhgDataEntry companyId={clientId} editPeriodId={periodId} />
}
