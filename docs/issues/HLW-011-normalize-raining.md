# HLW-011: Normalize "raining now" (rate-based + debounce)

- **Status:** proposed
- **GitHub issue:** https://github.com/cwoskoski/havasulakeweather/issues/13
- **Branch:** `feat/HLW-011-normalize-raining`
- **PR:** (open when the work is ready)
- **Created:** 2026-08-12

## Summary

The "raining now" section flaps Dry↔Raining every minute during steady rain.
Switch the signal from the tipping-bucket delta to the station's rain-rate field
(`hourlyrainin`) with a short debounce so it reads reliably.

## Analysis (from live data during a monsoon)

- Current logic (`handler.js:106`): `rainingNow = reading.totalrainin > mark.totalrainin`
  — i.e. "did the all-time counter increase since the previous single reading."
- `totalrainin` is a **tipping bucket**: it only jumps in 0.01″ steps when the bucket
  tips (every 1–8 min). Between tips it's flat → reads **Dry** even in a downpour.
- Live window 22:43–22:59 UTC: `rainingNow=True` on only **5/90** readings, **8 flips**.
  Newest reading `hourlyrainin=0.047` (drizzling) but `rainingNow=False` → site said Dry.
- Station does **not** send `rainratein` (0/90). But `hourlyrainin` acts as a **rain
  rate**: peaks 0.236 in/hr, exceeds daily/total (so it's a rate, not accumulation),
  and is exactly 0.000 when dry — a clean, non-flapping signal.

```
dry:    22:13–22:42  hourlyrainin = 0.000
onset:  22:43 0.047 → 22:44 0.118 → 22:46 0.165 → 22:48 0.236  (rising)
easing: 22:56 0.165 → 22:57 0.118 → 22:59 0.047               (decaying)
```

## Plan

- [ ] Base "raining now" on `hourlyrainin > 0` (rate) instead of the tip delta.
- [ ] Debounce: stay Raining until the rate has read 0 for ~10–15 min; only then Dry.
- [ ] Compute in the read API (latest reading + a small recent-window query for the
      debounce), decoupling from the fragile in-memory watermark.
- [ ] `lastRainAt` = last time the rate was > 0.
- [ ] Verify against the recorded flapping window (should read steady Raining through it).

## Acceptance criteria

- [ ] During continuous rain the section stays "Raining" (no minute-to-minute flips).
- [ ] Flips to "Dry" only after the debounce window with no rain rate.
- [ ] Backed by a replay of the 22:43–22:59 data (0 spurious Dry readings).

## Notes

- Secondary (separate ticket later): a ~5-min data gap (22:50→22:56) and a post-interval
  seconds shift (:45→:01) — minor station/ingest hiccup, not part of this fix.
- Decide debounce length (proposed 10–15 min) and whether to also fix the stored
  `rainingNow` at ingest or rely purely on the read-layer computation.
