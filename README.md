# Quantile forecaster for Polymarket NVIDIA CEO prices

Entry for make.fun competition `polymarket-nvidia-ceo-forecast-01`: forecast the
Yes price of every trading market of Polymarket's "Next CEO of NVIDIA?" event at
every minute of the 4 hours after a checkpoint, as five quantiles
(0.05, 0.25, 0.5, 0.75, 0.95) per market per minute.

## Program

`main.ts` (Node 22, standard library only, no network, deterministic). Run
locally on the kit's practice cases with:

```
MAKEFUN_INPUT_DIR=input MAKEFUN_OUTPUT_DIR=out node main.ts
```

## Method

- **Median = persistence.** The median stays at the market's last price at the
  checkpoint. Drift, mean-reversion to trailing means, and momentum
  extrapolations were all tested on the six practice cases and all made the
  practice loss worse, so the median is the checkpoint price.
- **Sub-diffusive spread.** The predictive standard deviation grows as
  `0.0015 * h^0.4`, not `sqrt(h)`: realised 10-minute moves imply a sigma of
  ~0.0037 per sqrt-minute, while 240-minute moves imply only ~0.0020, so
  variance grows slower than a random walk's.
- **Per-market realised volatility.** Each market's spread is scaled by its
  own recent volatility — the standard deviation of its 1-minute changes over
  the last 240 minutes, relative to 0.0025, blended 80/20 with 1. A market
  that just jumped gets a much wider spread; a quiet market a narrower one.
  Short windows (120–360 min) beat long ones (1440 min) on the practice data.
- **Tighter inner quantiles.** The 25%/75% quantiles sit 0.9x as far from the
  median as the normal spread implies: Polymarket prices move in steps and
  sit still most minutes, so the centre of the predictive distribution is
  narrower than a normal with the same tail spread. (Measured on the practice
  cases: 0.2656 -> 0.2648 mean pinball loss.)
- **Sum constraint.** The 24 Yes prices are probabilities of mutually
  exclusive outcomes, so their sum should sit near 1. After computing the
  medians, each horizon's medians are scaled multiplicatively so their sum
  decays exponentially from the checkpoint sum toward 0.99 with a 240-minute
  time constant, keeping each row's quantile offsets around its new median.
- Quantiles are the standard normal's at the five levels around the median,
  clamped to [0, 1], rounded to 6 decimals, non-decreasing.

## Local validation

Scored against Polymarket's recorded prices for the six practice cases
(p00–p05, fetched from the public `prices-history` endpoint and gridded exactly
as the rules describe), this entry scores a mean pinball loss of **0.2648** vs
the house baseline's **0.3636** (median error 0.749 vs 0.768), and beats the
baseline on every single practice case (16%–53% better). Leave-one-case-out:
the same configuration beats the baseline on each held-out case too. Runtime
is ~0.3 s per case (cap 8 s); outputs are ~260 KB max (cap 1 MiB); two runs
are byte-identical.

## License

MIT (see LICENSE).
