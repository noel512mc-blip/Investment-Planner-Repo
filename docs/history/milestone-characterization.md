# Milestone UI characterization

Date: 2026-10-04. This is characterization before extraction. Production JavaScript, HTML, CSS, formulas, inflation treatment, and storage implementation were not changed. No functions were extracted and no lifecycle fix was applied.

## Scope and inspected implementation

README and Git status were checked first; the initial working tree was clean. The actual implementation was inspected, including these eight rendering functions in `js/app.js`:

- `buildMilestoneDetailHTML`
- `updateMilestoneDetailsCompleted`
- `updateMilestoneDetailsUnreachable`
- `_animateMilestonePanel`
- `updateMilestoneDetailsInstant`
- `updateMilestoneDetails`
- `renderMilestoneTimeline`
- `renderMilestoneTabContent`

The inspection also covered their nested formatting/first-hit helpers, selection and hover handlers, `_calculateInvestmentCore`, target/tab/exit paths, timeline input preparation, chart overlay plugin, chart updates, display helpers, script order, milestone styles, and existing browser-test conventions. Selection handlers and chart coordination remain in the controller.

On the repeat verification requested afterward, Git already contained the three uncommitted characterization files from the first run. Those changes were preserved. The only additional test change labels failed expectations as assertion failures and unexpected execution/load errors as test-runner problems; it does not change the expectations or production behavior.

## Running the characterization

Serve the project with `Get-Content .\scripts\serveAppCalculationTests.ps1 -Raw | Invoke-Expression` and open `http://127.0.0.1:8765/tests/milestoneUI.test.html` in a fresh browser profile or private session. Run suites one at a time. Keep normal browser timing; do not accelerate the clock.

The suite uses the real planner in a visible 1280 × 900 iframe. It refuses `file://`, snapshots the plan, active-plan, and dark-mode storage keys, and restores them in `finally`. Its results include fixture expectations, settled snapshots, and action timing. Known failures remain ordinary failing assertions and make the page report `FAILED`.

Verification used headless Chrome with real elapsed time and a newly created temporary browser profile, separate from the user's browser plans. Chrome required `--no-sandbox` to run in this execution environment. The existing localhost test host was reused. The three observed storage keys were absent again after the milestone run.

No controller source was injected or replaced. The harness calls existing public functions and generated inline handlers, dispatches DOM mouse/input events, and uses a read-only evaluation to inspect lexical chart/analysis state. It temporarily observes native canvas path/stroke calls and restores those methods between fixtures and at completion.

## Independent fixture expectations

Zero-return fixtures have no increases or contribution offsets. Expected balances use `initial + 12 × monthly × year`, independently of the production simulation/rendering helpers.

| Fixture | Current value | Year 1 / year 2 | Expected milestone behavior |
| --- | ---: | --- | --- |
| First: 100 initial, 25/month | 100 | 400 / 700 | 100 achieved, 250 projected in year 1, 500 in year 2, 1000 unreachable; progress 40% toward 250 |
| Second: 200 initial, 50/month | 200 | 800 / 1400 | 100 achieved, 250 and 500 in year 1, 1000 in year 2; progress 80% toward 250 |
| Selected household: First + Second | 300 | 1200 / 2100 | 100 and 250 achieved, 500 and 1000 in year 1, 2500 unreachable; progress 60% toward 500 |
| Excluded third person: 900 initial, 100/month | Excluded | Excluded | Must not affect household values or appear in its milestone view |
| Zero portfolio / empty household | 0 | 0 / 0, or no rows | No projected markers/nodes; zero progress and the initial detail placeholder |
| Individual 5m / household 2m + 3m | 5000000 | 5000000 / 5000000 | All 15 thresholds achieved; last three tracker entries; no future bars/nodes/markers |

Threshold checks cover initial values 99, 100, and 100.01, plus an exact projected balance of 100 from 88 initial and 1/month. Equality counts as reached.

The household view preserves Household, First, Second ordering in both shared row data and visible timeline labels. Hovering First's 500 node previews First at year 2 with 700; clicking that node selects the primary Household row at year 1 with 1200. This is current behavior, not a change to selection semantics.

Representative display checks cover:

- Inflation: 100 initial and 50/month at 0% return with 50% inflation produce `700/1.5` and `1300/2.25`; 500 moves to year 2, displayed balance 578. The initial 100 remains achieved.
- Dollar conversion: rate 1.08; First's 700 displays as `$756`. Preserve the existing `$1.1k` tracker label versus `$1k` timeline label for the 1000 threshold.
- Calendar years: start 2030 makes offset 2 display as 2031 in details, tooltips, chart labels, and the retirement annotation.
- Dark/light timeline backgrounds and dark household color.
- An HTML-like person name containing an image tag, an event attribute, ampersand, and quotes remains literal text; no image node is created or event executed.

## Results

| Suite | Result |
| --- | --- |
| `simulateInvestment.test.html` | PASS 5/5 |
| `appCalculation.test.html` | PASS 23/23 |
| `retirementCalculation.test.html` | PASS 8/8 |
| `profitDonut.test.html` | PASS 3/3 |
| `retirementLifecycle.test.html` | PASS 5/5 |
| `milestoneUI.test.html` | FAILED: 19 passed, 2 known lifecycle failures, 21 checks total |

Both milestone failures were reproduced in the initial run and remained failing in the final run. Passing checks inspect values and visible behavior, not merely absence of exceptions. Progress assertions compare both inline percentages and settled layout widths. Detail assertions check text, content flags, panel layout and opacity. Selection assertions check tracker/node classes. Chart assertions check the active year and actual solid highlight stroke at the expected x-axis pixel; clearing checks confirm that stroke is absent.

The milestone result contains **two assertion failures and zero test-runner problems**. An `AssertionError` identifies a failed fixture expectation. Unexpected execution errors or load/wait timeouts are separately labeled `runner`; a top-level setup failure displays `TEST RUNNER ERROR`. Known races are not setup errors and are not suppressed.

Chrome's JavaScript parser accepted all 21 script entries checked: the 12 production JavaScript files, the index inline script, all six test-page inline scripts, and the simulator/retirement scripts loaded again by their direct test pages. Runtime monitoring reported zero browser exceptions or console errors in every suite; the new suite also recorded zero iframe error or unhandled-rejection events. All six runs ended with the three inspected storage keys restored to their initially absent values. Diff/whitespace checks passed; only README, the new test page, and this report changed.

### Milestone case results

- PASS Individual achieved, projected and unreachable rendering
- PASS Threshold boundaries at year zero and first projected year
- PASS Household-first rendering and excluded people
- PASS Empty individual and empty household rendering
- PASS All-achieved individual and household rendering
- PASS Projected hover, leave, click, toggle and selected persistence
- PASS Hovered-row preview versus primary-row click details
- PASS Rapid select/select settles at the latest milestone
- **KNOWN FAILURE** Rapid select/deselect/select keeps latest selected details
- PASS Rapid hover/leave/click/leave preserves selected detail
- **KNOWN FAILURE** Rapid click/toggle/hover keeps latest unselected preview
- PASS Person switching while progress update is pending
- PASS Person switching while detail panel swap is pending
- PASS Recalculation while progress and panel updates are pending
- PASS Tab switching while progress and panel work is pending
- PASS Leave and immediately return during delayed milestone work
- PASS Analysis exit while progress and panel work is pending
- PASS Inflation preserves current-value classification and adjusted projection
- PASS Currency, calendar year, dark theme and escaped-name display
- PASS Light theme and calendar retirement annotation
- PASS No browser exceptions across milestone interactions

## Confirmed lifecycle failures

### 1. Deselection reset overwrites a newer selected detail

Trigger: on First's fixture, click tracker 250, click it again to toggle off, then click tracker 500 before the deselection reset fires. The harness performs the three actions in the same task, separated by only a few milliseconds of real execution, then waits 700 ms.

Expected settled result: 500 is selected in tracker and timeline; details show First, year 2, portfolio 700; active chart year is 2; progress remains 40%.

Actual settled result: tracker and timeline still select 500 and the chart correctly highlights year 2, but the panel says `Hover or click a milestone to see details`, with `data-has-content="0"` and opacity 1. Both progress bars remain 40%. This is a visible selection/detail inconsistency without a JavaScript exception.

Cause in the inspected source: `_animateMilestonePanel` schedules each HTML swap after `round(ANIM.fast / 2) + 10 = 110 ms`, followed by a frame that starts the 300 ms fade-in. `deselectAllMilestones` schedules an unconditional placeholder reset after `ANIM.fast + 10 = 210 ms`. It does not check whether a newer selection now owns the panel. The latest 500 details are inserted first; the obsolete reset replaces them later.

Latest verification timing relative to the first click: toggle off at +4 ms, select 500 at +8 ms, correct 500 details sampled at +160 ms, placeholder observed at the settled inspection at +710 ms. The selected classes and year-2 highlight still matched 500 at that inspection.

### 2. Pending selected-panel work overwrites a newer hover preview

Trigger: click tracker 250, toggle it off, then hover projected node 500 without emitting a leave event. Again, the actions occur in one task and the settled result is inspected after 700 ms.

Expected settled result: no selection classes, but the hovered 500 preview remains First, year 2, portfolio 700, with active chart year 2.

Actual settled result: no selection classes and active chart year 2, but the panel ends at the placeholder with its content flag 0. Progress remains 40%.

The immediate hover preview is synchronous. The older 250 panel swap is still scheduled for 110 ms; the unconditional deselection reset is scheduled for 210 ms. The test records the immediate preview and another panel sample after 150 ms, then makes its unchanged latest-preview assertion after all relevant panel timers/fades have settled. Neither updater cancels or invalidates the older work.

Latest verification timing relative to the first click: toggle off at +4 ms, hover 500 at +6 ms, correct 500/year-2/700 preview sampled at +9 ms, obsolete 250/year-1/400 details sampled at +167 ms, and placeholder observed at +718 ms. Active chart year remained 2.

The tests intentionally do not accept the placeholder as expected behavior, omit detail assertions, or turn these failures into passes. Production remains unchanged.

## Passing transition observations and remaining risks

The tested progress callbacks resolve elements by ID after 80 ms. Detail animation, deselection, and hover-leave callbacks capture their panel element; selection scrolling resolves the panel by ID after 220 ms. Ripple removal captures its ring and runs after 600 ms. No milestone callback generation or cancellation lifecycle currently exists.

For the tested replacements, later render timers won by the settled observation: switching from First to Second produced 80% bars and Second's rows/markers; recalculating initial value to 300 produced 60% bars and balances 600/900; leaving and returning showed the latest details/selection/markers. Exiting analysis left no milestone panel, progress elements, selection classes, overlay data, or active highlight. These passing results do not establish that there is no transient obsolete percentage or unintended scroll before settling.

`_calculateInvestmentCore` resets `milestoneOverlayData` and `milestoneActiveYear` and replaces `personResults`. The `window._milestoneRows`, `window._msMilestoneData`, and `window._msCurrentPortfolioValue` snapshots are not explicitly cleared on exit; a later milestone render overwrites them. This was inspected in source, not classified as a failing cleanup requirement for these rendering tests.

## Verification limits

- No cases were covered manually. Automated DOM events exercise generated inline handlers, but do not simulate a physical pointer or set CSS `:hover`. In particular, pointer hit-testing, movement between overlapping timeline nodes, and the hover-leave guard's real `:hover` branch remain unverified. The click/toggle/hover failure also has an unconditional deselection reset, so its captured failure does not depend on that guard.
- Smooth scrolling, intermediate animation appearance, detached-panel mutation, and transient progress-bar updates were inspected in source but not asserted. Tests inspect settled visible content/layout; they do not perform screenshot/pixel comparisons or require elements to be within the scroll viewport.
- Native canvas observation verifies the highlight's draw call and position, not the final raster appearance. Touch, keyboard interaction, accessibility, mobile layouts, and browsers other than Chrome were not tested.
- Representative display cases do not exhaust all currencies, inflation rates, labels, pension settings, or input combinations. Existing calculation suites provide broader numeric coverage.
- Iframe error/rejection listeners attach after initial load. A browser debugging connection separately monitors startup and subsequent runtime exceptions and console errors.

These findings characterize the eight-function rendering boundary. They do not authorize or implement extraction, formula changes, broader refactoring, or a lifecycle repair.
