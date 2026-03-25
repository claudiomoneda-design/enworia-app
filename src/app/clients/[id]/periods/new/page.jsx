'use client'
import { useParams } from 'next/navigation'
import GhgDataEntry from '@/components/ghg/GhgDataEntry'

export default function NewPeriodPage() {
  const { id: clientId } = useParams()
  return <GhgDataEntry companyId={clientId} />
}
