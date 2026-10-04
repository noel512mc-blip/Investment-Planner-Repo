# Selected-household accumulation extraction

## Files changed

- Added js/householdCalculations.js: accumulateHouseholdProjection(totals, { isMember, result, bullResult, bearResult }).
- Changed js/app.js: replaced only the selected-household accumulation block with a call to that function and assignment of its returned accumulator fields. Comparison with the pre-edit controller confirms the remainder is unchanged (ignoring line endings).
- Changed v0.01.html: loads householdCalculations.js as a regular script after investmentCalculations.js and immediately before app.js. The new helper itself has no script, DOM, or simulation dependencies.
- Changed js/appCalculation.test.html: added one direct worker-based test case with multiple numeric and ownership assertions. The four existing household browser characterization cases remain unchanged.
- Added docs/household-extraction.md: this report.

## Fields moved and timing

The controller explicitly supplies the membership decision and per-person base and separate combined-scenario results. The helper mutates only the supplied accumulator and returns it; it does not mutate or retain references to the source result arrays.

| Accumulator field | Supplied value and timing |
| --- | --- |
| householdFinal | result.finalBalance, already adjusted for inflation when enabled |
| householdInvested | result.totalInvested, still nominal |
| householdProfit | result.totalProfit, already calculated using the base projection's existing inflation treatment |
| householdBalances | result.balances, already adjusted year by year when inflation is enabled |
| householdBullFinal | combinedBullResult.finalBalance, still nominal at this point |
| householdBearFinal | combinedBearResult.finalBalance, still nominal at this point |
| householdBullBalances | combinedBullResult.balances, still nominal |
| householdBearBalances | combinedBearResult.balances, still nominal |

The helper adds in the same order and applies no new conversion, fallback, or financial formula. An excluded person returns the accumulator unchanged. The later controller adjustment of combinedBullResult and combinedBearResult cannot retroactively affect the accumulated household numbers.

The profit chart's combinedInvestedBalances series stays in app.js. Its source, personBalancesInvested, is created later by copying result.balancesInvested (or the existing zero-array fallback), then divided year by year by inflation when enabled. Before household accumulation it also supplies highlightedInvestedBalances; highlightedPortfolioBalances is set in that same block. Joining this series to the earlier helper call would require moving that preparation/UI-related bookkeeping or redesigning the loop. The existing order was retained.

Input reading, validation, every simulateInvestment call, individual and all-person combined totals, timeline values, charts, cards, HTML, state, and inflation adjustments outside the selected accumulation remain in app.js. Mixed household inflation units and displays are unchanged.

## Direct numeric checks

The helper runs in a Web Worker importing only householdCalculations.js, with no document/window or simulation functions available.

Supplied base histories A=[110,120], B=[220,250] add to [330,370]. Nominal invested totals 120+220=340; base profit 0+30=30. Supplied bull histories [115,132]+[240,290]=[355,422]; bear [105,108]+[210,225]=[315,333]. Each final value matches the last accumulated year.

A second fixture passes bases already adjusted by 10% inflation: base year 1=330/1.1, year 2=370/1.21, profit=30/1.21. Invested total stays 340; bull/bear stay nominal. All eight fields are checked after the first and second selected person. Checks also cover an empty selection, an excluded person between members, accumulator identity, unchanged source inputs, and independence from subsequent source-result/array mutations. Numeric tolerance is 0.000001.

## Verification

- Full planner suite: PASS 21/21, including all four household browser gates and the direct helper checks.
- Full retirement suite: PASS 8/8, unchanged suite.
- Syntax: PASS 12/12 scripts (ten production JavaScript files plus inline JavaScript from both full suites), compiled by Chrome's parser via new Function.
- Repeat planner run: PASS 21/21.
- Original-controller comparison: PASS 21/21 using the same expanded suite in an isolated temporary copy with the pre-extraction app.js restored. This verifies the browser gate against the old accumulation too; the direct helper test still loads the new helper separately.
- Browser storage: fresh temporary Chrome profiles; real localhost planner and Chart.js. The comparison copy uses a different localhost port. Normal user storage was not used.
- Controller comparison: PASS; no code outside the selected accumulation block changed.

Console check is NOT clean: the planner runs reported `Uncaught Error: Canvas is already in use. Chart with ID '1' must be destroyed before the canvas with ID 'profitDonutCanvas' can be reused.` The identical exception reproduced with the pre-extraction controller in the isolated comparison and again on the extracted controller. It therefore is not specific to this extraction. Its underlying chart lifecycle cause remains uninvestigated/unfixed within this narrowly scoped task. No numeric assertion failed. Retirement reported no uncaught JavaScript exception. Both suites also emitted the expected number-field warnings for their deliberate invalid/Infinity input tests.

No screenshot or cross-browser visual review was performed. No household inflation-unit correction or display redesign was attempted.

## Every test result

### app

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

### retirement

- PASS (8/8)
- PASS Personal zero retirement survives saving, reload and person switching
- PASS No-return withdrawal amount without state pension
- PASS Extracted base/bull/bear rows match pre-extraction snapshots
- PASS State pension changes goal threshold at its start age
- PASS Additional income starts at its configured age
- PASS One-year inflation-adjusted retirement row
- PASS Bull/base/bear retirement FI ages
- PASS Per-person assumptions survive switching and reload
