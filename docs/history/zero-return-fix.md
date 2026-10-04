# Focused per-person 0% return fix

Replace the three matching files under js/ with those in this ZIP. No HTML, CSS, formula, storage schema, or controller reorganization is included.

## Reproduced before changing application code

Tests ran against the real planner through http://127.0.0.1:8765 in headless Chrome with a newly generated temporary browser profile. This kept test localStorage separate from the normal browser and file-page planner. Each standalone suite also restores its previous plan keys.

- Main calculation: two people, personal rates 0% and 8%, global 8%, initial 1000 each, monthly 0, one year, inflation off. The 0% person incorrectly finished at 1082.9995068075098 rather than 1000.
- Retirement: age 40, initial 120000, monthly 0, personal 0%, global 8%, withdrawal rate 4%, no state pension. At age 41 the portfolio incorrectly displayed EUR129,960 rather than EUR120,000.
- Creation: global 0%; addPerson, createPersonFromData with a null personal rate, and toggleReturnRateMode recreating inputs each produced a personal rate of 8 rather than 0.
- Empty/invalid/missing personal calculation inputs already used 8%. Saving an empty input produced null in JSON. These behaviors were retained.
- Before the fix, the expanded planner suite passed 9/11 cases and retirement passed 7/8. Failures above confirmed the paths before app.js was edited.

## Exact application changes

js/app.js adds parsePersonReturnRate(value), which uses parseFloat and Number.isFinite: finite numbers (including zero) are retained; missing or non-finite input defaults to 8.

The helper replaces five `parseFloat(...) || 8` expressions:
1. createPersonFromData: copying the global rate when a saved personal rate is null/missing.
2. toggleReturnRateMode: seeding newly created personal-rate inputs from the global rate.
3. addPerson: seeding a new person's rate from the global rate.
4. calculateInvestment: reading each person's annual return for the main projection and its scenarios.
5. calculateInvestment: reading the selected person's annual return for retirement analysis.

saveCurrentToPlan already preserved a numeric zero; no saving or storage code needed modification. Existing saved-rate selection and inheritance rules are retained.

## Regression coverage and verification

- js/appCalculation.test.html: full suite PASS 11/11. Added 0% and 8% calculations, save/reload/selection, all three input-creation paths, invalid/missing input fallback, finite/non-finite parsing, and saved-null reload coverage.
- js/retirementCalculation.test.html: full suite PASS 8/8. Added displayed 0% and 8% retirement rows, withdrawal amounts and goal status, switching back to zero, saving/reloading, and invalid/missing input fallback.
- Syntax: PASS. Chrome's JavaScript parser compiled all eight application .js files and inline scripts from both characterization suites (10 scripts total) using new Function, without executing them for this syntax check.
- Browser errors: Chrome console logging captured no JavaScript SyntaxError, ReferenceError, TypeError, or uncaught exception during the suites. Expected number-field warnings occurred when tests deliberately assigned 'invalid' and 'Infinity'. Chrome also emitted an OS encryption initialization diagnostic unrelated to application JavaScript.
- The real Chart.js dependency loaded successfully. No chart stub was used.
- Appearance: no HTML/CSS changes; no separate visual screenshot review was performed.

Detailed pre-fix and final suite output is included under verification/ in this ZIP.