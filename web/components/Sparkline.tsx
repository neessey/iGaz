import { useId } from 'react';

/** Petite courbe d'évolution (ex. ventes par jour), en orange avec un dégradé dessous. */
export function Sparkline({ values, label }: { values: number[]; label: string }) {
  const id = useId().replace(/:/g, '');
  const w = 300;
  const h = 64;
  const max = Math.max(1, ...values);
  const step = values.length > 1 ? w / (values.length - 1) : w;
  const pts = values.map((v, i) => [i * step, h - 6 - (v / max) * (h - 14)] as const);
  const line = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const last = pts[pts.length - 1];
  return (
    <svg className="spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" role="img" aria-label={label}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f7931e" stopOpacity="0.45" />
          <stop offset="1" stopColor="#f7931e" stopOpacity="0" />
        </linearGradient>
      </defs>
      {pts.length > 1 && <polygon points={`0,${h} ${line} ${w},${h}`} fill={`url(#${id})`} />}
      <polyline points={line} fill="none" stroke="#f7931e" strokeWidth="2.5" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      {last && <circle cx={last[0]} cy={last[1]} r="4" fill="#fff" stroke="#f7931e" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />}
    </svg>
  );
}
