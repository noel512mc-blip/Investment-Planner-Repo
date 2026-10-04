function renderRetirementTable(
  initial, monthly, increaseRate, returnRate, scenarioRange,
  useInflation, inflationRate, currentAge, statePensionAge,
  withdrawalGoal, withdrawalRate, color, noStatePension,
  statePensionIncome, additionalIncomeSources
) {
  statePensionIncome    = statePensionIncome || 0;
  additionalIncomeSources = Array.isArray(additionalIncomeSources) ? additionalIncomeSources : [];

  const isDark = document.body.classList.contains('dark-mode');
  const yearsToStatePension = noStatePension ? null : (statePensionAge - currentAge);

  if (!noStatePension && (yearsToStatePension === null || yearsToStatePension <= 0)) {
    return '<p style="color:#ef4444;font-size:13px;margin-top:16px;">State Pension age must be higher than current age.</p>';
  }

  // Keep the renderer's existing income lookup for its summary and table annotations.
  function incomeAtAge(age) {
    return retirementIncomeAtAge(age, noStatePension, statePensionAge, statePensionIncome, additionalIncomeSources);
  }

  // ── SIMULATION ───────────────────────────────────────────
  const rowInputs = {
    initial,
    monthly,
    increaseRate,
    useInflation,
    inflationRate,
    currentAge,
    statePensionAge,
    withdrawalGoal,
    withdrawalRate,
    noStatePension,
    statePensionIncome,
    additionalIncomeSources,
    startYear: getStartYear()
  };

  const baseRows = calculateRetirementRows(rowInputs, returnRate);
  const bullRows = calculateRetirementRows(rowInputs, returnRate + scenarioRange);
  const bearRows = calculateRetirementRows(rowInputs, returnRate - scenarioRange);

  function firstGoalAge(rows) { const r = rows.find(r => r.goalMet); return r ? r.age : null; }
  const baseGoalAge = firstGoalAge(baseRows);
  const bullGoalAge = firstGoalAge(bullRows);
  const bearGoalAge = firstGoalAge(bearRows);

  const pensionRow     = noStatePension ? null : (baseRows.find(r => r.age === statePensionAge) || (yearsToStatePension > 0 ? baseRows[yearsToStatePension - 1] : null));
  const pensionBalance = pensionRow ? pensionRow.balance : 0;
  const pensionMonthly = pensionBalance * withdrawalRate / 100 / 12;

  const lastRelevantYear = Math.max(
    noStatePension ? 30 : (yearsToStatePension || 0),
    baseGoalAge ? baseGoalAge - currentAge + 2 : 0,
    bullGoalAge ? bullGoalAge - currentAge + 2 : 0,
    bearGoalAge ? bearGoalAge - currentAge + 2 : 0
  );
  const tableRows = baseRows.slice(0, Math.min(lastRelevantYear + 2, baseRows.length));
  _retLastTableYears = tableRows.length;

  // ── FI STATUS CLASSIFICATION ─────────────────────────────
  // leadTime > 0 means FI is reached BEFORE pension age (early FI)
  // leadTime < 0 means FI is reached AFTER pension age (needs pension support)
  const leadTime = (baseGoalAge && !noStatePension) ? statePensionAge - baseGoalAge : null;
  let statusLabel, statusColor, statusBg;
  if (!baseGoalAge) {
    statusLabel = 'Goal Not Reached';
    statusColor = '#ef4444';
    statusBg    = 'rgba(239,68,68,0.1)';
  } else if (noStatePension) {
    statusLabel = 'FI Reached';
    statusColor = isDark ? '#00d4aa' : '#2563eb';
    statusBg    = isDark ? 'rgba(0,212,170,0.12)' : 'rgba(37,99,235,0.1)';
  } else if (leadTime >= 5) {
    statusLabel = `${leadTime} Yrs Before Pension`;
    statusColor = isDark ? '#00d4aa' : '#2563eb';
    statusBg    = isDark ? 'rgba(0,212,170,0.12)' : 'rgba(37,99,235,0.1)';
  } else if (leadTime > 0) {
    statusLabel = `${leadTime} Yr${leadTime === 1 ? '' : 's'} Before Pension`;
    statusColor = '#10b981';
    statusBg    = 'rgba(16,185,129,0.1)';
  } else if (leadTime === 0) {
    statusLabel = 'At Pension Age';
    statusColor = '#10b981';
    statusBg    = 'rgba(16,185,129,0.1)';
  } else if (leadTime >= -4) {
    statusLabel = `${Math.abs(leadTime)} Yr${Math.abs(leadTime) === 1 ? '' : 's'} After Pension`;
    statusColor = '#f59e0b';
    statusBg    = 'rgba(245,158,11,0.1)';
  } else {
    statusLabel = `${Math.abs(leadTime)} Yrs After Pension`;
    statusColor = '#ef4444';
    statusBg    = 'rgba(239,68,68,0.1)';
  }

  // ── JOURNEY TIMELINE ─────────────────────────────────────
  const journeyEnd  = noStatePension
    ? (baseGoalAge || currentAge + 30)
    : Math.max(statePensionAge, baseGoalAge || statePensionAge);
  const journeySpan = Math.max(journeyEnd - currentAge, 1);
  const fiPct  = baseGoalAge ? Math.round(((baseGoalAge - currentAge) / journeySpan) * 100) : null;
  const aowPct = noStatePension ? null : Math.round(((statePensionAge - currentAge) / journeySpan) * 100);
  const fiDotColor  = isDark ? '#00d4aa' : '#2563eb';
  const aowDotColor = isDark ? '#94a3b8' : '#64748b';

  const journeyDotFI = fiPct !== null ? `
    <div style="position:absolute;left:${Math.min(fiPct,98)}%;top:50%;transform:translate(-50%,-50%);z-index:2;">
      <div style="width:12px;height:12px;border-radius:50%;background:${fiDotColor};
        box-shadow:0 0 0 3px ${isDark ? 'rgba(0,212,170,0.22)' : 'rgba(37,99,235,0.18)'},
                   0 0 0 6px ${isDark ? 'rgba(0,212,170,0.08)' : 'rgba(37,99,235,0.07)'};">
      </div>
      <div style="position:absolute;top:16px;left:50%;transform:translateX(-50%);white-space:nowrap;
        font-size:9px;font-weight:700;letter-spacing:0.04em;color:${fiDotColor};">Age ${baseGoalAge}</div>
    </div>` : '';

  const journeyDotAOW = aowPct !== null ? `
    <div style="position:absolute;left:${aowPct}%;top:50%;transform:translate(-50%,-50%);z-index:2;">
      <div style="width:10px;height:10px;border-radius:50%;background:${aowDotColor};
        border:2px dashed ${aowDotColor};opacity:0.7;">
      </div>
      <div style="position:absolute;top:14px;left:50%;transform:translateX(-50%);white-space:nowrap;
        font-size:9px;color:${aowDotColor};opacity:0.8;">Age ${statePensionAge}</div>
    </div>` : '';

  const journeyLegendFI = `
    <div style="display:flex;align-items:center;gap:5px;">
      <div style="width:8px;height:8px;border-radius:50%;background:${fiDotColor};flex-shrink:0;"></div>
      <span style="font-size:10px;color:var(--color-text-muted);">FI Age${fiPct !== null
        ? (noStatePension ? '' : ` — ${leadTime > 0 ? leadTime + ' yrs before pension' : leadTime === 0 ? 'same as pension' : Math.abs(leadTime) + ' yrs after pension'}`)
        : ' — not reached'}</span>
    </div>`;

  const journeyCardHTML = `
    <div class="ret-journey-card" style="animation-delay:220ms;">
      <div style="font-size:9px;font-weight:700;letter-spacing:0.07em;text-transform:uppercase;
        color:var(--color-text-muted);margin-bottom:14px;">FI Journey</div>
      <div style="position:relative;padding:0 8px 26px;margin-top:20px;">
        <div style="height:3px;border-radius:2px;background:var(--color-border);position:relative;overflow:visible;">
          ${fiPct !== null ? `<div style="position:absolute;left:0;top:0;height:100%;width:${Math.min(fiPct,100)}%;
            border-radius:2px;background:${fiDotColor};opacity:0.35;"></div>` : ''}
        </div>
        <div style="position:absolute;left:8px;top:-16px;font-size:9px;color:var(--color-text-muted);font-weight:600;">Today</div>
        ${journeyDotFI}
        ${journeyDotAOW}
      </div>
      <div style="display:flex;gap:14px;margin-top:6px;flex-wrap:wrap;">
        ${journeyLegendFI}
        ${!noStatePension ? `<div style="display:flex;align-items:center;gap:5px;">
          <div style="width:8px;height:8px;border-radius:50%;background:${aowDotColor};flex-shrink:0;opacity:0.7;"></div>
          <span style="font-size:10px;color:var(--color-text-muted);">State Pension (age ${statePensionAge})</span>
        </div>` : ''}
      </div>
    </div>`;

  // ── TABLE ROWS HTML (5 columns) ──────────────────────────
  const oddBg = isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.015)';
  const penStartAge = (!noStatePension && statePensionIncome > 0) ? statePensionAge : null;
  // Additional sources that start in the future (for banners)
  const addSourceStarts = additionalIncomeSources
    .filter(src => src.amount > 0 && src.startAge > currentAge)
    .map(src => src.startAge);

  const tableRowsHTML = tableRows.map((row, i) => {
    const isFI       = baseGoalAge && row.age === baseGoalAge;
    const isPen      = !noStatePension && row.age === statePensionAge;
    const isPenStart = penStartAge !== null && row.age === penStartAge;
    // Sources that start exactly on this age row
    const startingSources = additionalIncomeSources.filter(src => src.amount > 0 && src.startAge === row.age && src.startAge > currentAge);

    const activeIncome = incomeAtAge(row.age);
    const totalMonthly = row.safeMonthly + activeIncome;
    const showIncome   = activeIncome > 0;

    const penActive = (!noStatePension && statePensionIncome > 0 && row.age >= statePensionAge);
    // Active additional sources at this age
    const activeSources = additionalIncomeSources.filter(src => src.amount > 0 && row.age >= (src.startAge || 0));

    const dotGlow  = row.goalMet ? `box-shadow:0 0 0 3px ${isDark ? 'rgba(16,185,129,0.18)' : 'rgba(16,185,129,0.14)'};` : '';
    const dotBg    = row.goalMet ? '#10b981' : (isDark ? '#374151' : '#e2e8f0');
    const rowColor = isFI ? fiDotColor : (isPen ? aowDotColor : 'var(--color-text)');
    const borderStyle = isFI ? `border-left:3px solid ${fiDotColor};`
                      : (isPen && !isFI ? `border-left:3px solid ${aowDotColor};` : '');

    // Income annotations shown inside the monthly cell
    const penLine = penActive ? `<div style="font-size:10px;color:#10b981;margin-top:2px;">+${getCurrency()}${formatCurrency(statePensionIncome)} <span style="opacity:0.65;">pension</span></div>` : '';
    const srcLines = activeSources.map(src => {
      const lbl = src.label || 'other income';
      return `<div style="font-size:10px;color:#10b981;margin-top:2px;">+${getCurrency()}${formatCurrency(src.amount)} <span style="opacity:0.65;">${escapeHTML(lbl)}</span></div>`;
    }).join('');
    const totalLine = showIncome ? `<div style="font-size:10px;font-weight:600;color:#10b981;margin-top:3px;padding-top:3px;border-top:1px solid rgba(16,185,129,0.25);">= ${getCurrency()}${formatCurrency(totalMonthly)}</div>` : '';

    // Banners inserted above the income-start rows
    const penBanner = isPenStart ? `<div style="display:flex;align-items:center;gap:8px;padding:5px 14px;
      background:rgba(16,185,129,0.07);border-top:1px solid rgba(16,185,129,0.2);">
      <span style="font-size:9px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#10b981;">State Pension Starts</span>
      <span style="font-size:10px;color:var(--color-text-muted);">+${getCurrency()}${formatCurrency(statePensionIncome)}/mo from this age</span>
    </div>` : '';
    const srcBanners = startingSources.map(src => `<div style="display:flex;align-items:center;gap:8px;padding:5px 14px;
      background:rgba(16,185,129,0.07);border-top:1px solid rgba(16,185,129,0.2);">
      <span style="font-size:9px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#10b981;">${escapeHTML(src.label || 'Other Income')} Starts</span>
      <span style="font-size:10px;color:var(--color-text-muted);">+${getCurrency()}${formatCurrency(src.amount)}/mo from this age</span>
    </div>`).join('');

    return `${penBanner}${srcBanners}
      <div class="ret-table-row"
        style="grid-template-columns:0.8fr 1.1fr 1.1fr 1.1fr 0.5fr;${borderStyle}${i % 2 !== 0 ? `background:${oddBg};` : ''}animation-delay:${Math.min(i * 22, 380)}ms;"
        onmouseenter="milestoneActiveYear=${row.year};if(chart)chart.update('none');"
        onmouseleave="milestoneActiveYear=null;if(chart)chart.update('none');">
        <div style="color:${rowColor};font-weight:${isFI || isPen ? '600' : '400'};">
          ${row.age}${row.calendarYear ? `<span style="font-size:10px;color:var(--color-text-muted);margin-left:4px;">${row.calendarYear}</span>` : ''}
          ${isFI  ? `<span style="font-size:9px;color:${fiDotColor};margin-left:5px;font-weight:700;letter-spacing:0.03em;">FI</span>` : ''}
          ${isPen && !isFI ? `<span style="font-size:9px;color:${aowDotColor};margin-left:5px;font-weight:600;">Pen</span>` : ''}
        </div>
        <div style="text-align:right;color:var(--color-text-muted);font-size:11px;">${getCurrency()}${formatCurrency(row.invested)}</div>
        <div style="text-align:right;color:var(--color-text);">${getCurrency()}${formatCurrency(row.balance)}</div>
        <div style="text-align:right;">
          <div style="color:${row.goalMet && !showIncome ? '#10b981' : 'var(--color-text)'};">${getCurrency()}${formatCurrency(row.safeMonthly)}</div>
          ${penLine}${srcLines}${totalLine}
        </div>
        <div style="text-align:center;">
          <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${dotBg};${dotGlow}"></span>
        </div>
      </div>`;
  }).join('');

  // ── INCOME SOURCES KPI ───────────────────────────────────
  const incomeAtFI   = baseGoalAge ? incomeAtAge(baseGoalAge) : 0;
  const portNeedAtFI = baseGoalAge ? Math.max(0, withdrawalGoal - incomeAtFI) : withdrawalGoal;

  const incomeBreakdownRows = [];
  if (!noStatePension && statePensionIncome > 0) {
    incomeBreakdownRows.push(`
      <div style="display:flex;justify-content:space-between;align-items:center;font-size:11px;">
        <span style="color:var(--color-text-muted);">State pension (from age ${statePensionAge})</span>
        <span style="color:#10b981;font-weight:600;">+${getCurrency()}${formatCurrency(statePensionIncome)}/mo</span>
      </div>`);
  }
  for (const src of additionalIncomeSources) {
    if (src.amount > 0) {
      const fromLabel = src.startAge > 0 ? `from age ${src.startAge}` : 'always';
      const srcLabel  = src.label || 'Other income';
      incomeBreakdownRows.push(`
        <div style="display:flex;justify-content:space-between;align-items:center;font-size:11px;">
          <span style="color:var(--color-text-muted);">${escapeHTML(srcLabel)} (${fromLabel})</span>
          <span style="color:#10b981;font-weight:600;">+${getCurrency()}${formatCurrency(src.amount)}/mo</span>
        </div>`);
    }
  }

  // ── SCENARIO KPI ─────────────────────────────────────────
  const scenarioKpiHTML = showScenarios && scenarioRange > 0 ? `
    <div class="ret-kpi-item" style="animation-delay:300ms;border-style:dashed;">
      <div style="font-size:9px;font-weight:700;letter-spacing:0.07em;text-transform:uppercase;color:var(--color-text-muted);margin-bottom:8px;">FI Age — Scenarios</div>
      <div style="display:flex;flex-direction:column;gap:5px;">
        <div style="font-size:12px;display:flex;justify-content:space-between;align-items:center;">
          <span style="color:#10b981;font-weight:600;">Bull</span>
          <span style="font-weight:600;color:var(--color-text-title);">${bullGoalAge ? 'Age ' + bullGoalAge : '—'}</span>
        </div>
        <div style="font-size:12px;display:flex;justify-content:space-between;align-items:center;">
          <span style="color:var(--color-text-muted);">Base</span>
          <span style="font-weight:600;color:var(--color-text-title);">${baseGoalAge ? 'Age ' + baseGoalAge : '—'}</span>
        </div>
        <div style="font-size:12px;display:flex;justify-content:space-between;align-items:center;">
          <span style="color:#f59e0b;font-weight:600;">Bear</span>
          <span style="font-weight:600;color:var(--color-text-title);">${bearGoalAge ? 'Age ' + bearGoalAge : '—'}</span>
        </div>
      </div>
    </div>` : '';

  // ── ASSEMBLE ─────────────────────────────────────────────
  const html = `
    <div class="retirement-analytics-card">

      <!-- Header -->
      <div style="display:flex;justify-content:space-between;align-items:flex-start;
        margin-bottom:22px;padding-bottom:16px;border-bottom:1px solid var(--color-border);">
        <div>
          <div style="display:flex;align-items:center;gap:9px;margin-bottom:4px;">
            <div id="retAnalysisTitle" style="font-size:20px;font-weight:700;color:var(--color-text-title);">Retirement Analysis</div>
            ${(highlightedTarget !== null && highlightedTarget !== 'combined') ? (() => {
              const _bStatus   = retirementStatus[_retKey()] || 'needs_review';
              const _bVerified = _bStatus === 'verified' && !_retAnimating;
              const _bSkipped  = _bStatus === 'skipped';
              const _bClass    = _bVerified ? ' verified' : _bSkipped ? ' skipped' : '';
              const _bIcon     = _bVerified ? '✓' : _bSkipped ? '⏸' : '○';
              return `<span id="retVerifyBadge" class="ret-verify-badge${_bClass}"
                onmouseenter="_retShowBadgeTooltip(this)"
                onmouseleave="_retHideBadgeTooltip()">${_bIcon}</span>`;
            })() : ''}
          </div>
          <div style="font-size:13px;color:var(--color-text-muted);">
            ${noStatePension ? 'Financial independence projection — portfolio only' : 'Financial independence &amp; state pension projection'}
          </div>
        </div>
        ${!noStatePension ? `<div style="text-align:right;flex-shrink:0;margin-left:16px;">
          <div style="font-size:10px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:var(--color-text-muted);margin-bottom:4px;">State Pension Age</div>
          <div style="font-size:24px;font-weight:700;color:${color};">${statePensionAge}</div>
          <div style="font-size:11px;color:var(--color-text-muted);margin-top:2px;">${yearsToStatePension} yr${yearsToStatePension === 1 ? '' : 's'} away</div>
        </div>` : ''}
      </div>

      <!-- Body: Hero col + KPI col -->
      <div class="ret-analytics-body">

        <!-- LEFT: FI age hero + journey card -->
        <div class="ret-hero-col">
          <div class="ret-hero-card">
            <div class="ret-hero-glow" style="background:${color};"></div>
            <div class="ret-hero-content">
              <div style="font-size:9px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;
                color:${fiDotColor};margin-bottom:14px;">Financial Independence Age</div>
              <div style="display:flex;align-items:baseline;gap:8px;margin-bottom:8px;">
                <div style="font-size:18px;font-weight:500;color:var(--color-text-muted);">Age</div>
                <div style="font-size:56px;font-weight:700;color:var(--color-text-title);line-height:1;"
                  id="retHeroValue">${baseGoalAge ? '0' : '—'}</div>
              </div>
              <div style="font-size:13px;color:var(--color-text-muted);margin-bottom:18px;">
                ${!baseGoalAge
                  ? 'income target not reached in projection'
                  : noStatePension
                    ? 'portfolio alone covers your income target'
                    : (leadTime > 0
                        ? `${leadTime} year${leadTime === 1 ? '' : 's'} before state pension age`
                        : leadTime === 0
                          ? 'same year as state pension eligibility'
                          : `${Math.abs(leadTime)} year${Math.abs(leadTime) === 1 ? '' : 's'} after state pension age`)}
              </div>
              <span style="display:inline-block;padding:4px 12px;border-radius:999px;font-size:10px;
                font-weight:700;letter-spacing:0.08em;text-transform:uppercase;
                background:${statusBg};color:${statusColor};">${statusLabel}</span>
            </div>
          </div>

          ${journeyCardHTML}
        </div>

        <!-- RIGHT: KPI column -->
        <div class="ret-kpi-col">
          <div class="ret-kpi-item" style="animation-delay:80ms;">
            <div style="font-size:9px;font-weight:700;letter-spacing:0.07em;text-transform:uppercase;color:var(--color-text-muted);margin-bottom:6px;">Monthly Income Target</div>
            <div style="font-size:22px;font-weight:700;color:var(--color-text-title);">${getCurrency()}${formatCurrency(withdrawalGoal)}</div>
            <div style="font-size:11px;color:var(--color-text-muted);margin-top:3px;">desired monthly income</div>
            ${incomeBreakdownRows.length > 0 ? `
              <div style="margin-top:9px;padding-top:8px;border-top:1px solid var(--color-border);display:flex;flex-direction:column;gap:5px;">
                ${incomeBreakdownRows.join('')}
                <div style="display:flex;justify-content:space-between;align-items:center;font-size:11px;padding-top:3px;border-top:1px solid var(--color-border);">
                  <span style="color:var(--color-text-muted);font-weight:600;">Portfolio needs${baseGoalAge ? ' at FI' : ''}</span>
                  <span style="color:var(--color-text-title);font-weight:700;">${getCurrency()}${formatCurrency(portNeedAtFI)}/mo</span>
                </div>
              </div>` : ''}
          </div>
          ${!noStatePension ? `<div class="ret-kpi-item" style="animation-delay:140ms;"
            onmouseenter="milestoneActiveYear=${yearsToStatePension};if(chart)chart.update('none');"
            onmouseleave="milestoneActiveYear=null;if(chart)chart.update('none');">
            <div style="font-size:9px;font-weight:700;letter-spacing:0.07em;text-transform:uppercase;color:var(--color-text-muted);margin-bottom:6px;">Portfolio at Pension Age</div>
            <div style="font-size:18px;font-weight:700;color:var(--color-text-title);">${getCurrency()}${formatCurrency(pensionBalance)}</div>
            <div style="font-size:11px;color:var(--color-text-muted);margin-top:3px;">${getCurrency()}${formatCurrency(pensionMonthly)}/mo from portfolio</div>
          </div>` : ''}
          <div class="ret-kpi-item" style="animation-delay:200ms;">
            <div style="font-size:9px;font-weight:700;letter-spacing:0.07em;text-transform:uppercase;color:var(--color-text-muted);margin-bottom:6px;">Safe Withdrawal Rate</div>
            <div style="font-size:22px;font-weight:700;color:var(--color-text-title);">${withdrawalRate}%</div>
            <div style="font-size:11px;color:var(--color-text-muted);margin-top:3px;">per year</div>
          </div>
          ${scenarioKpiHTML}
        </div>
      </div>

      <!-- Table -->
      <div style="font-size:10px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;
        color:var(--color-text-muted);margin-bottom:10px;">Year by Year</div>
      <div class="ret-table-section">
        <div style="display:grid;grid-template-columns:0.8fr 1.1fr 1.1fr 1.1fr 0.5fr;padding:8px 14px;
          background:var(--bg-card);font-size:10px;font-weight:700;letter-spacing:0.06em;
          text-transform:uppercase;color:var(--color-text-muted);">
          <span>Age${getStartYear() ? ' / Year' : ''}</span>
          <span style="text-align:right;">Invested</span>
          <span style="text-align:right;">Portfolio</span>
          <span style="text-align:right;">Monthly Income</span>
          <span style="text-align:center;">Goal</span>
        </div>
        ${tableRowsHTML}
      </div>

    </div>`;

  // ── POST-RENDER: hero count-up + chart markers ───────────
  setTimeout(() => {
    if (baseGoalAge) {
      const heroEl = document.getElementById('retHeroValue');
      if (heroEl) {
        let start = null;
        function tick(ts) {
          if (!start) start = ts;
          const p    = Math.min((ts - start) / 1200, 1);
          const ease = 1 - Math.pow(1 - p, 3);
          heroEl.textContent = Math.round(ease * baseGoalAge);
          if (p < 1) requestAnimationFrame(tick);
          else if (window.DEBUG_ANIMATIONS) console.log('[ANIM] retirement FI age count-up complete');
        }
        requestAnimationFrame(tick);
        if (window.DEBUG_ANIMATIONS) console.log('[ANIM] retirement FI age count-up start', { target: baseGoalAge });
      }
    }
    retirementFiYear  = baseGoalAge ? baseGoalAge - currentAge : null;
    retirementAowYear = noStatePension ? null : yearsToStatePension;
    if (chart) chart.update('none');
  }, 80);

  return html;
}
