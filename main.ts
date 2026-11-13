// polymarket-nvidia-ceo-forecast-01 entry (Node 22, standard library only).
//
// Forecast: for each market, the median stays at its last price (persistence —
// every drift / mean-reversion / momentum variant tested on the six practice
// cases made the practice loss worse, so the median is the checkpoint price),
// with a predictive spread that is
//   - sub-diffusive in horizon: sd(h) = S0 * h^BETA (BETA = 0.4, not 0.5:
//     realised 10-min moves imply sigma 0.0037 per sqrt-min, 240-min moves
//     only 0.0020, so variance grows slower than a random walk's), and
//   - scaled per market by its own recent realised volatility: the std of its
//     1-minute changes over the last 240 minutes, relative to 0.0025, blended
//     80/20 with 1 (a market that just jumped gets a much wider spread; a
//     quiet market a narrower one). Short windows (120-360 min) all beat long
//     ones (1440 min) on the practice cases.
// Quantiles are the standard normal's at the five levels around the median,
// clamped to [0,1], rounded to 6 decimals, non-decreasing.
//
// The 24 Yes prices are probabilities of mutually exclusive outcomes, so
// their sum should sit near 1 (the practice checkpoints sum to 1.02-1.08 and
// drift down toward ~0.99 over the next 4 hours). After computing the
// medians, each horizon's medians are scaled multiplicatively so their sum
// decays exponentially from the checkpoint sum toward 0.99 with a 240-minute
// time constant, keeping each row's quantile offsets around its new median.
// On the six practice cases (scored against Polymarket's recorded prices)
// this scores a mean pinball loss of 0.2656 vs the house baseline's 0.3636,
// and beats the baseline on every single practice case (16%-53% better).
//
// Deterministic: a pure function of the case file, no randomness, no clock,
// no network. Reads every <id>.in in the input directory and writes one
// <id>.out per case, exactly as the rules require.

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const INPUT_DIR = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const OUTPUT_DIR = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

/** The quantile levels the contest scores, in the order each row lists them. */
const QUANTILES = [0.05, 0.25, 0.5, 0.75, 0.95];
/** The standard normal's quantile at each level, to 6 decimals. */
const Z = [-1.644854, -0.67449, 0, 0.67449, 1.644854];
/** Base spread in price units, at h = 1 minute, before the per-market vol scale. */
const S0 = 0.0015;
/** Sub-diffusive horizon exponent: sd(h) ~ h^BETA. */
const BETA = 0.4;
/** Reference 1-minute volatility the realised-vol ratio is measured against. */
const VOL_REF = 0.0025;
/** Weight of the market's own realised vol in the spread multiplier. */
const VOL_WEIGHT = 0.8;
/** Minutes of history the realised volatility is measured over. */
const VOL_WINDOW = 240;
/** The sum of the medians decays toward this over the horizon. */
const SUM_TARGET = 0.99;
/** Time constant (minutes) of that decay. */
const SUM_TAU = 240;

interface CaseMarket {
  id: string;
  prices: number[];
}

interface Case {
  horizon_minutes: number;
  quantiles: number[];
  markets: CaseMarket[];
}

/** x clamped to [0,1] and rounded to 6 decimals (0, never -0). */
const price6 = (x: number): number => Math.round(Math.min(1, Math.max(0, x)) * 1e6) / 1e6 + 0;

/** Std of the market's 1-minute changes over its last VOL_WINDOW minutes. */
function realisedVol(prices: number[]): number {
  const w = Math.min(VOL_WINDOW, prices.length - 1);
  if (w < 2) return 0;
  const seg = prices.slice(prices.length - w - 1);
  let mean = 0;
  for (let i = 0; i < seg.length - 1; i++) mean += seg[i + 1]! - seg[i]!;
  mean /= seg.length - 1;
  let ss = 0;
  for (let i = 0; i < seg.length - 1; i++) {
    const d = seg[i + 1]! - seg[i]! - mean;
    ss += d * d;
  }
  return Math.sqrt(ss / (seg.length - 1));
}

/** One market's forecast: horizon rows of the five quantiles around its last price. */
function forecast(m: CaseMarket, horizon: number): number[][] {
  if (m.prices.length === 0) throw new Error(`market ${m.id} has no prices`);
  const x = m.prices[m.prices.length - 1] as number;
  const rv = realisedVol(m.prices);
  const mult = 1 - VOL_WEIGHT + VOL_WEIGHT * (rv / VOL_REF);
  const rows: number[][] = [];
  for (let h = 1; h <= horizon; h++) {
    const sd = S0 * Math.pow(h, BETA) * mult;
    const row = Z.map((z) => price6(x + z * sd));
    for (let j = 1; j < 5; j++) if (row[j]! < row[j - 1]!) row[j] = row[j - 1]!;
    rows.push(row);
  }
  return rows;
}

mkdirSync(OUTPUT_DIR, { recursive: true });
// Every case file, in name order, so two runs write the same bytes.
const inputs = readdirSync(INPUT_DIR).filter((f) => f.endsWith('.in')).sort();
for (const file of inputs) {
  const id = file.slice(0, -'.in'.length);
  const c = JSON.parse(readFileSync(join(INPUT_DIR, file), 'utf8')) as Case;
  if (c.quantiles.length !== QUANTILES.length || c.quantiles.some((t, j) => t !== QUANTILES[j])) throw new Error(`${file} asks for quantiles ${JSON.stringify(c.quantiles)}, not ${JSON.stringify(QUANTILES)}`);
  const H = c.horizon_minutes;
  const forecasts = c.markets.map((m) => ({ id: m.id, q: forecast(m, H) }));
  // Sum constraint: scale each horizon's medians so their sum decays from the
  // checkpoint sum toward SUM_TARGET (row index 0-based, matching the tuned form).
  const s0sum = c.markets.reduce((s, m) => s + (m.prices[m.prices.length - 1] as number), 0);
  for (let h = 0; h < H; h++) {
    let s = 0;
    for (const f of forecasts) s += f.q[h]![2]!;
    if (s <= 0) continue;
    const tgt = s0sum + (SUM_TARGET - s0sum) * (1 - Math.exp(-h / SUM_TAU));
    const f = tgt / s;
    for (const fc of forecasts) {
      const r = fc.q[h]!;
      const med = Math.min(1, Math.max(0, r[2]! * f));
      const next = [0, 1, 2, 3, 4].map((j) => price6(med + (r[j]! - r[2]!)));
      for (let j = 1; j < 5; j++) if (next[j]! < next[j - 1]!) next[j] = next[j - 1]!;
      fc.q[h] = next;
    }
  }
  writeFileSync(join(OUTPUT_DIR, `${id}.out`), `${JSON.stringify({ forecasts })}\n`);
}
