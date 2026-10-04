// Overview cards and split graphic; calculations and modal state remain in app.js.
function renderOverviewPortfolioSummary({
  personIds, combinedFinal, combinedInvested, combinedProfit, useInflation
}) {
  const _splitCardHTML = personIds.length > 1
    ? '<div class="card portfolio-split-card" title="Click to expand portfolio breakdown" onclick="openPortfolioExpansion()" style="width:72px;height:72px;flex-shrink:0;padding:8px;border-radius:12px;display:flex;align-items:center;justify-content:center;">'
      + '<div style="width:100%;height:100%;border-radius:50%;'
      + 'background:' + buildMiniPie(personIds) + ';'
      + 'box-shadow:0 0 0 2px var(--bg-panel),0 0 0 3px var(--color-border);">'
      + '</div></div>'
    : '';

  return `

    <div class="results-section">

      <h2 class="results-title">

        ${personIds.length === 1 ? 'Portfolio Summary' : "Combined Portfolio's"}

      </h2>

      <div style="display:flex;align-items:center;gap:15px;">

        <div class="results" style="flex:1;">

          <div class="card">

            <h3>${useInflation ? 'Total Value (Purchasing Power)' : 'Total Value'}</h3>

            <p>${getCurrency()}${formatCurrency(combinedFinal)}</p>

          </div>

          <div class="card">

            <h3>Total Invested</h3>

            <p>${getCurrency()}${formatCurrency(combinedInvested)}</p>

          </div>

          <div class="card">

            <h3>Total Profit</h3>

            <p>${getCurrency()}${formatCurrency(combinedProfit)}</p>

          </div>

        </div>

        ${_splitCardHTML}

      </div>

    </div>

  `;
}

function renderTopSummary(
  highlightedPersonName,
  dotHTML,
  highlightedScenarioData,
  useInflation
) {

document.getElementById('combinedResults').innerHTML = `

<div class="results-section">

  <h2 class="results-title person-result-title" style="margin-bottom:10px;">
    ${dotHTML}
    ${escapeHTML(highlightedPersonName)} Analysis
  </h2>

  <div class="results" style="display:flex;align-items:stretch;">

    <div class="card" style="flex:1;">

      <h3>
        ${
          useInflation
            ? 'Total Value (Purchasing Power)'
            : 'Total Value'
        }
      </h3>

      <p>
        ${getCurrency()}${formatCurrency(highlightedScenarioData.base)}
      </p>

    </div>

    <div class="card" style="flex:1;">

      <h3>Total Invested</h3>

      <p>
        ${getCurrency()}${formatCurrency(highlightedScenarioData.invested)}
      </p>

    </div>

    <div class="card" style="flex:1;">

      <h3>Total Profit</h3>

      <p>
        ${getCurrency()}${formatCurrency(highlightedScenarioData.profit)}
      </p>

    </div>

    <button onclick="exitAnalysisMode()" class="exit-analysis-btn" title="Exit analysis">
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
        fill="none" stroke="currentColor" stroke-width="2.5"
        stroke-linecap="round" stroke-linejoin="round">
        <line x1="18" y1="6" x2="6" y2="18"/>
        <line x1="6" y1="6" x2="18" y2="18"/>
      </svg>
      Exit Analysis
    </button>

  </div>

</div>

`;

}
