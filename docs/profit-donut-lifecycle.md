# Profit donut lifecycle fix

## Cause confirmed before editing

Reproduced in the real localhost planner with fresh Chrome profile/localStorage. One person: initial 1000, monthly 0, one year, return 8%, inflation off. Open profit analysis, then dispatch investment input changes to 2000 and 3000 in the same task, before the 460 ms donut creation delay expires.

Captured timing (milliseconds relative to opening analysis):

| Time | Action |
| ---: | --- |
| 0 | Open profit analysis |
| 4 | Schedule creation for initial 1000, delay 460 |
| 17/18 | Input 2000; schedule another creation |
| 27/28 | Input 3000; schedule another creation |
| 464 | Oldest callback fires; its original canvas is disconnected. It looks up the newest canvas by ID and creates Chart 1 with stale data [1000,82.9995068075]. |
| 478 | Second callback tries to create a chart on that occupied canvas and throws. |
| 488 | Latest callback also throws on the same occupied canvas. |

Captured constructor stack:

```text
Error: Canvas is already in use. Chart with ID '1' must be destroyed before the canvas with ID 'profitDonutCanvas' can be reused.
    at new Tn (https://cdn.jsdelivr.net/npm/chart.js:13:90635)
    at Object.construct (http://127.0.0.1:8765/js/profitDonut.test.html:176:34)
    at http://127.0.0.1:8765/js/analyticsCharts.js:375:24
    at http://127.0.0.1:8765/js/profitDonut.test.html:188:13
```

The constructor proxy captures the full stack even when the browser's window error event lacks cross-origin error details. The old entry-time destroy check saw a null profitDonutChart reference during all three renders, because no timer had fired yet. Once the first timer fired, its chart occupied the newest canvas. The result was both a stale donut and two exceptions. The chart registry and stored reference still showed the stale 1000 investment instead of the latest 3000.

## Exact changes

- js/analyticsCharts.js: added clearProfitDonut(), a pending creation timer handle, and a render generation number. Cleanup invalidates old work, cancels pending creation, destroys the stored donut and clears its reference. renderProfitDonut captures its own canvas and generation; it creates a chart only if both are still current and the canvas is connected. It releases any Chart.js registry owner before reusing that canvas. Deferred count-up, hover, hover-exit and badge callbacks, plus KPI events, check render ownership before updating anything.
- js/app.js: one clearProfitDonut() call immediately before _calculateInvestmentCore replaces personResults HTML. This releases the old chart and cancels pending creation when recalculating, switching away, or exiting profit analysis.
- js/profitDonut.test.html: new standalone repeatable browser suite with constructor/timer tracing, captured errors, chart registry/reference assertions, latest numeric values, view-switch checks, and real event/animation checks.
- docs/profit-donut-lifecycle.md: this report.

No changes to financial formulas, household calculations, storage, CSS, other chart implementations, or Chart.js options. The donut still uses the original 460 ms creation delay, 1200 ms easeOutCubic chart animation, 1100 ms counter, 70% cutout, colors, hover offset, and KPI styling. A source comparison confirmed all analyticsCharts.js code preceding the profit donut is unchanged.

## Running the regression

Run the existing js/serveAppCalculationTests.ps1 server, then open http://127.0.0.1:8765/js/profitDonut.test.html. The suite restores existing test-origin plan keys afterward. Use normal browser timing for the animation/interaction case. The iframe is visible during execution to avoid hidden-frame animation throttling and is removed at completion.

## Results

- Pre-fix reproduction: FAIL 0/1, with the captured exceptions and stale final donut described above.
- Final profit donut suite with real browser timing: PASS 3/3.
- Full planner suite in isolated storage: PASS 21/21.
- Full retirement suite in isolated storage: PASS 8/8.
- Syntax: PASS 13/13 scripts (ten production scripts and inline scripts from all three suites), compiled with Chrome's JavaScript parser via new Function.
- Final browser console: no JavaScript exceptions in the donut, planner, or retirement runs. Existing planner/retirement invalid-input tests produce the expected invalid/Infinity number-field warnings. Chrome background-service diagnostics are unrelated to the page console.

After the fix only the newest pending timer creates a donut: latest invested 3000, profit 248.9985204225. View switching shows latest invested 4000 and releases chart references on exit. Ordinary recalculation ends at invested 5000 and profit 414.9975340375, with matching center/KPI values.

The interaction case checks ordinary opening/count-up; mouse movement onto the profit arc and corresponding KPI dimming; leaving that arc into the empty center and then leaving the canvas; invested-KPI hover/leave; and recalculation while a hover-reset callback is pending. It checks chart configuration, active segments, labels, values, chart destruction and registry ownership.

Verification setup issues resolved: accelerated virtual-time headless runs passed the two race checks but timed out on the animated count-up, so the complete interaction test was run through Chrome's localhost debugging connection with real time. An initial synthetic pointer-exit test moved outside Chart.js's hit-test area (which does not deliver the empty-segment hover callback); the final sequence moves into the empty donut center before exiting the canvas. No production interaction change was made to accommodate either test setup. Direct abrupt canvas exit without crossing a tested empty segment, touch interaction, pixel-level appearance, and other browsers were not separately verified.

## Every final test result

### appCalculation

- PASS (21/21)
- PASS Household accumulator works without DOM, excludes nonmembers and preserves input results
- PASS Household mixed rates and excluded person: inflation off, scenarios off
- PASS Household mixed rates and excluded person: inflation off, scenarios on
- PASS Household mixed rates and excluded person: inflation on, scenarios off
- PASS Household mixed rates and excluded person: inflation on, scenarios on
- PASS Person projection works without a DOM and skips unselected scenarios
- PASS Extracted controller projection: 0% return, inflation off
- PASS Extracted controller projection: 0% return, inflation on
- PASS Extracted controller projection: 8% return, inflation off
- PASS Extracted controller projection: 8% return, inflation on
- PASS Per-person zero and eight percent survive save and reload
- PASS Personal rate creation inherits finite global zero
- PASS Missing or invalid personal rate defaults to eight
- PASS One person, zero return
- PASS Selected household and excluded person
- PASS One-year purchasing-power adjustment
- PASS Bull/base/bear scenario ordering
- PASS Zero and ordinary global return save/reload
- PASS Missing and invalid return use default
- PASS Zero inflation and scenario range persist
- PASS Plan reload restores inputs/results

### retirementCalculation

- PASS (8/8)
- PASS Personal zero retirement survives saving, reload and person switching
- PASS No-return withdrawal amount without state pension
- PASS Extracted base/bull/bear rows match pre-extraction snapshots
- PASS State pension changes goal threshold at its start age
- PASS Additional income starts at its configured age
- PASS One-year inflation-adjusted retirement row
- PASS Bull/base/bear retirement FI ages
- PASS Per-person assumptions survive switching and reload

### Profit donut

- PASS (3/3)
- PASS Rapid input changes while creation is pending
- PASS Switch views while creation is pending, then leave an existing donut
- PASS Ordinary open, donut hover, pointer leave, KPI hover and recalculation
