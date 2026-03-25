const COLORI: Record<string, { linee: string; chevron: string; cerchio: string; glow?: string }> = {
  rosso:  { linee: '#D44C4C', chevron: '#E8534A', cerchio: '#E8534A', glow: 'drop-shadow(0 0 2px rgba(232,83,74,0.5))' },
  giallo: { linee: '#C8860A', chevron: '#E09B20', cerchio: '#E09B20', glow: 'drop-shadow(0 0 2px rgba(224,155,32,0.5))' },
  verde:  { linee: '#3D6B5E', chevron: '#27AE60', cerchio: '#27AE60', glow: 'drop-shadow(0 0 2px rgba(39,174,96,0.45))' },
  grigio: { linee: '#9A9890', chevron: '#A8A6A0', cerchio: '#A8A6A0' },
}

export default function EnworiaNode({ stato = 'grigio', size = 18 }: { stato?: string; size?: number }) {
  const c = COLORI[stato] || COLORI.grigio
  const s = size, h = s * 0.875
  return (
    <span className="ew-node" style={{ display: 'inline-flex', transition: 'transform 0.2s ease' }}>
      <svg width={s} height={h} viewBox={`0 0 ${s} ${h}`} style={{ flexShrink: 0 }}>
        <line x1="0" y1={h * 0.18} x2={s * 0.39} y2={h * 0.18} stroke={c.linee} strokeWidth={s * 0.067} strokeLinecap="round" />
        <line x1="0" y1={h * 0.5} x2={s * 0.39} y2={h * 0.5} stroke={c.linee} strokeWidth={s * 0.1} strokeLinecap="round" />
        <line x1="0" y1={h * 0.82} x2={s * 0.39} y2={h * 0.82} stroke={c.linee} strokeWidth={s * 0.067} strokeLinecap="round" />
        <path d={`M${s * 0.39} ${h * 0.18} L${s * 0.61} ${h * 0.5} L${s * 0.39} ${h * 0.82}`}
          fill="none" stroke={c.chevron} strokeWidth={s * 0.078} strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={s * 0.75} cy={h * 0.5} r={s * 0.167} fill={c.cerchio}
          style={{ filter: c.glow, transition: 'filter 0.2s ease' }} />
      </svg>
    </span>
  )
}
