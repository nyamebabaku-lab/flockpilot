"use client";

import { useState } from "react";
import { formatGHS } from "@/lib/money";

export type Point = { label: string; value: number };

// Named, because a server page cannot hand a function to a browser component.
const FORMATS = {
  number: (value: number) => Math.round(value).toLocaleString(),
  money: (value: number) => formatGHS(Math.round(value)),
  percent: (value: number) => `${value.toFixed(0)}%`,
  grams: (value: number) => `${Math.round(value)} g`,
  kg: (value: number) => `${Math.round(value)} kg`,
};

const WIDTH = 640;
const HEIGHT = 220;
const PAD = { top: 16, right: 12, bottom: 26, left: 48 };

/** Short axis labels, so large amounts are not clipped at the chart's edge. */
function axisLabel(value: number, unit: keyof typeof FORMATS) {
  const shown = unit === "money" ? value / 100 : value;
  if (shown < 1000) return FORMATS[unit === "money" ? "number" : unit](shown);
  const short = shown >= 1_000_000 ? `${+(shown / 1_000_000).toFixed(1)}m` : `${+(shown / 1000).toFixed(1)}k`;
  return unit === "kg" ? `${short} kg` : unit === "grams" ? `${short} g` : short;
}

function niceMax(value: number) {
  if (value <= 0) return 1;
  const step = 10 ** Math.floor(Math.log10(value));
  return Math.ceil(value / (step / 2)) * (step / 2);
}

/** One series over time, drawn as a line or thin bars, with a hover readout and a table view. */
export function TrendChart({ points, kind = "line", unit = "number", label }: { points: Point[]; kind?: "line" | "bar"; unit?: keyof typeof FORMATS; label: string }) {
  const format = FORMATS[unit];
  const [active, setActive] = useState<number | null>(null);
  if (points.length === 0) return <p className="rounded-2xl bg-raised px-4 py-10 text-center text-sm text-ink-soft">No records yet.</p>;

  const max = niceMax(Math.max(...points.map((point) => point.value)));
  const innerWidth = WIDTH - PAD.left - PAD.right;
  const innerHeight = HEIGHT - PAD.top - PAD.bottom;
  const x = (index: number) => PAD.left + (points.length === 1 ? innerWidth / 2 : (index / (points.length - 1)) * innerWidth);
  const y = (value: number) => PAD.top + innerHeight - (value / max) * innerHeight;
  const line = points.map((point, index) => `${index ? "L" : "M"}${x(index).toFixed(1)} ${y(point.value).toFixed(1)}`).join(" ");
  const barWidth = Math.max(3, Math.min(22, innerWidth / points.length - 3));
  const every = Math.max(1, Math.ceil(points.length / 6));
  const shown = active === null ? points.at(-1)! : points[active];

  function track(event: React.PointerEvent<SVGSVGElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    const position = ((event.clientX - box.left) / box.width) * WIDTH;
    const ratio = (position - PAD.left) / innerWidth;
    setActive(Math.max(0, Math.min(points.length - 1, Math.round(ratio * (points.length - 1)))));
  }

  return (
    <figure>
      <figcaption className="mb-2 flex items-baseline justify-between gap-3 text-sm">
        <span className="text-ink-soft">{shown.label}</span>
        <span className="font-display text-lg font-semibold">{format(shown.value)}</span>
      </figcaption>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full touch-pan-y" role="img" aria-label={label} onPointerMove={track} onPointerLeave={() => setActive(null)}>
        {[0, 0.5, 1].map((share) => (
          <g key={share}>
            <line x1={PAD.left} x2={WIDTH - PAD.right} y1={y(max * share)} y2={y(max * share)} stroke="rgb(var(--line))" strokeWidth="1" />
            <text x={PAD.left - 8} y={y(max * share) + 4} textAnchor="end" fontSize="11" fill="rgb(var(--ink-faint))">
              {axisLabel(max * share, unit)}
            </text>
          </g>
        ))}
        {points.map((point, index) =>
          index % every === 0 ? (
            <text key={index} x={x(index)} y={HEIGHT - 6} textAnchor="middle" fontSize="11" fill="rgb(var(--ink-faint))">
              {point.label}
            </text>
          ) : null,
        )}
        {kind === "line" ? (
          <path d={line} fill="none" stroke="rgb(var(--brand))" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        ) : (
          points.map((point, index) => (
            <rect key={index} x={x(index) - barWidth / 2} y={y(point.value)} width={barWidth} height={Math.max(1, y(0) - y(point.value))} rx="3" fill="rgb(var(--brand))" opacity={active === null || active === index ? 1 : 0.5} />
          ))
        )}
        {active !== null && (
          <>
            <line x1={x(active)} x2={x(active)} y1={PAD.top} y2={y(0)} stroke="rgb(var(--ink-faint))" strokeWidth="1" />
            {kind === "line" && <circle cx={x(active)} cy={y(points[active].value)} r="5" fill="rgb(var(--brand))" stroke="rgb(var(--surface))" strokeWidth="2" />}
          </>
        )}
      </svg>
      <details className="mt-2 text-sm text-ink-soft">
        <summary className="cursor-pointer">Show as table</summary>
        <div className="mt-2 max-h-56 overflow-y-auto">
          <table className="w-full">
            <tbody>
              {points.map((point, index) => (
                <tr key={index}>
                  <td className="py-1">{point.label}</td>
                  <td className="py-1 text-right text-ink">{format(point.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
