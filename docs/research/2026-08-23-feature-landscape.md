# Feature landscape research — weather apps, lake-data sites, community PWS sites

**Date:** 2026-08-23 · **Purpose:** ground the HLW-029…041 backlog (issues #58–#70,
PR #71) in what the market actually ships. Three parallel sweeps: major consumer
weather apps/sites, lake & water-recreation sites, and the community
personal-weather-station (PWS) site genre.

## Where havasulakeweather.com stood at research time

Live conditions (temp, wind/gust, humidity, dew point, pressure, UV, solar, rain),
"is it raining right now?" answer, NWS forecast + alerts, temperature history chart,
sunrise/sunset sun arc (HLW-021), station cross-check vs. nearby WU PWS, radar page,
and `/water` (level & storage vs. ~90 yr history with percentile callout + decades
sparkline (HLW-017/018), dam releases, water-routing explainer). PWA with SW caching.

**Verdict:** table stakes are covered in every genre. The backlog is differentiation.

## Key competitive fact

**havasu.info/lake-conditions.html** is the closest direct competitor: live water/air
temp, wind, lake elevation vs. 450 ft full pool, storage, outflow, 7-day forecast,
sun/moon — built on the *same free stack* we use (USBR RISE + NWS airport obs,
updating 30–60 min) — **plus a 0–100 composite "Boating Safety Score"**
(wind + gusts + water temp + air temp; 80+ excellent … <40 stay off).

Our durable advantages: an **on-lake PWS updating every minute** (hyperlocal live wind
is what FishWeather/SailFlow sell), the CA-side community focus, and the installed PWA.

## Genre 1 — major weather apps/sites

Covered: Weather.com/TWC, AccuWeather, Weather Underground, Windy, Ventusky, Apple
Weather, Google/Pixel Weather, Carrot, MyRadar, Mercury, Tempest, Ambient Weather
Network, weather.gov.

- **Table stakes:** feels-like + core metrics, hourly/10-day forecast, animated radar,
  NWS alerts, sunrise/sunset, moon phase, AQI (US), multi-location, dark mode.
- **Signature differentiators:**
  - Minute-scale precip timing (AccuWeather MinuteCast, Apple next-hour) — **no free
    data path**; skip.
  - Plain-language/AI daily narratives (Pixel on-device AI, Carrot) — the 2025–26
    frontier; NWS AFD is the free original. → HLW-039.
  - Activity indices ("good day for golf/hiking") — maps to boating/swimming. → HLW-029.
  - Historical framing ("vs. average", "this day last year", Carrot Time Travel, WU
    almanac) — cheap if you retain obs, which we do. → HLW-030.
  - Custom threshold alerts (Windy, AWN — AWN paywalls SMS behind AWN+). → HLW-036.
  - Lightning proximity (AccuWeather network, Tempest hardware) — no free path;
    HLW-022's WH31L remains the only route (blocked).
  - Trip/route forecasting (Mercury, MyRadar RouteCast, iOS 26) — not our niche.
- **weather.gov gaps others monetize:** dated UX, no push, no minute-cast, no PWS data —
  the space a curated local site lives in.

## Genre 2 — lake / river / water-recreation sites

Covered: lakesonline/lakelevels network, water-data.com, USGS National Water
Dashboard + WaterAlert, USBR riverops, LakeMonster, Fishbrain, FishWeather/SailFlow,
Windfinder, NOAA/NWS lake products, Navionics, iBoating, WillyWeather, RiverApp, and
Havasu-specific sites (havasu.info, golakehavasu, DesertUSA, AZGFD).

- **Table stakes:** elevation vs. full pool with delta, historical level chart, water
  temp, wind now + forecast, 7-day weather, attribution + timestamp. (All covered.)
- **Differentiators worth stealing:**
  - Composite go/no-go score (havasu.info) → HLW-029.
  - Year-over-year date comparison (water-data.com's "last 10 of today's date";
    DesertUSA "down X ft from a year ago") → HLW-034.
  - Swimmability framing for water temp (LakeMonster, seatemperature.net; sustained
    immersion <70 °F = documented cold-shock risk) → HLW-035.
  - **Scheduled** next-day hourly dam releases (USBR riverops publishes; almost no
    aggregator surfaces) → HLW-038.
  - NWS **Lake Wind Advisory** — issued for the lake zone (AZZ002 "Lake Havasu and
    Fort Mohave"); NWS Vegas also runs a Lake Havasu rec-forecast page
    (weather.gov/vef/RecHV) → HLW-032.
  - Solunar bite times (Fishbrain's paid "BiteTime"; the calculation is pure moon
    astronomy) → HLW-037.
  - Threshold alerts on level/flow (RiverApp's core feature; USGS WaterAlert free) →
    HLW-036 phase 0.
  - Webcam — the #1 "is it worth driving out" feature (golakehavasu, Windy's 55K cams)
    → HLW-033 (hardware-gated).
- **Not replicable free:** Fishbrain's catch-data network, LakeMonster's satellite
  temp/clarity models, Navionics/iBoating bathymetry.
- Possible later: **EPA CyAN** free satellite cyanobacteria (algal bloom) data covers
  large reservoirs — not ticketed yet.

## Genre 3 — community PWS sites (our genre)

Covered: AWN/WU/WeatherLink/Tempest platform dashboards; Saratoga-template, WeeWX
(Seasons + Belchertown), CumulusMX, Meteotemplate sites; desert-SW and lake-community
independents (El Dorado Weather, Komoka, Watauga Lake, Keuka Lake).

- **Genre-standard (ubiquitous):** records hierarchy — today / this month / this year /
  all-time since station start (the CumulusMX menu is the de-facto spec); rain totals
  day/month/year; per-sensor history graphs; NWS forecast; sun/moon; pressure trend.
  → HLW-030 closes our biggest genre gap.
- **Uncommon-but-loved:**
  - Days-since-rain + rain-days-this-year + rain-season/monsoon tracker — *the*
    signature desert-SW feature (Saratoga rain-season plugin; NWS monsoon window
    Jun 15–Sep 30) → HLW-031.
  - Homepage records widget (Belchertown "record snapshots") → HLW-030.
  - Day-length delta, wind rose, NOAA-style monthly reports → HLW-037/040.
  - Real-time no-reload updates, auto dark mode at sunset — polish ideas, not ticketed.
- **Computable from our own DynamoDB history, no external API:** all records/almanac,
  all rain accounting, wind rose, trend graphs, derived comfort values, sun/moon math.
- Lake-community analogs (Watauga, Keuka) lead with water temp + webcam + boater wind
  panel — matching our HLW-033/035 + existing wind emphasis.

## Dead ends (no viable free data)

Minute-cast precip timing · lightning proximity (without the WH31L, HLW-022) ·
pollen (Google/Ambee APIs are paid; no free US source).

## Resulting backlog (impact-ranked)

| Rank | Ticket | Issue | Effort |
|---|---|---|---|
| 1 | HLW-029 Lake Conditions Score | #58 | low |
| 2 | HLW-030 Records & almanac | #59 | medium |
| 3 | HLW-031 Rain / monsoon tracker | #60 | low |
| 4 | HLW-032 Lake Wind Advisory banner | #61 | very low |
| 5 | HLW-033 Webcam | #62 | blocked: hardware |
| 6 | HLW-034 /water year-over-year | #63 | low |
| 7 | HLW-035 Swimmability framing | #64 | low |
| 8 | HLW-036 Threshold alerts | #65 | high |
| 9 | HLW-037 Sun & moon + solunar | #66 | low-med |
| 10 | HLW-038 Scheduled dam releases | #67 | medium |
| 11 | HLW-039 Plain-language daily summary | #68 | medium |
| 12 | HLW-040 Wind rose + climate reports | #69 | medium |
| 13 | HLW-041 AQI (EPA AirNow) | #70 | medium |

Ranking = expected community impact, feasibility-adjusted (webcam would rank higher
unblocked; threshold alerts rank below their stickiness because of infra effort).
Dependencies: HLW-031 & 040 build on HLW-030's daily aggregates; HLW-029/032/035
share bands/inputs (natural first arc: 029 → 032 → 035).

## Free-data source map (for future tickets)

| Need | Free source |
|---|---|
| Forecast, alerts, AFD, Lake Wind Advisory | api.weather.gov (in use) |
| Lake elevation/storage/releases | USBR RISE (in use); riverops for *schedules* |
| River flow / gauge / water temp | USGS NWIS (in use) |
| Stage/flow forecasts, flood categories | NWPS — api.water.noaa.gov/nwps/v1 |
| Level/flow threshold alerts (no build) | USGS WaterAlert |
| Radar tiles | RainViewer free tier; NOAA WMS |
| Multi-model forecasts | Open-Meteo (non-commercial) |
| AQI | EPA AirNow (free key); PurpleAir fallback |
| Sun/moon/solunar | pure astronomy math, no API |
| Algal blooms | EPA CyAN |
| Official climate normals | NOAA ACIS |
| Fishing reports, ramp status | AZGFD (link/cite) |

Full per-site inventories with source links live in the session transcript; the load-
bearing facts are captured above and in the individual tickets.
