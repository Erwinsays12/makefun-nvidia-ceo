# Forecasting Polymarket's next NVIDIA CEO prices

A make.fun entry for `polymarket-nvidia-ceo-forecast-01`.

The competition asks for the Yes price of every trading market in Polymarket's
"Next CEO of NVIDIA?" event, at every minute of the four hours after a
checkpoint, expressed as five quantiles (0.05, 0.25, 0.5, 0.75, 0.95) for each
market and each minute.

## Running it

The entry point is `main.ts`, plain Node 22 with only the standard library.
It needs no network and no randomness, so repeated runs are byte-identical.

```
MAKEFUN_INPUT_DIR=input MAKEFUN_OUTPUT_DIR=out node main.ts
```

It reads every `<id>.in` case file from the input directory and writes one
`<id>.out` forecast file per case into the output directory.

## How the forecast works

**The median is the last price.** Polymarket prices are close to a
martingale, and on the six practice cases every attempt at adding drift —
trend following, reversion to a trailing average, momentum — made the score
worse. So each market's median forecast is simply its price at the
checkpoint.

**The spread grows slower than a random walk.** The predictive standard
deviation is `0.0015 * h^0.4` for horizon `h` in minutes. Realised moves say
the same thing: ten-minute moves imply about 0.0037 per root-minute, while
240-minute moves imply only about 0.0020, so variance accumulates more
slowly than `h`.

**Each market gets its own scale.** The base spread is multiplied by a
per-market factor from that market's own recent realised volatility: the
standard deviation of its one-minute changes over the last 240 minutes,
divided by 0.0025, blended 80/20 with 1. A market that has just jumped gets
a wider fan; a quiet one gets a narrower fan. Short measurement windows
(120–360 minutes) scored better than long ones (1440 minutes) on the
practice cases.

**The middle of the fan is pinched.** The 25% and 75% quantiles are placed
0.9x as far from the median as a normal spread would put them. Prices on
this market move in steps and sit still in most minutes, so the centre of
the predictive distribution is tighter than a normal with the same tails.
On the practice cases this shaved the mean pinball loss from 0.2656 to
0.2648.

**The probabilities have to add up.** The 24 Yes prices are chances of
mutually exclusive outcomes, so they should sum to about 1. At the practice
checkpoints they sum to 1.02–1.08 and drift down toward 0.99 over the next
four hours. Each horizon's medians are therefore rescaled so their sum
decays exponentially from the checkpoint sum toward 0.99 with a 240-minute
time constant, with every row's quantile offsets carried along around the
rescaled median.

Quantiles are the standard normal's at the five scored levels, clamped to
[0, 1], rounded to six decimals, and non-decreasing within each row.

## How well does it do?

I scored it locally against Polymarket's own recorded prices for the six
practice cases (p00–p05), fetched from the public `prices-history` endpoint
and placed on the one-minute grid exactly as the rules describe. The mean
pinball loss is **0.2648**, against **0.3636** for the house baseline — better
on every single practice case, by 16%–53%. The same configuration also beats
the baseline on each held-out case when scored leave-one-case-out.

A case runs in about 0.05 s (the cap is 8 s) and the largest output file is
about 260 KB (the cap is 1 MiB).

## License

MIT — see `LICENSE`.
