# BurstLab

**Rehearse a support-queue burst, then see who benefits from a priority rule and who waits longer.**

[![Tests](https://github.com/brohum10/burstlab/actions/workflows/tests.yml/badge.svg)](https://github.com/brohum10/burstlab/actions/workflows/tests.yml) · [Open the interactive demo](https://brohum10.github.io/burstlab/) · [Inspect fixed-seed evidence](evidence/default.json)

BurstLab is a browser-only, discrete-event capacity simulation. Move the staffing, peak-arrival, and urgent-share controls to compare **FIFO** with **urgent-first** dispatch on identical synthetic ticket arrivals and service times. The app shows urgent wait-target misses, the cost to routine tickets, queue depth, and how long the queue takes to drain. It runs locally in the browser, with no account, API key, or runtime package dependencies.

## The default experiment

The fixed-seed default uses four interchangeable agents, a four-hour arrival window, a 60-minute burst at 3× the baseline arrival rate, and 25% urgent tickets. Thirty independently generated synthetic trials are each replayed under both policies.

| Paired-trial result | Urgent-first minus FIFO |
| --- | ---: |
| Urgent **wait-target miss rate** | **69.4 percentage points fewer** |
| Routine **mean wait** | **10.4 minutes longer** |

The percentile bootstrap ranges across these **synthetic trial differences** are 66.2–72.3 percentage points fewer urgent misses and 8.7–12.5 minutes longer routine mean wait. In the first seeded trial, urgent misses go from **58.3% to 0%**, while routine p90 wait rises from **39.1 to 45.7 minutes**. These are outcomes of this deliberately congested toy workload, **not** observed customer impact, a production benchmark, or a staffing recommendation. [The evidence file](evidence/default.json) includes the raw paired differences and first-trial metrics; `npm run evidence` regenerates it.

## Try it

Use the [live demo](https://brohum10.github.io/burstlab/) immediately. To run the site from a downloaded copy, serve the repository root with any static HTTP server; for example, if Python is installed:

```sh
python3 -m http.server 8000
```

Then open `http://localhost:8000`. ES modules require an HTTP server, so opening `index.html` directly from Finder may not load the simulation. The **Download JSON** button exports the current controls, comparison, per-trial paired differences, and first-trial metrics. Nothing is uploaded.

With Node.js 20+ installed, run the tests and regenerate the checked-in evidence without installing packages:

```sh
npm test
npm run evidence
```

## How it works

```text
seeded arrivals + priority + service duration
                    │
         same ticket list per trial
                    │
        ┌───────────┴───────────┐
        ▼                       ▼
   FIFO dispatch        urgent-first dispatch
        │                       │
        └───────────┬───────────┘
                    ▼
    paired differences + bootstrap ranges
```

- A seeded generator samples Poisson arrivals each minute. Baseline rate is **0.32 tickets/minute**; minutes **72–132** are multiplied by the selected peak factor. Each ticket gets a seeded priority and service duration of `min(45, 2 + exponential(mean 7))` minutes. This is an illustrative arrival/service model, not fitted data.
- An event-driven simulator uses min-heaps for completions and waiting tickets. Completed work and new arrivals at the same instant are processed before assigning available agents. Agents do **not** interrupt active work to take an urgent ticket.
- FIFO selects the earliest waiting ticket. Urgent-first selects urgent tickets first, then orders within each class by arrival and ID. The policies see identical tickets and service durations for every paired trial.
- A miss means **waiting more than** 10 minutes for an urgent ticket or 45 minutes for a routine ticket; it does not measure completion SLA. p90 uses the nearest-rank percentile. Queue depth is sampled every five minutes through the four-hour arrival window; drain time measures how long service continues after arrivals stop.
- The headline changes average 30 paired differences. A deterministic 1,000-resample percentile bootstrap gives a range for the **generated scenario's** trial-to-trial variation. It is not a confidence interval for a real support center. Individual paired differences are exported for inspection.

The **15 tests** cover heap order, simultaneous events, non-preemption, multi-agent dispatch, empty workloads, queue timelines, wait-target boundaries, validation, deterministic generation, paired comparison, bootstrap behavior, and missing priority groups. GitHub Actions reruns tests and checks that the committed default evidence matches the generator.

## Boundaries

- The simulator assumes independent generated arrivals and service times, identical interchangeable agents, infinite waiting capacity, a fixed four-hour arrival window, and no breaks, shifts, skills, outages, abandonment, or customer behavior. A different assumption can reverse the policy trade-off.
- Urgent-first may delay routine work. A reduction in urgent misses is **not** a blanket improvement. Inspect both sides and test against real workload data before using a policy.
- The UI reports the first trial separately from the 30-trial mean to avoid mixing a single-run chart with aggregate results. Bootstrap intervals are descriptive for the synthetic generator only.
- This is an educational model and client-side visualization, not a validated forecast, production scheduler, or customer-support application.

Developed with AI assistance. The generator, deterministic seed, raw paired differences, tests, and limitations are included so the claims can be checked. MIT licensed.
