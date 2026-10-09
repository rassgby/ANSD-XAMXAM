"use client";

import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/*
 * Graphiques du tableau de bord admin — une seule serie chacun, donc une
 * seule teinte (brand-600) et pas de legende : le titre de la carte dit ce
 * qui est trace. Barres fines (<= 24 px) au bout arrondi, grille en filet
 * discret, valeurs et libelles en couleurs de texte (jamais celle de la
 * serie), infobulle au survol et au clavier.
 */

export const fmt = new Intl.NumberFormat("fr-FR");

/** Plafond « rond » de l'axe : 4, 5, 10, 20, 25, 50, 100… */
function niceMax(value: number): number {
  if (value <= 4) return 4;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  for (const step of [1, 2, 2.5, 5, 10]) {
    if (step * magnitude >= value) return step * magnitude;
  }
  return 10 * magnitude;
}

export interface Column {
  key: string;
  /** Libelle d'axe (affiche selon `tickEvery`). */
  label: string;
  value: number;
  /** Lignes de l'infobulle (la valeur principale est deja affichee). */
  tooltip?: { title: string; rows?: { label: string; value: string }[] };
}

export function ColumnChart({
  data,
  height = 200,
  tickEvery = 1,
  valueLabel,
  ariaLabel,
}: {
  data: Column[];
  height?: number;
  /** N'affiche qu'un libelle d'axe sur N (series longues). */
  tickEvery?: number;
  /** Nom de la valeur dans l'infobulle, ex. « questions ». */
  valueLabel: string;
  ariaLabel: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const max = niceMax(Math.max(0, ...data.map((d) => d.value)));
  const ticks = [0, max / 2, max];

  return (
    <div className="flex gap-2" role="img" aria-label={ariaLabel}>
      {/* Axe Y : trois graduations rondes */}
      <div className="relative w-8 shrink-0 text-right text-[11px] tabular-nums text-slate-400" style={{ height }}>
        {ticks.map((t) => (
          <span key={t} className="absolute right-0 -translate-y-1/2" style={{ top: `${100 - (t / max) * 100}%` }}>
            {fmt.format(t)}
          </span>
        ))}
      </div>

      <div className="min-w-0 flex-1">
        <div className="relative" style={{ height }}>
          {ticks.map((t) => (
            <div
              key={t}
              className="absolute inset-x-0 h-px bg-slate-100"
              style={{ top: `${100 - (t / max) * 100}%` }}
            />
          ))}
          <div className="absolute inset-0 flex items-end">
            {data.map((d, i) => (
              <div
                key={d.key}
                tabIndex={0}
                onPointerEnter={() => setHover(i)}
                onPointerLeave={() => setHover((h) => (h === i ? null : h))}
                onFocus={() => setHover(i)}
                onBlur={() => setHover((h) => (h === i ? null : h))}
                aria-label={`${d.tooltip?.title ?? d.label} : ${fmt.format(d.value)} ${valueLabel}`}
                className="group relative flex h-full flex-1 items-end justify-center px-px outline-none"
              >
                <div
                  className={cn(
                    "w-full max-w-6 rounded-t-[4px] transition-colors",
                    hover === i ? "bg-brand-500" : "bg-brand-600",
                    d.value === 0 && "bg-transparent"
                  )}
                  style={{ height: `${(d.value / max) * 100}%` }}
                />
                {hover === i && (
                  <div
                    className={cn(
                      "pointer-events-none absolute bottom-full z-10 mb-2 w-max max-w-[200px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-left shadow-lg",
                      i < data.length / 3 ? "left-0" : i > (2 * data.length) / 3 ? "right-0" : "left-1/2 -translate-x-1/2"
                    )}
                  >
                    <p className="text-sm font-bold tabular-nums text-slate-900">
                      {fmt.format(d.value)} <span className="font-medium text-slate-500">{valueLabel}</span>
                    </p>
                    <p className="text-xs text-slate-500">{d.tooltip?.title ?? d.label}</p>
                    {d.tooltip?.rows?.map((r) => (
                      <p key={r.label} className="mt-0.5 flex justify-between gap-4 text-xs text-slate-600">
                        <span>{r.label}</span>
                        <span className="font-semibold tabular-nums">{r.value}</span>
                      </p>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
        {/* Axe X */}
        <div className="mt-1.5 flex h-4 text-[11px] text-slate-400">
          {data.map((d, i) => (
            <div key={d.key} className="relative flex-1">
              {i % tickEvery === 0 && (
                <span className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap">{d.label}</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Classement horizontal : libelle, barre proportionnelle, valeur au bout. */
export function RankedBars({
  rows,
  empty = "Aucune donnée sur la période.",
}: {
  rows: { key: string; label: ReactNode; title?: string; value: number; suffix?: string }[];
  empty?: string;
}) {
  if (rows.length === 0) return <p className="py-6 text-center text-sm text-slate-400">{empty}</p>;
  const max = Math.max(...rows.map((r) => r.value));
  return (
    <ul className="flex flex-col gap-3">
      {rows.map((r) => (
        <li key={r.key} className="flex flex-col gap-1">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate text-slate-700" title={r.title}>
              {r.label}
            </span>
            <span className="shrink-0 font-semibold tabular-nums text-slate-900">
              {fmt.format(r.value)}
              {r.suffix && <span className="ml-1 font-normal text-slate-400">{r.suffix}</span>}
            </span>
          </div>
          <div className="h-2 rounded-full bg-brand-50">
            <div className="h-2 rounded-full bg-brand-600" style={{ width: `${(r.value / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Jauge de proportion : remplissage brand, piste d'un ton plus clair de la meme teinte. */
export function Meter({ value, label }: { value: number; label: string }) {
  return (
    <div
      className="h-2 w-full rounded-full bg-brand-100"
      role="meter"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div className="h-2 rounded-full bg-brand-600" style={{ width: `${Math.min(100, value)}%` }} />
    </div>
  );
}
