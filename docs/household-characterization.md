# Household characterization results

Only tests and this report were added/changed. Household calculations have not been extracted or corrected.

## Files

- Changed: js/appCalculation.test.html (four household cases and independent arithmetic/display assertion helpers).
- Added: docs/household-characterization.md (this report).
- Removed: projection-baseline.html and projection-syntax-check.html. Inspected both and searched the project for references; neither was used by production or repeatable test suites. The former held the old extraction snapshot probe; the latter was a temporary syntax probe.
- Kept: js/retirementCalculation.test.html and all production files. SHA-256 comparisons confirm every production JavaScript file, v0.01.html and CSS file is unchanged.

## Trace of current behavior

Only IDs in householdMembers enter household totals. Base final value, profit, and yearly balances are summed from each person's already-adjusted base result. Total invested remains nominal. Household bull/bear totals and yearly balances are accumulated from separate simulations BEFORE the later combined-scenario inflation adjustment; household copies therefore remain nominal. Profit-analysis invested chart values are separately deflated each year.

Household analysis passes unrounded totals through renderTopSummary. Tests temporarily observe that existing boundary and call the original renderer unchanged, restoring it afterward. They check real Chart.js dataset values, cached individual balances, normal household cards, the excluded person's card, the all-person combined card, and household analysis summary cards. Scenario lines are checked when enabled and absent when disabled. No production locals or formulas were altered to make values testable.

## Independent arithmetic

Two years, all contributions start immediately and continue throughout, no annual contribution increases:

- Household A: initial 1000, monthly 10, annual return 0%.
- Household B: initial 2000, monthly 20, annual return 12%.
- Excluded C: initial 3000, monthly 30, annual return 6%.
- Per-person rates enabled; global return 8% deliberately differs.
- Inflation off/on at 10%; scenario range +/-2 percentage points, scenario display off/on (four cases).

For year y, n=12*y monthly deposits. The independent geometric-series formula is F(P,M,r,y)=P*q^n+M*q*(q^n-1)/(q-1), q=1+r/12. Multiplication by q reflects deposits occurring before monthly growth. At r=0 use P+n*M. The expected values do not call simulateInvestment or calculatePersonProjection.

Base nominal household = F(1000,10,0,y)+F(2000,20,.12,y).
Invested household = 3000+30*12*y, giving 3360 then 3720.
Bull nominal household = F(1000,10,.02,y)+F(2000,20,.14,y).
Bear nominal household = F(1000,10,-.02,y)+F(2000,20,.10,y).
Excluded C = F(3000,30,.06,y), included only in C's projection and all-person totals.

With inflation, divide base and C's balances by 1.1^y. Household profit at year 2 is adjusted base minus 3720/1.1^2; the invested card still shows 3720. The invested chart divides that year's cumulative invested amount by 1.1^y. Household bull/bear are NOT divided by inflation in the existing behavior.

| Result | Year 1 | Year 2 |
| --- | ---: | ---: |
| Household base, inflation off | 3629.836621 | 4324.333287 |
| Household base, inflation on | 3299.851474 | 3573.829163 |
| Household bull, either inflation setting (nominal) | 3699.178140 | 4484.498141 |
| Household bear, either inflation setting (nominal) | 3561.721988 | 4169.948734 |
| Excluded C, inflation off | 3556.950641 | 4148.252779 |
| Excluded C, inflation on | 3233.591492 | 3428.308082 |

Final household profit is 604.333287 without inflation and 499.448998 with inflation. Numeric assertions use tolerance 0.000001; displayed currency is independently rounded and formatted to whole euros.

## Verification and ambiguity

- Full planner browser suite: PASS 20/20 (previous 16 plus four household cases), no failing cases.
- Full retirement browser suite: PASS 8/8, no failing cases.
- JavaScript syntax: PASS, all nine production scripts and inline scripts from both suites (11 scripts), compiled with Chrome's JavaScript parser via new Function.
- Browser console: no JavaScript exceptions or error-level page console messages. Existing deliberate invalid/Infinity number-input tests emitted two expected warnings per suite. Chrome background-service diagnostics are not application console errors.
- Browser suites used the real localhost planner and Chart.js in a fresh temporary Chrome profile, isolating localStorage from normal user data. The suites restored their prior plan keys. The syntax probe was created outside the project in the system temporary directory.
- Meaning remains ambiguous: the inflation-enabled scenario graph mixes a purchasing-power base with nominal bull/bear. In this fixture the nominal bear exceeds the adjusted base. Tests intentionally do not assert bull >= base >= bear across these mixed units. The tests establish what the code does, not whether those units are the intended product design.
- The invested total card is nominal, while the invested chart is in purchasing power when inflation is enabled. This difference is explicitly tested.
- Scenario final numbers are checked unrounded at the render boundary and on chart endpoints; the visible top summary exposes base/invested/profit, not separate bull/bear cards. No screenshot or cross-browser visual review was performed. Household retirement-model semantics were not added to this task's coverage; the existing retirement suite passed unchanged.

## Every browser test result

### app

- PASS (20/20)
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
