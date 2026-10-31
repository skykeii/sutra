"use client";

import Link from "next/link";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { cn } from "@/lib/utils";

const NAVY = "#123a6b";
const SAFFRON = "#d9730a";
const TEAL = "#0f766e";

export function TrendChart({ data }: { data: { day: string; enrolments: number; alerts: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data} margin={{ left: 0, right: 12, top: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis dataKey="day" fontSize={12} tickMargin={6} minTickGap={32} />
        <YAxis fontSize={12} allowDecimals={false} width={40} />
        <Tooltip />
        <Legend />
        <Line type="monotone" dataKey="enrolments" name="Records added" stroke={NAVY} strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="alerts" name="Alerts" stroke={SAFFRON} strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function CategoryChart({ data }: { data: { state: string; nri: number; oci: number; foreign_national: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ left: 0, right: 12, top: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis dataKey="state" fontSize={11} interval={0} angle={-25} textAnchor="end" height={60} />
        <YAxis fontSize={12} allowDecimals={false} width={36} />
        <Tooltip />
        <Legend />
        <Bar dataKey="nri" name="NRI" stackId="a" fill={NAVY} />
        <Bar dataKey="oci" name="OCI" stackId="a" fill={TEAL} />
        <Bar dataKey="foreign_national" name="Foreign national" stackId="a" fill={SAFFRON} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function AutoChart({ rows, x, y }: { rows: Record<string, unknown>[]; x: string; y: string }) {
  const data = rows.map((r) => ({ ...r, [y]: Number(r[y]) }));
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ left: 0, right: 12, top: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis dataKey={x} fontSize={11} interval={0} angle={-20} textAnchor="end" height={70} />
        <YAxis fontSize={12} width={40} />
        <Tooltip />
        <Bar dataKey={y} fill={NAVY} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// Rough geographic grid: one tile per state or union territory, no external map tiles.
const TILES: [string, string, number, number][] = [
  ["JK", "Jammu & Kashmir", 2, 0], ["LA", "Ladakh", 3, 0],
  ["HP", "Himachal Pradesh", 3, 1], ["PB", "Punjab", 2, 1], ["UK", "Uttarakhand", 4, 1],
  ["HR", "Haryana", 3, 2], ["DL", "Delhi", 4, 2], ["AR", "Arunachal Pradesh", 9, 2],
  ["RJ", "Rajasthan", 2, 3], ["UP", "Uttar Pradesh", 4, 3], ["BR", "Bihar", 6, 3], ["SK", "Sikkim", 7, 3], ["AS", "Assam", 8, 3], ["NL", "Nagaland", 9, 3],
  ["GJ", "Gujarat", 1, 4], ["MP", "Madhya Pradesh", 3, 4], ["CG", "Chhattisgarh", 4, 4], ["JH", "Jharkhand", 5, 4], ["WB", "West Bengal", 6, 4], ["ML", "Meghalaya", 7, 4], ["MN", "Manipur", 9, 4],
  ["MH", "Maharashtra", 2, 5], ["OD", "Odisha", 5, 5], ["TR", "Tripura", 7, 5], ["MZ", "Mizoram", 8, 5],
  ["TS", "Telangana", 3, 6], ["AP", "Andhra Pradesh", 4, 6],
  ["GA", "Goa", 2, 7], ["KA", "Karnataka", 3, 7],
  ["KL", "Kerala", 3, 8], ["TN", "Tamil Nadu", 4, 8],
];

export interface StateMetric {
  state: string;
  fill_pct: number | null;
  open_alerts: number;
  institutions: number;
}

function fillColour(v: number) {
  if (v > 100) return "bg-red-600 text-white";
  if (v >= 90) return "bg-emerald-700 text-white";
  if (v >= 75) return "bg-emerald-500 text-white";
  return "bg-emerald-200 text-emerald-950";
}
function alertColour(v: number) {
  if (v >= 2) return "bg-red-600 text-white";
  if (v === 1) return "bg-amber-400 text-amber-950";
  return "bg-emerald-200 text-emerald-950";
}

export function IndiaTileMap({ data, selected }: { data: StateMetric[]; selected?: string }) {
  const [metric, setMetric] = useState<"fill" | "alerts">("fill");
  const byName = new Map(data.map((d) => [d.state, d]));
  return (
    <div>
      <div role="group" aria-label="Map metric" className="mb-3 inline-flex rounded-md border p-0.5 text-sm">
        {(["fill", "alerts"] as const).map((m) => (
          <button key={m} type="button" aria-pressed={metric === m} onClick={() => setMetric(m)} className={cn("rounded px-3 py-1", metric === m && "bg-primary text-primary-foreground")}>
            {m === "fill" ? "Seats filled" : "Open alerts"}
          </button>
        ))}
      </div>
      <div className="grid max-w-xl grid-cols-[repeat(10,minmax(0,1fr))] gap-1">
        {TILES.map(([code, name, col, row]) => {
          const d = byName.get(name);
          const value = metric === "fill" ? d?.fill_pct : d?.open_alerts;
          const label = metric === "fill" ? `${value ?? 0}%` : String(value ?? 0);
          const style = { gridColumnStart: col + 1, gridRowStart: row + 1 };
          if (!d) {
            return <div key={code} style={style} title={`${name}: no institutions reporting`} className="flex aspect-square items-center justify-center rounded bg-muted text-[10px] text-muted-foreground">{code}</div>;
          }
          return (
            <Link key={code} href={`/aicte?state=${encodeURIComponent(name)}`} style={style} title={`${name}: ${label}, ${d.institutions} institutions`} aria-label={`${name}: ${metric === "fill" ? "seats filled" : "open alerts"} ${label}`}
              className={cn("flex aspect-square flex-col items-center justify-center rounded text-[10px] font-semibold leading-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-xs", metric === "fill" ? fillColour(Number(value ?? 0)) : alertColour(Number(value ?? 0)), selected === name && "ring-2 ring-saffron ring-offset-1")}>
              <span>{code}</span><span className="font-normal">{label}</span>
            </Link>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">Select a state to focus the tables below. Grey states have no reporting institutions in this demo.</p>
    </div>
  );
}
