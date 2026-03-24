'use client'

import { useParams } from 'next/navigation'
import Scope3Screening from '@/components/Scope3Screening'

export default function Scope3Page() {
  const params = useParams()
  return <Scope3Screening reportId={params.reportId} />
}
