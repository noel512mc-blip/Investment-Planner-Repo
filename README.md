# Milestone

Milestone is a browser-based investment and retirement planner. It helps people explore how contributions, investment returns, inflation, and retirement assumptions could affect their financial future.

The intended audience ranges from beginners exploring how much they could set aside each month to experienced investors who want to examine assumptions and refine their planning.

This repository contains a working frontend prototype. It is being improved incrementally, with particular attention to understandable results, reliable calculations, and maintainable code.

## Project names and relationship

**Majestical** is the working name for the broader financial platform described in the blueprint. **Milestone** is the temporary name for the investment and retirement planning prototype in this repository.

This prototype develops an initial part of Majestical’s Financial Life capabilities. It does not yet implement the broader platform or its other domains. Both names are provisional; final product naming will be decided later.

## Product direction

Milestone should offer a useful starting point without overwhelming new users. Over time, users should be able to choose how much complexity the interface exposes: a simple planning experience for everyday questions, with more detailed controls and analysis available when needed.

The broader Majestical Blueprint v1.1 describes five long-term domains:

| Domain | Intended responsibility |
| --- | --- |
| Financial Life | Personal and household finances, wealth, goals, scenarios, and retirement planning. |
| Markets & Intelligence | External market data, economic information, entities, events, and research. |
| Impact & Ethics | Evidence about impact, ethical preferences, and relationship eligibility. |
| QuantLab | Quantitative research, historical testing, portfolio construction, and strategies. |
| Execution & Control | Operating approved strategies, broker interactions, orders, reconciliation, and operational controls. |

Milestone’s current capabilities primarily relate to investment and retirement planning within Financial Life. The other domains provide broader product context; they are not implemented in this repository.

The blueprint is a long-term design reference, not an instruction to implement every capability immediately. Its detailed requirements should be consulted when work reaches the relevant domain. The reference document is titled `Majestical_Blueprint_v1.1_Part_I_Core_Domains.docx`; it is not currently included in this repository.

## Development priorities

1. **Improve the existing planner.** Strengthen correctness, clarity, usability, stability, and code organization.
2. **Add useful basic features gradually.** Introduce new capabilities when the existing foundation is dependable.
3. **Explore accounts and backend design with the backend collaborator.** Agree on ownership, persistence, authentication, and household permissions before implementation.

Configurable interface complexity is a future product goal. Authentication, online plan storage, and live collaboration are also future work. They should not be assumed to exist.

## What works today

The prototype supports:

- Multiple saved plans, including creating, switching, renaming, duplicating, and deleting plans.
- Multiple projected people with initial investments, monthly contributions, contribution increases, and contribution start/stop years.
- Shared or per-person annual return assumptions.
- Selected-household totals alongside individual and all-person results.
- Base, bull, and bear scenarios.
- Inflation-adjusted projections and configurable year labels.
- Retirement analysis with withdrawal assumptions, state pension, and additional income sources.
- Investment charts, milestone views, portfolio breakdowns, and profit analysis.
- Light and dark modes.
- Importing and exporting plan copies through share links.

The planner models hypothetical inputs and projections. It does not currently manage real investment holdings, bank transactions, broker connections, or executed trades.

A projected person is a planning record, not a signed-in user. Selecting people for a household total does not create accounts or grant permissions.

## Technical overview

The application uses HTML, CSS, ordinary JavaScript, and Chart.js. There is no build step, package installation, or frontend framework.

`index.html` is the entry point. Chart.js is pinned to version 4.5.1 using the minified UMD browser build at `https://cdn.jsdelivr.net/npm/chart.js@4.5.1/dist/chart.umd.min.js`. This matches the version observed in the running planner before pinning. Chart views and the full browser tests require internet access.

The root `.editorconfig` uses UTF-8 and two-space indentation for HTML, CSS, JavaScript, and PowerShell. It leaves line endings unspecified and disables automatic trailing-whitespace trimming and final-newline insertion to preserve existing formatting. Keep Git's repository-local `core.autocrlf=false`; do not normalize or reformat existing files as part of unrelated edits.

The JavaScript files are regular browser scripts, not ES modules. They share some global state and functions. Their order matters: keep `app.js` last and inspect dependencies before changing script loading.

The current cleanup separates calculations and cohesive interface features from the main controller. `app.js` still contains substantial orchestration and rendering logic; the separation is ongoing.

## File guide

### Application files

| File | Purpose |
| --- | --- |
| `index.html` | Main page, static interface elements, inline event handlers, and script loading. |
| `css/styles.css` | Main stylesheet, including layout and light/dark styling. Some inline styles remain in the HTML and generated markup. |
| `js/app.js` | Main controller: startup, shared state, input reading, validation, plan actions, calculation orchestration, remaining result rendering, milestones, retirement interface, and main chart. |
| `js/simulateInvestment.js` | Monthly investment simulation. Returns final balance, invested amount, profit, and yearly histories. |
| `js/investmentCalculations.js` | Per-person base and highlighted scenario projections, including their existing inflation treatment. Calls `simulateInvestment()`. |
| `js/householdCalculations.js` | Accumulates explicitly selected people’s supplied results into household totals. It does not simulate investments or convert units. |
| `js/retirementCalculations.js` | DOM-independent retirement row calculation and income-at-age helper. |
| `js/planStorage.js` | Reads and writes plan storage and migrates the older account storage keys. |
| `js/sharedPlan.js` | Decodes, validates, and normalizes imported shared-plan payloads. Sharing and import workflows remain in `app.js`. |
| `js/planUI.js` | Saved-plan list, active-plan bar, and plan-panel controls. |
| `js/displayUtils.js` | Color helpers, currency formatting and display conversion, and display-year helpers. |
| `js/analyticsCharts.js` | Portfolio expansion and profit donut charts, including lifecycle, animations, and hover interactions. |
| `README.md` | Project orientation, current scope, file responsibilities, development priorities, and working instructions. |

### Script order

`index.html` loads Chart.js, followed by:

1. `simulateInvestment.js`
2. `planStorage.js`
3. `planUI.js`
4. `sharedPlan.js`
5. `displayUtils.js`
6. `analyticsCharts.js`
7. `retirementCalculations.js`
8. `investmentCalculations.js`
9. `householdCalculations.js`
10. `app.js`

Some earlier functions use state or helpers defined in `app.js` when called later. Loading a file successfully does not establish that every dependency has been initialized.

### Tests and test host

| File | Purpose |
| --- | --- |
| `js/simulateInvestment.test.html` | Direct numeric checks of the investment simulator. |
| `js/appCalculation.test.html` | Planner calculations, personal rates, persistence, projections, household selection, and all-person totals. |
| `js/retirementCalculation.test.html` | Retirement rows, pension and additional income, inflation, scenarios, and per-person settings. |
| `js/profitDonut.test.html` | Delayed chart creation, rapid recalculation, view switching, latest values, and donut/KPI interactions. |
| `js/serveAppCalculationTests.ps1` | Local PowerShell web server for the application and browser tests. |

Keep these test files. They are development tools that protect behavior during changes, although they are not linked from the user-facing page.

### Documentation

| File | Purpose |
| --- | --- |
| `docs/data-model.md` | Current prototype data shape and a proposed future model. The proposed model is not implemented. |
| `docs/zero-return-fix.md` | Historical report about preserving valid 0% personal returns. References to its delivery ZIP are historical. |
| `docs/household-characterization.md` | Independent arithmetic and tests for selected-household behavior. |
| `docs/household-extraction.md` | Household accumulator extraction and its verification. |
| `docs/combined-characterization.md` | Earlier all-person characterization, including private accumulators subsequently removed. |
| `docs/unused-combined-cleanup.md` | Removal of unused all-person accumulators and updates to their tests. |
| `docs/profit-donut-lifecycle.md` | Reproduction and resolution of the delayed profit-donut chart race. |

These reports record particular changes. Historical line numbers, test counts, and unresolved issues may have been superseded. Use the current code and latest relevant report when assessing present behavior.

## Running the application

Open `index.html` directly in a browser, or serve the project locally.

From a PowerShell terminal in the project root:

```powershell
Get-Content .\js\serveAppCalculationTests.ps1 -Raw | Invoke-Expression
```

Then open:

```text
http://127.0.0.1:8765/index.html
```

Leave the terminal running while using the server. Press `Ctrl+C` to stop it. If that address already serves this project, reuse the existing server.

The server does not provide a default index page; use the explicit filename.

## Plans, storage, and sharing

Plans are stored in the browser’s `localStorage`, using `investment_plans` and `investment_activePlanId`.

Storage depends on the browser profile and origin. Opening the planner through a local file and opening it through localhost do not automatically share plans.

Share links contain a **copy of plan data in the URL**, using a `?plan=` parameter. Base64 encoding is not encryption. Anyone with the link can import a separate copy.

These links do not provide live synchronization, account invitations, or private household collaboration.

## Running the tests

Use the local server and a fresh browser profile or separate private session. Run test pages one at a time:

```text
http://127.0.0.1:8765/js/simulateInvestment.test.html
http://127.0.0.1:8765/js/appCalculation.test.html
http://127.0.0.1:8765/js/retirementCalculation.test.html
http://127.0.0.1:8765/js/profitDonut.test.html
```

The pages run automatically and display results. Check the browser console as well: passing numeric assertions do not by themselves establish that no JavaScript exception occurred.

The app-driving suites use the real planner in an iframe and restore their previous plan storage keys afterward. Do not run them alongside real plans on the same localhost origin. They refuse to run through `file://`; the direct simulator tests do not use plan storage.

Use normal browser timing for the donut interaction suite. Deliberate invalid-input tests may produce expected number-field warnings.

## Known interpretation questions

The current inflation behavior needs a deliberate product decision:

- Base values can show today’s purchasing power while invested cards remain nominal.
- Profit uses an adjusted invested amount, so it may not equal the difference between the displayed value and invested cards.
- Selected-household bull/bear values remain nominal while the household base can be inflation-adjusted.
- The household invested chart can be adjusted while its invested card remains nominal.

Currency selection also uses preset display conversion rates; it does not recalculate the underlying investment projection or provide live exchange rates.

Characterization tests preserve current behavior. Passing those tests means behavior remains consistent, not that every financial definition or label has been approved.

## Working on this project — humans and AI assistants

Start by reading this README, then inspect the current implementation and relevant documentation.

For each task:

- Identify the affected files, callers, shared state, and startup dependencies.
- Make a scoped change with a clear intended result.
- Keep structural cleanup separate from financial-model decisions.
- Preserve valid zero values and distinguish missing or invalid inputs.
- Keep user-controlled names and labels safe when rendering dynamic HTML.
- Run relevant numeric and browser checks in isolated storage.
- Report changed files, verification results, and anything not verified.

For changes affecting shared calculations or the main controller, run the planner, retirement, and profit-donut suites. Include simulator tests when modifying the investment simulator.

Clearly distinguish implemented features, proposed designs, and open decisions. Do not introduce account systems, backend contracts, new financial formulas, or broader blueprint capabilities as incidental cleanup.

Update this README when file responsibilities, startup order, run instructions, or agreed priorities change.
