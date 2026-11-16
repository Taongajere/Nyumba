"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

// Single-series charts for the provider and admin dashboards.
// One hue (the marker blue), thin rounded bars anchored to the baseline, a recessive grid,
// a hover tooltip per bar and a visually hidden table for screen readers.

type Datum = { label: string; value: number; detail?: string };

function niceMax(v: number) {
  if (v <= 0) return 1;
  const pow = 10 ** Math.floor(Math.log10(v));
  const n = v / pow;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * pow;
}

export function ColumnChart({
  data,
  format,
  height = 220,
  caption,
}: {
  data: Datum[];
  format: (n: number) => string;
  height?: number;
  caption: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const top = Math.max(...data.map((d) => d.value), 0);
  if (top <= 0) {
    return (
      <div className="grid place-items-center rounded-2xl bg-subtle text-sm text-muted-ink" style={{ height: height * 0.6 }}>
        Nothing to chart for this period yet.
      </div>
    );
  }
  const max = niceMax(top);
  const ticks = [0, 0.5, 1].map((t) => t * max);
  const w = 640;
  const padL = 56;
  const padB = 28;
  const plotW = w - padL - 8;
  const plotH = height - padB - 8;
  const slot = plotW / Math.max(data.length, 1);
  const barW = Math.min(28, slot * 0.56);

  return (
    <figure className="relative">
      <svg viewBox={`0 0 ${w} ${height}`} className="h-auto w-full" role="img" aria-label={caption}>
        {ticks.map((t) => {
          const y = 8 + plotH - (t / max) * plotH;
          return (
            <g key={t}>
              <line x1={padL} x2={w - 8} y1={y} y2={y} stroke="var(--line)" strokeWidth={1} />
              <text x={padL - 8} y={y + 4} textAnchor="end" fontSize="11" fill="var(--muted-ink)">
                {format(t)}
              </text>
            </g>
          );
        })}
        {data.map((d, i) => {
          const h = (d.value / max) * plotH;
          const x = padL + i * slot + (slot - barW) / 2;
          const y = 8 + plotH - h;
          const r = Math.min(4, h / 2);
          return (
            <g key={d.label}>
              {/* Hit target spans the whole slot so thin bars are easy to hover */}
              <rect
                x={padL + i * slot}
                y={8}
                width={slot}
                height={plotH}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
              />
              {h > 0 && (
                <path
                  d={`M${x},${8 + plotH} V${y + r} Q${x},${y} ${x + r},${y} H${x + barW - r} Q${x + barW},${y} ${x + barW},${y + r} V${8 + plotH} Z`}
                  fill="var(--marker)"
                  opacity={hover === null || hover === i ? 1 : 0.45}
                  pointerEvents="none"
                />
              )}
              <text x={x + barW / 2} y={height - 8} textAnchor="middle" fontSize="11" fill="var(--muted-ink)">
                {d.label}
              </text>
            </g>
          );
        })}
      </svg>
      {hover !== null && data[hover] && (
        <div
          className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-xl border border-line bg-surface px-3 py-2 text-[13px] shadow-lg"
          style={{ left: `${((padL + hover * slot + slot / 2) / w) * 100}%` }}
        >
          <p className="font-semibold text-ink">{data[hover].label}</p>
          <p className="text-ink-2 tabular-nums">{format(data[hover].value)}</p>
          {data[hover].detail && <p className="text-muted-ink">{data[hover].detail}</p>}
        </div>
      )}
      <table className="sr-only">
        <caption>{caption}</caption>
        <tbody>
          {data.map((d) => (
            <tr key={d.label}>
              <th>{d.label}</th>
              <td>{format(d.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

// Horizontal bars with the label and value written beside each bar.
export function BarList({
  data,
  format,
  max,
  className,
}: {
  data: Datum[];
  format: (n: number) => string;
  max?: number;
  className?: string;
}) {
  const top = max ?? Math.max(...data.map((d) => d.value), 1);
  return (
    <ul className={cn("space-y-3", className)}>
      {data.map((d) => (
        <li key={d.label}>
          <div className="mb-1 flex justify-between gap-3 text-sm">
            <span className="truncate text-ink-2">{d.label}</span>
            <span className="shrink-0 font-semibold text-ink tabular-nums">
              {format(d.value)}
              {d.detail && <span className="ml-1 font-normal text-muted-ink">{d.detail}</span>}
            </span>
          </div>
          <div className="h-2 rounded-full bg-subtle">
            <div className="h-2 rounded-full bg-marker" style={{ width: `${Math.min((d.value / top) * 100, 100)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
