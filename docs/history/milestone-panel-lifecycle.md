# Milestone detail-panel lifecycle

Date: 2026-10-04. This fix addresses only superseded milestone detail-panel writes. No extraction, calculation change, threshold change, or progress/scrolling fix was made.

## Before editing

README and `docs/history/milestone-characterization.md` were read, then Git status was checked. The working tree was clean. The existing milestone suite was run against unchanged production code in a fresh temporary Chrome profile with normal timing: **19/21**, two assertion failures, zero test-runner problems, zero browser exceptions/console errors.

Both original assertions were retained unchanged:

1. Click 250, toggle it off, then click 500 before the reset fires. Expected: First's 500 details, year 2, portfolio 700, selected tracker/node, chart year 2, 40% progress. Actual after settling: placeholder and content flag 0, despite correct selection, chart highlight, and progress.
2. Click 250, toggle it off, then hover 500. Expected: unselected 500/year-2/700 preview. Actual: immediate 500 preview was overwritten by old 250/year-1/400 details, then cleared to the placeholder. Chart year remained 2 and progress remained 40%.

The selection swap runs after 110 ms, followed by an animation frame and a 300 ms fade-in. The deselection reset runs after 210 ms. These independently scheduled writes previously had no ownership or cancellation. The original assertions inspect the settled state after approximately 700 ms, rather than accepting absence of exceptions as proof of correctness.

## Competing writers and ownership

| Path | Panel write | Ownership after this fix |
| --- | --- | --- |
| `selectMilestone` -> completed/projected/unreachable updater -> `_animateMilestonePanel` | 110 ms HTML swap and frame-driven fade-in | New generation; cancels prior timer/frame; guards both callbacks |
| `deselectAllMilestones` | Immediate fade-out; 210 ms placeholder reset | New generation; cancels prior timer/frame; guards reset |
| Unselected `onMilestoneNodeHover` -> `updateMilestoneDetailsInstant` | Immediate preview HTML | Invalidates prior work and restores opacity/position after a cancelled fade |
| Unselected `onMilestoneNodeLeave` | Immediate fade-out; conditional 210 ms placeholder reset | New generation; cancels prior timer/frame; guards reset and retains existing hover/selection condition |
| `_calculateInvestmentCore` | Replaces `personResults` | Cancels and invalidates panel work immediately before replacement |

`clearMilestonePanelWork()` owns one generation counter, timer handle, and frame handle. Each competing panel intent cancels older work and advances the generation. `ownsMilestonePanel()` requires the captured generation to match and the captured element to be connected and still be the current `msDetailsPanel`. This prevents obsolete work from changing either a newer panel state or a detached/replaced panel. Callbacks check ownership before touching HTML, attributes, or styles.

Selected details retain precedence over hover previews: hovering another node while something is selected does not replace its detail HTML or invalidate its pending selection animation. Existing leave behavior still restores the selected chart year, or clears it when appropriate. Hover-leave placeholder conditions remain unchanged.

Ordinary timing remains 110 ms for the selection swap, 210 ms for resets, and 300 ms for fade-in. Generated HTML, CSS, chart highlighting, calculations, thresholds, storage, and script order are unchanged. The 80 ms progress timer, 220 ms scrolling callback, and 600 ms ripple removal are untouched. Historical characterization results remain in the earlier report.

## Regression coverage

The milestone suite retains all 21 original checks, including both formerly failing assertions. Three focused checks were added:

- A newer unselected hover preview survives an older hover-leave reset.
- An ordinary fade-in callback is captured through a temporary browser API wrapper, then delivered again after a newer preview owns the panel. HTML, style, and content flag must remain unchanged. The wrapper schedules the original frame normally and is restored afterward; no controller source is injected.
- Pending selection work across person switching, recalculation, Profit navigation, and analysis exit must leave the detached panel's HTML/styles/content flag unchanged. Replacement details, progress, selection, and chart state are also checked.

The existing checks continue to verify individual/household rendering, primary-row click details versus hovered-row previews, selected-detail persistence, projected/achieved/unreachable highlighting, rapid interactions, latest values on replacements, and representative inflation/currency/year/theme/escaped-name behavior. Visible progress widths and panel opacity/layout are checked alongside shared state and actual chart highlight drawing.

## Verification results

Tests use the real planner in a visible iframe, localhost, a fresh temporary browser profile, and normal elapsed time. Plan, active-plan, and theme storage keys are restored after the suites. Chrome is headless and uses `--no-sandbox` for this execution environment. Startup and later browser exceptions/console errors are monitored through its debugging connection; the milestone harness also monitors iframe errors/rejections after load.

| Suite | Assertions | Browser exceptions / console errors |
| --- | --- | --- |
| Simulator | PASS 5/5 | 0 / 0 |
| Planner | PASS 23/23 | 0 / 0 |
| Retirement calculations | PASS 8/8 | 0 / 0 |
| Profit donut | PASS 3/3 | 0 / 0 |
| Retirement lifecycle | PASS 5/5 | 0 / 0 |
| Milestone UI | PASS 24/24 | 0 / 0 |

Milestone results have zero assertion failures, zero runner problems, and zero iframe errors/rejections. Both original race cases now show First's 500/year-2/700 details after settling; the selection case retains both selected classes, and the preview case remains unselected. Both preserve chart year 2 and 40% progress. The pending hover-leave, obsolete-frame, and four detached-panel transition checks also passed.

JavaScript syntax: PASS 21/21 script entries using Chrome's parser (`new Function`, without executing the compiled bodies). This covers all 12 production JavaScript files, index inline code, all six test-page inline scripts, and two repeated direct-test dependency entries. No browser exceptions or console errors were observed in any suite, including startup. All six runs restored plan/active-plan/theme keys to their initially absent values. Git diff and whitespace checks passed, with no unrelated changes.

## Limits

- Automated DOM events do not set real CSS `:hover`; physical pointer hit-testing, overlapping nodes, touch, keyboard/accessibility, mobile layouts, and other browsers remain unverified.
- Canvas draw-call observation verifies highlight position/state, not pixel appearance. No screenshot or intermediate-animation visual comparison was performed.
- Ordinary elapsed-time assertions and the frame ownership replay do not exhaust every browser scheduling interleaving. The replay verifies invalidation; it is not a virtual-clock test.
- Smooth scrolling and transient progress-bar behavior remain outside this fix. Their existing callbacks are unchanged. The earlier report's observations about retained `window._ms…` snapshots also remain applicable.
- No manual interaction cases were run. Generated markup and existing assertion expectations were preserved; validation does not approve new financial interpretations.

Changed files: `js/app.js`, `tests/milestoneUI.test.html`, `README.md`, and this report. README guidance was adjusted because its statement that the milestone suite currently has known failures is superseded by this fix. All changes remain uncommitted.
