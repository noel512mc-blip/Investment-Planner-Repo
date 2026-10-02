function openPortfolioExpansion() {
  if (!portfolioSummaryData || portfolioSummaryData.people.length < 2) return;
  if (document.getElementById('portfolioExpansionModal')) return;

  const data = portfolioSummaryData;
  const total = data.total > 0 ? data.total : data.people.reduce((s, p) => s + p.balance, 0);

  const backdrop = document.createElement('div');
  backdrop.id = 'portfolioExpansionBackdrop';
  backdrop.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.52);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);z-index:400;animation:analysisFadeIn var(--anim-standard);';
  backdrop.addEventListener('click', closePortfolioExpansion);

  const modal = document.createElement('div');
  modal.id = 'portfolioExpansionModal';

  const rowsHTML = data.people.map((p, i) => {
    const pct = total > 0 ? (p.balance / total * 100).toFixed(1) : '0.0';
    const val = getCurrency() + formatNumber(Math.round(p.balance * getConversionRate()));
    return '<div class="port-exp-row" data-pidx="' + i + '" style="animation-delay:' + (i * 75 + 420) + 'ms;">'
      + '<div style="width:12px;height:12px;border-radius:50%;background:' + p.color + ';flex-shrink:0;box-shadow:0 0 0 3px ' + p.color + '28;"></div>'
      + '<div style="flex:1;min-width:0;"><div style="font-size:14px;font-weight:600;color:var(--color-text-title);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + escapeHTML(p.name) + '</div></div>'
      + '<div style="text-align:right;flex-shrink:0;"><div style="font-size:14px;font-weight:700;color:var(--color-text-title);">' + val + '</div>'
      + '<div style="font-size:11px;color:var(--color-text-muted);">' + pct + '%</div></div>'
      + '</div>';
  }).join('');

  const largest  = data.people[0];
  const smallest = data.people[data.people.length - 1];
  const lPct = total > 0 ? (largest.balance  / total * 100).toFixed(1) : '0';
  const sPct = total > 0 ? (smallest.balance / total * 100).toFixed(1) : '0';
  const insightsHTML = '<div style="margin-top:16px;padding-top:14px;border-top:1px solid var(--color-border);">'
    + '<div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:var(--color-text-muted);margin-bottom:10px;">Quick Insights</div>'
    + '<div style="display:flex;flex-direction:column;gap:7px;">'
    + '<div style="display:flex;justify-content:space-between;font-size:12px;"><span style="color:var(--color-text-muted);">Largest allocation</span><span style="font-weight:600;color:var(--color-text-title);">' + escapeHTML(largest.name) + ' · ' + lPct + '%</span></div>'
    + '<div style="display:flex;justify-content:space-between;font-size:12px;"><span style="color:var(--color-text-muted);">Smallest allocation</span><span style="font-weight:600;color:var(--color-text-title);">' + escapeHTML(smallest.name) + ' · ' + sPct + '%</span></div>'
    + '<div style="display:flex;justify-content:space-between;font-size:12px;"><span style="color:var(--color-text-muted);">Total accounts</span><span style="font-weight:600;color:var(--color-text-title);">' + data.people.length + '</span></div>'
    + '</div></div>';

  modal.innerHTML =
    '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:22px;">'
    + '<div><div style="font-size:18px;font-weight:700;color:var(--color-text-title);margin-bottom:3px;">Portfolio Composition</div>'
    + '<div style="font-size:13px;color:var(--color-text-muted);">How your wealth is distributed across accounts</div></div>'
    + '<button onclick="closePortfolioExpansion()" style="background:none;border:none;cursor:pointer;padding:6px;color:var(--color-text-muted);font-size:22px;line-height:1;border-radius:8px;display:flex;align-items:center;transition:color var(--anim-fast);" onmouseenter="this.style.color=\'var(--color-text-title)\'" onmouseleave="this.style.color=\'var(--color-text-muted)\'">×</button>'
    + '</div>'
    + '<div class="port-exp-layout">'
    + '<div class="port-exp-chart-col">'
    + '<canvas id="portfolioExpCanvas" width="400" height="400"></canvas>'
    + '<div class="port-exp-center">'
    + '<div class="port-exp-center-lbl" id="portExpLbl">Total Portfolio</div>'
    + '<div class="port-exp-center-val" id="portExpVal">' + getCurrency() + '0</div>'
    + '<div class="port-exp-center-pct" id="portExpPct"></div>'
    + '</div></div>'
    + '<div class="port-exp-list-col">'
    + '<div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--color-text-muted);margin-bottom:12px;">Portfolio Breakdown</div>'
    + rowsHTML + insightsHTML
    + '</div></div>';

  document.body.appendChild(backdrop);
  document.body.appendChild(modal);

  // Escape handler
  function portEsc(e) { if (e.key === 'Escape') { closePortfolioExpansion(); document.removeEventListener('keydown', portEsc); } }
  document.addEventListener('keydown', portEsc);

  // Build donut after modal is in DOM
  setTimeout(() => {
    const cv = document.getElementById('portfolioExpCanvas');
    if (!cv) return;

    const colors    = data.people.map(p => p.color);
    const chartData = data.people.map(p => p.balance);
    const centerLbl = document.getElementById('portExpLbl');
    const centerVal = document.getElementById('portExpVal');
    const centerPct = document.getElementById('portExpPct');

    let activePortIdx = -1;
    let portCountDone = false;
    let portHoverRaf  = null;
    let portNextIdx   = -1;
    let portExitTimer = null;
    let portAnimStart = null;

    function fmtPV(n) { return getCurrency() + formatNumber(Math.round(n * getConversionRate())); }

    function updatePortCenter(idx) {
      if (idx < 0) {
        if (centerLbl) { centerLbl.textContent = 'Total Portfolio'; centerLbl.style.color = ''; }
        if (!portCountDone) return;
        if (centerVal) { centerVal.textContent = fmtPV(total); centerVal.style.color = ''; }
        if (centerPct) { centerPct.textContent = ''; centerPct.style.color = ''; }
      } else {
        const p = data.people[idx];
        const pct = total > 0 ? (p.balance / total * 100).toFixed(1) : '0.0';
        if (centerLbl) { centerLbl.textContent = p.name; centerLbl.style.color = p.color; }
        if (centerVal) { centerVal.textContent = fmtPV(p.balance); centerVal.style.color = p.color; }
        if (centerPct) { centerPct.textContent = pct + '% of total'; centerPct.style.color = p.color; }
      }
      syncPortRows(idx);
    }

    function syncPortRows(idx) {
      document.querySelectorAll('.port-exp-row').forEach((row, i) => {
        if (idx < 0) {
          row.style.opacity = ''; row.style.transform = '';
          row.style.boxShadow = ''; row.style.borderColor = '';
        } else if (i === idx) {
          row.style.opacity = '1'; row.style.transform = 'translateX(4px)';
          row.style.boxShadow = '0 4px 16px rgba(0,0,0,0.12)';
          row.style.borderColor = data.people[idx].color;
        } else {
          row.style.opacity = '0.3'; row.style.transform = '';
          row.style.boxShadow = ''; row.style.borderColor = '';
        }
      });
    }

    function applyPortColors(idx) {
      if (!portfolioDonutChart) return;
      portfolioDonutChart.data.datasets[0].backgroundColor = colors.map((c, i) =>
        idx < 0 || i === idx ? c : hexToRgba(c, 0.14)
      );
      portfolioDonutChart.update('none');
    }

    function portCountUp(ts) {
      if (!portAnimStart) portAnimStart = ts;
      const p    = Math.min((ts - portAnimStart) / 1200, 1);
      const ease = 1 - Math.pow(1 - p, 3);
      if (activePortIdx < 0 && centerVal) centerVal.textContent = fmtPV(total * ease);
      if (p < 1) requestAnimationFrame(portCountUp);
      else portCountDone = true;
    }

    portfolioDonutChart = new Chart(cv, {
      type: 'doughnut',
      data: { labels: data.people.map(p => p.name),
              datasets: [{ data: chartData, backgroundColor: [...colors],
                borderColor: 'transparent', borderWidth: 0, hoverOffset: 18 }] },
      options: {
        cutout: '68%', responsive: false, maintainAspectRatio: false,
        layout: { padding: 20 },
        animation: { animateRotate: true, animateScale: false, duration: 1200, easing: 'easeOutCubic' },
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
        onHover: (event, elements) => {
          const idx = elements.length > 0 ? elements[0].index : -1;
          cv.style.cursor = idx >= 0 ? 'pointer' : 'default';
          if (idx >= 0) {
            if (portExitTimer) { clearTimeout(portExitTimer); portExitTimer = null; }
            portNextIdx = idx;
            if (!portHoverRaf) portHoverRaf = requestAnimationFrame(() => {
              portHoverRaf = null;
              if (portNextIdx !== activePortIdx && portNextIdx >= 0) {
                activePortIdx = portNextIdx; updatePortCenter(activePortIdx); applyPortColors(activePortIdx);
              }
            });
          } else {
            if (portHoverRaf) { cancelAnimationFrame(portHoverRaf); portHoverRaf = null; }
            if (!portExitTimer) portExitTimer = setTimeout(() => {
              portExitTimer = null;
              if (activePortIdx !== -1) {
                activePortIdx = -1; updatePortCenter(-1); applyPortColors(-1);
                if (portfolioDonutChart) { portfolioDonutChart.setActiveElements([]); portfolioDonutChart.update('none'); }
              }
            }, 130);
          }
        }
      }
    });

    requestAnimationFrame(portCountUp);

    document.querySelectorAll('.port-exp-row').forEach((row, i) => {
      row.addEventListener('mouseenter', () => {
        if (!portfolioDonutChart) return;
        activePortIdx = i; updatePortCenter(i); applyPortColors(i);
        portfolioDonutChart.setActiveElements([{ datasetIndex: 0, index: i }]);
        portfolioDonutChart.update('none');
      });
      row.addEventListener('mouseleave', () => {
        if (!portfolioDonutChart) return;
        activePortIdx = -1; updatePortCenter(-1); applyPortColors(-1);
        portfolioDonutChart.setActiveElements([]);
        portfolioDonutChart.update('none');
      });
    });
  }, 80);
}

function closePortfolioExpansion() {
  const modal    = document.getElementById('portfolioExpansionModal');
  const backdrop = document.getElementById('portfolioExpansionBackdrop');
  if (modal)    modal.classList.add('port-exp-fade-out');
  if (backdrop) backdrop.classList.add('fade-out');
  if (portfolioDonutChart) { portfolioDonutChart.destroy(); portfolioDonutChart = null; }
  setTimeout(() => { modal?.remove(); backdrop?.remove(); }, ANIM.standard);
}

let profitDonutRenderId = 0;
let profitDonutCreateTimer = null;

function clearProfitDonut() {
  profitDonutRenderId++;
  clearTimeout(profitDonutCreateTimer);
  profitDonutCreateTimer = null;
  if (profitDonutChart) { profitDonutChart.destroy(); profitDonutChart = null; }
}

function renderProfitDonut(invested, profit, totalValue, personColor, years, extras) {
  clearProfitDonut();
  const renderId = profitDonutRenderId;

  const canvas    = document.getElementById('profitDonutCanvas');
  const centerLbl = document.getElementById('profitDonutCenterLbl');
  const centerVal = document.getElementById('profitDonutCenterVal');
  const centerPct = document.getElementById('profitDonutCenterPct');
  const badge     = document.getElementById('profitStatusBadge');
  if (!canvas) return;
  const isCurrentRender = () => renderId === profitDonutRenderId
    && canvas.isConnected && document.getElementById('profitDonutCanvas') === canvas;

  const { balances = [], monthly = 0 } = extras || {};

  if (totalValue <= 0) {
    const wrap = document.getElementById('profitDonutWrap');
    if (wrap) wrap.innerHTML = '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:260px;color:var(--color-text-muted);gap:8px;text-align:center;"><div style="font-size:13px;font-weight:600;">No investment data yet</div><div style="font-size:11px;">Start contributing to see allocation.</div></div>';
    return;
  }

  // ── DERIVED ──────────────────────────────────────────────
  const isProfitNeg  = profit < 0;
  const isBreakEven  = Math.abs(profit) < 1;
  const profitLabel  = isProfitNeg ? 'Current Loss' : 'Profit';
  const investColor  = hexToRgba(personColor, 0.88);
  const profitColor  = isProfitNeg ? '#ef4444' : '#10b981';
  const absInvested  = Math.max(0, invested);
  const absProfit    = Math.abs(profit);
  const grandTotal   = absInvested + absProfit;
  const investedPct  = grandTotal > 0 ? absInvested / grandTotal * 100 : 0;
  const profitPct    = grandTotal > 0 ? absProfit   / grandTotal * 100 : 0;
  const roiPct       = absInvested > 0 ? profit / absInvested * 100 : 0;
  const cagr         = years > 0 && totalValue > 0 && absInvested > 0
                       ? (Math.pow(totalValue / absInvested, 1 / years) - 1) * 100 : 0;
  const multiple     = absInvested > 0 ? totalValue / absInvested : 0;

  // Best year (peak balance)
  let bestYear = years;
  if (balances.length > 0) {
    const maxV = Math.max(...balances);
    bestYear = balances.lastIndexOf(maxV) + 1;
  }

  const baseColors  = isBreakEven ? ['#94a3b8'] : [investColor, profitColor];
  const chartData   = isBreakEven ? [totalValue]      : [absInvested, absProfit];
  const chartLabels = isBreakEven ? ['No Profit Yet'] : ['Invested Capital', profitLabel];

  // ── BADGE ────────────────────────────────────────────────
  const badgeText  = roiPct > 100 ? '▲ STRONG GROWTH' : roiPct > 30 ? '▲ OUTPERFORMING'
                   : roiPct > 0   ? '▲ GROWING'        : roiPct < 0  ? '▼ UNDERWATER' : '◆ BREAK EVEN';
  const badgeClr   = roiPct > 0 ? '#10b981' : roiPct < 0 ? '#ef4444' : '#94a3b8';
  if (badge) {
    badge.textContent = badgeText;
    badge.style.color = badgeClr;
    badge.style.background = hexToRgba(badgeClr, 0.12);
  }

  // ── GLOW + CARD DEPTH ────────────────────────────────────
  const glowEl = document.getElementById('profitChartGlow');
  if (glowEl) glowEl.style.background = 'radial-gradient(circle, ' + hexToRgba(personColor, 0.16) + ' 0%, transparent 70%)';
  const card = document.getElementById('profitAnalyticsCard');
  if (card) card.style.background = 'radial-gradient(circle at 52% 50%, ' + hexToRgba(personColor, 0.06) + ' 0%, var(--bg-card) 58%)';

  // ── KPI COLUMN ───────────────────────────────────────────
  const kpiEl = document.getElementById('profitKpiColumn');
  if (kpiEl) {
    const kpis = [
      { label: 'Invested Capital', id: 'pkv0', color: investColor, segIdx: 0,  primary: true  },
      { label: profitLabel,        id: 'pkv1', color: profitColor, segIdx: 1,  primary: true  },
      { label: 'Total Return',     id: 'pkv2', color: 'var(--accent)', segIdx: -1, primary: false },
      { label: 'Annual Return',    id: 'pkv3', color: 'var(--accent)', segIdx: -1, primary: false },
    ];
    kpiEl.innerHTML = kpis.map((k, i) =>
      '<div class="profit-kpi-card ' + (k.primary ? 'primary' : 'secondary') + '" data-sidx="' + k.segIdx + '"'
      + ' style="animation-delay:' + (i * 90) + 'ms;border-left:3px solid ' + k.color + ';">'
      + '<div class="profit-kpi-label">' + k.label + '</div>'
      + '<div class="profit-kpi-val ' + (k.primary ? 'primary-val' : 'secondary-val') + '" id="' + k.id + '" style="color:' + k.color + ';">—</div>'
      + '</div>'
    ).join('');
  }

  // ── INSIGHTS COLUMN ──────────────────────────────────────
  const insightsEl = document.getElementById('profitInsightsColumn');
  if (insightsEl) {
    const fmtMo = monthly > 0 ? getCurrency() + formatNumber(Math.round(monthly * getConversionRate())) + '/mo' : '—';
    const rows = [
      { label: 'Portfolio Multiple', val: multiple.toFixed(2) + 'x',        delay: 520 },
      { label: 'Years Invested',     val: String(years),                      delay: 630 },
      { label: 'Peak Year',          val: getDisplayYearLabel(bestYear),      delay: 740 },
      { label: 'Contribution',       val: fmtMo,                              delay: 850 },
    ];
    insightsEl.innerHTML = rows.map(r =>
      '<div class="profit-insight-card" style="animation-delay:' + r.delay + 'ms;">'
      + '<div class="profit-insight-label">' + r.label + '</div>'
      + '<div class="profit-insight-val">' + r.val + '</div>'
      + '</div>'
    ).join('');
  }

  // ── HELPERS ──────────────────────────────────────────────
  let activeIdx    = -1;
  let animStart    = null;
  let countUpDone  = false;
  let _hoverRaf    = null;
  let _nextIdx     = -1;
  let _exitTimer   = null;
  function fmtVal(n) { return getCurrency() + formatNumber(Math.round(n * getConversionRate())); }

  function setDefaultCenter() {
    if (centerLbl) { centerLbl.textContent = 'CURRENT PORTFOLIO'; centerLbl.style.color = ''; }
    if (centerPct) { centerPct.textContent = (roiPct >= 0 ? '+' : '') + roiPct.toFixed(1) + '% ROI'; centerPct.style.color = roiPct >= 0 ? '#10b981' : '#ef4444'; }
  }

  function updateCenter(idx) {
    if (idx < 0 || isBreakEven) {
      setDefaultCenter();
      if (!countUpDone) return; // count-up still controls val
      if (centerVal) { centerVal.textContent = fmtVal(totalValue); centerVal.style.color = ''; }
    } else if (idx === 0) {
      if (centerLbl) { centerLbl.textContent = 'INVESTED CAPITAL'; centerLbl.style.color = investColor; }
      if (centerVal) { centerVal.textContent = fmtVal(absInvested); centerVal.style.color = investColor; }
      if (centerPct) { centerPct.textContent = investedPct.toFixed(1) + '% of total'; centerPct.style.color = investColor; }
    } else {
      if (centerLbl) { centerLbl.textContent = profitLabel.toUpperCase(); centerLbl.style.color = profitColor; }
      if (centerVal) { centerVal.textContent = (isProfitNeg ? '−' : '') + fmtVal(absProfit); centerVal.style.color = profitColor; }
      if (centerPct) { centerPct.textContent = profitPct.toFixed(1) + '% of total'; centerPct.style.color = profitColor; }
    }
    syncKpi(idx);
  }

  function syncKpi(idx) {
    document.querySelectorAll('.profit-kpi-card').forEach(c => {
      const sidx = Number(c.dataset.sidx);
      const vEl  = c.querySelector('.profit-kpi-val');
      if (idx < 0) {
        c.style.opacity = '1'; c.style.transform = '';
        c.style.boxShadow = ''; c.style.background = ''; c.style.borderColor = '';
        if (vEl) vEl.style.transform = '';
      } else if (sidx === idx) {
        c.style.opacity = '1'; c.style.transform = 'translateX(5px)';
        c.style.boxShadow = '0 10px 26px rgba(0,0,0,0.16)';
        c.style.background = idx === 0 ? hexToRgba(personColor, 0.12) : (isProfitNeg ? 'rgba(239,68,68,0.09)' : 'rgba(16,185,129,0.09)');
        c.style.borderColor = sidx === 0 ? investColor : profitColor;
        if (vEl) vEl.style.transform = 'scale(1.02)';
      } else {
        c.style.opacity = '0.28'; c.style.transform = '';
        c.style.boxShadow = ''; c.style.background = ''; c.style.borderColor = '';
        if (vEl) vEl.style.transform = '';
      }
    });
  }

  function applyColors(idx) {
    if (!isCurrentRender() || !profitDonutChart) return;
    profitDonutChart.data.datasets[0].backgroundColor = baseColors.map((c, i) =>
      idx < 0 || i === idx ? c : hexToRgba(i === 0 ? personColor : (isProfitNeg ? '#ef4444' : '#10b981'), 0.11)
    );
    profitDonutChart.update('none');
  }

  function countUpAll(ts) {
    if (!isCurrentRender()) return;
    if (!animStart) animStart = ts;
    const p    = Math.min((ts - animStart) / 1100, 1);
    const ease = 1 - Math.pow(1 - p, 3);
    if (activeIdx < 0 && centerVal) centerVal.textContent = fmtVal(totalValue * ease);
    const k0 = document.getElementById('pkv0'), k1 = document.getElementById('pkv1');
    const k2 = document.getElementById('pkv2'), k3 = document.getElementById('pkv3');
    if (k0) k0.textContent = fmtVal(absInvested * ease);
    if (k1) k1.textContent = (isProfitNeg ? '−' : '+') + fmtVal(absProfit * ease);
    if (k2) k2.textContent = (roiPct >= 0 ? '+' : '') + (roiPct * ease).toFixed(1) + '%';
    if (k3) k3.textContent = (cagr   >= 0 ? '+' : '') + (cagr   * ease).toFixed(1) + '%';
    if (p < 1) requestAnimationFrame(countUpAll);
    else countUpDone = true;
  }

  // ── CHART (delayed so KPI cards animate first) ───────────
  profitDonutCreateTimer = setTimeout(() => {
    if (!isCurrentRender()) return;
    profitDonutCreateTimer = null;
    const cv = canvas;
    // Also release any registered owner before reusing this exact canvas.
    Chart.getChart(cv)?.destroy();
    profitDonutChart = new Chart(cv, {
      type: 'doughnut',
      data: { labels: chartLabels, datasets: [{ data: chartData,
        backgroundColor: [...baseColors], borderColor: 'transparent', borderWidth: 0, hoverOffset: 20 }] },
      options: {
        cutout: '70%', responsive: false, maintainAspectRatio: false,
        layout: { padding: 22 },
        animation: { animateRotate: true, animateScale: false, duration: 1200, easing: 'easeOutCubic' },
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
        onHover: (event, elements) => {
          if (!isCurrentRender()) return;
          const idx = elements.length > 0 ? elements[0].index : -1;
          cv.style.cursor = idx >= 0 ? 'pointer' : 'default';
          if (idx >= 0) {
            if (_exitTimer) { clearTimeout(_exitTimer); _exitTimer = null; }
            _nextIdx = idx;
            if (!_hoverRaf) {
              _hoverRaf = requestAnimationFrame(() => {
                _hoverRaf = null;
                if (!isCurrentRender()) return;
                if (_nextIdx !== activeIdx && _nextIdx >= 0) {
                  activeIdx = _nextIdx;
                  updateCenter(activeIdx);
                  applyColors(activeIdx);
                }
              });
            }
          } else {
            if (_hoverRaf) { cancelAnimationFrame(_hoverRaf); _hoverRaf = null; }
            if (!_exitTimer) {
              _exitTimer = setTimeout(() => {
                _exitTimer = null;
                if (!isCurrentRender()) return;
                if (activeIdx !== -1) {
                  activeIdx = -1;
                  updateCenter(-1);
                  applyColors(-1);
                  if (profitDonutChart) {
                    profitDonutChart.setActiveElements([]);
                    profitDonutChart.update('none');
                  }
                }
              }, 150);
            }
          }
        }
      }
    });

    // Set default center then count up
    setDefaultCenter();
    if (centerVal) centerVal.textContent = fmtVal(0);
    requestAnimationFrame(countUpAll);

    // Badge fades in after chart finishes drawing
    setTimeout(() => { if (isCurrentRender() && badge) badge.style.opacity = '1'; }, 1300);

  }, 460);

  // ── KPI ↔ CHART SYNC ─────────────────────────────────────
  document.querySelectorAll('.profit-kpi-card[data-sidx]').forEach(c => {
    const sidx = Number(c.dataset.sidx);
    c.addEventListener('mouseenter', () => {
      if (!isCurrentRender() || !profitDonutChart || isBreakEven || sidx < 0) return;
      activeIdx = sidx; updateCenter(sidx); applyColors(sidx);
      profitDonutChart.setActiveElements([{ datasetIndex: 0, index: sidx }]);
      profitDonutChart.update('none');
    });
    c.addEventListener('mouseleave', () => {
      if (!isCurrentRender() || !profitDonutChart) return;
      activeIdx = -1; updateCenter(-1); applyColors(-1);
      profitDonutChart.setActiveElements([]);
      profitDonutChart.update('none');
    });
  });
}
