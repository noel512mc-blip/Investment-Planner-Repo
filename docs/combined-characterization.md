# All-person combined characterization baseline

## Exact changes

- js/appCalculation.test.html: two numeric characterization cases (inflation off/on), independent closed-form expectations, public summary/chart checks, and a test-only observation of private accumulator values.
- docs/combined-characterization.md: this report.

SHA-256 checks confirm production JavaScript, v0.01.html, CSS, retirementCalculation.test.html and profitDonut.test.html are unchanged. No combined extraction was started.

## Accumulation trace and UI exposure

Every person contributes regardless of householdMembers:

- combinedFinal, combinedInvested, combinedProfit: sum each person's base result. Base final/profit have already received their existing inflation treatment; invested remains nominal.
- combinedBalances: sum the base yearly histories, already inflation-adjusted when enabled.
- combinedBullFinal, combinedBearFinal, combinedBullBalances, combinedBearBalances: sum the separate scenario simulations AFTER the controller deflates their final values and yearly histories when enabled.

Selected household accumulation occurs BEFORE those scenario adjustments, so its bull/bear copies remain nominal. Household base is adjusted. These are distinct sets of totals. Despite its name, combinedInvestedBalances is a selected-household invested history, not an all-person invested history; this task does not relabel or alter it.

The overview summary displays all-person final/invested/profit, and portfolioSummaryData exposes the unrounded final and individual final balances. The overview chart exposes three individual histories plus the selected-household line. There is no all-person combined base/scenario dataset: combinedBalances, combinedBullFinal/combinedBearFinal and their histories are accumulated but not consumed by chart construction. The highlighted target named 'combined' means selected-household analysis, not all people.

The tests verify the existing overview chart lines and their sum against all-person expectations, assert that the household line excludes C, and check the rounded summary and unrounded public portfolio data. To check otherwise inaccessible local accumulators, they temporarily insert a snapshot assignment into the iframe's in-memory _calculateInvestmentCore function immediately after the person loop. No production file or arithmetic is changed. The hook copies arrays, restores the original function in finally, and checks that public numeric/chart/text results before and after instrumentation are identical. A changed source boundary fails explicitly instead of silently skipping the checks. This source-bound observation will need updating when aggregation is later extracted.

## Independent expectations

Two years, monthly contributions before monthly growth, no contribution increases or offsets:

- A: initial 1000, monthly 10, personal return 0%.
- B: initial 2000, monthly 20, personal return 12%.
- C: initial 3000, monthly 30, personal return 6%.
- Selected household is A+B; C is excluded only from household totals.
- Global return is 8%, deliberately different from personal rates.
- Scenario range is +/-2 percentage points; inflation is off or 10%.

For n=12*y months, q=1+r/12, F(P,M,r,y)=P*q^n+M*q*(q^n-1)/(q-1). At r=0, F=P+n*M. This independent geometric-series oracle does not call production simulations or projection helpers.

For each year, base=sum F at personal rates (0%,12%,6%); bull=sum F at (2%,14%,8%); bear=sum F at (-2%,10%,4%). All three sums include C. With inflation on, divide each year's sum by 1.1^y. Invested final=1000+2000+3000+24*(10+20+30)=7440 nominal. Final profit=base-7440 without inflation, or base-7440/1.21 with inflation. Tolerance is 0.000001; visible euros are independently rounded to whole amounts.

| All-person result | Inflation off year 1 | Inflation off year 2 | Inflation on year 1 | Inflation on year 2 |
| --- | ---: | ---: | ---: | ---: |
| Base | 7186.787262 | 8472.586066 | 6533.442966 | 7002.137245 |
| Bull | 7324.164426 | 8786.344267 | 6658.331296 | 7261.441543 |
| Bear | 7051.842749 | 8170.158533 | 6410.766136 | 6752.197135 |

Final invested is 7440 in both fixtures. Final profit is 1032.586066 without inflation and 853.376914 with inflation. Off: all nominal. On: base/bull/bear/profit are purchasing-power amounts, while the invested total is nominal.

## Ambiguous meaning preserved

The inflation-enabled summary mixes units: final 7002.14 is below nominal invested 7440, yet profit is positive 853.38 because the profit formula subtracts 7440/1.21 rather than 7440. The invested adjustment uses the final horizon for the entire invested total. Tests characterize that existing formula; whether it is the desired financial presentation remains a product decision.

All-person scenarios use consistent purchasing-power units when inflation is on, unlike household scenarios. Whether the unexposed combined histories/scenarios should eventually be displayed is not decided here. No new chart series or UI was added.

## Verification

- Full planner: PASS 23/23, including both new cases and every prior case.
- Full retirement: PASS 8/8.
- Existing profit-donut suite, unmodified: PASS 3/3 with real browser time and real Chart.js.
- Syntax: PASS 13/13 scripts (ten production scripts plus inline scripts in all three suites), using Chrome's parser via new Function.
- Console: no JavaScript exceptions or page console errors in final suite runs. Planner and retirement each emit expected invalid/Infinity number-field warnings from existing fallback tests. Donut console is clean.
- Fresh temporary Chrome profiles isolate browser storage; suites restore prior test-origin plan keys. Temporary syntax/debugging probes were outside the project. The initial syntax probe output path accidentally replaced its temporary input; it was rerun with separate paths and passed.
- No failures in final assertions. No screenshot review or other-browser verification was performed. Private scenario values cannot be checked against a displayed all-person scenario series because none exists.

## Every suite result

### planner

- PASS (23/23)
- PASS All-person combined totals: inflation off
- PASS All-person combined totals: inflation on
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

### Profit donut

- PASS (3/3)
- PASS Rapid input changes while creation is pending
- PASS Switch views while creation is pending, then leave an existing donut
- PASS Ordinary open, donut hover, pointer leave, KPI hover and recalculation
