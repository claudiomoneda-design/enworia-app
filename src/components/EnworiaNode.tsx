const COLORI: Record<string, { linee: string; chevron: string; cerchio: string }> = {
  rosso:  { linee: '#E8534A', chevron: '#E8534A', cerchio: '#E8534A' },
  giallo: { linee: '#C8860A', chevron: '#C8860A', cerchio: '#C8860A' },
  verde:  { linee: '#4A6A5E', chevron: '#27AE60', cerchio: '#27AE60' },
  grigio: { linee: '#B4B2A9', chevron: '#B4B2A9', cerchio: '#B4B2A9' },
}

export default function EnworiaNode({ stato = 'grigio', size = 18 }: { stato?: string; size?: number }) {
  const c = COLORI[stato] || COLORI.grigio
  const s = size, h = s * 0.875
  return (
    <svg width={s} height={h} viewBox={`0 0 ${s} ${h}`} style={{ flexShrink: 0 }}>
      <line x1="0" y1={h * 0.18} x2={s * 0.39} y2={h * 0.18} stroke={c.linee} strokeWidth={s * 0.067} strokeLinecap="round" />
      <line x1="0" y1={h * 0.5} x2={s * 0.39} y2={h * 0.5} stroke={c.linee} strokeWidth={s * 0.1} strokeLinecap="round" />
      <line x1="0" y1={h * 0.82} x2={s * 0.39} y2={h * 0.82} stroke={c.linee} strokeWidth={s * 0.067} strokeLinecap="round" />
      <path d={`M${s * 0.39} ${h * 0.18} L${s * 0.61} ${h * 0.5} L${s * 0.39} ${h * 0.82}`}
        fill="none" stroke={c.chevron} strokeWidth={s * 0.078} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={s * 0.75} cy={h * 0.5} r={s * 0.167} fill={c.cerchio} />
    </svg>
  )
}
