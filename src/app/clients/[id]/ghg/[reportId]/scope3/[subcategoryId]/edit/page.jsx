'use client'
import { useParams } from 'next/navigation'
import Scope3DataEntry from '@/components/ghg/Scope3DataEntry'

export default function Scope3EditPage() {
  const { id: companyId, reportId, subcategoryId } = useParams()
  return <Scope3DataEntry reportId={reportId} companyId={companyId} subcategoryId={subcategoryId} />
}
