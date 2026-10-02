

// =========================
// GLOBAL VARIABLES
// =========================

let chart;
let nextPersonId = 1;
let highlightedTarget = null;
let householdMembers = [];
let analysisTab = 'profit';
let preAnalysisCollapseState = null;
let prevAnalysisTarget = null;

// ── Shared animation timing constants (mirrors CSS --anim-* tokens) ──────────
const ANIM = { fast: 200, standard: 300, focus: 500, workspace: 700 };
window.DEBUG_ANIMATIONS = false; // set true in console to log animation events

const MILESTONES = [100, 250, 500, 1000, 2500, 5000, 10000, 25000, 50000, 100000, 250000, 500000, 1000000, 2000000, 5000000];

const personColors = [
  '#3b82f6',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#8b5cf6',
  '#06b6d4',
  '#84cc16',
  '#f97316',
  '#ec4899',
  '#14b8a6'
];

let breakEvenYear = null;
let showScenarios = true;
let milestoneOverlayData = [];
let milestoneActiveYear = null;
let retirementFiYear    = null; // persistent FI chart marker (years from now, accent line)
let retirementAowYear   = null; // persistent AOW chart marker (years from now, dashed line)
// ── PER-PERSON RETIREMENT STATE ──────────────────────────────
// Explicit badge state per plan+person: 'needs_review' | 'skipped' | 'verified'
let retirementStatus = {};
// Whether blur should be sustained on the current analytics card (survives recalc innerHTML resets)
let _retBlurActive  = false;
// Which plan+person keys have already received the full entry animation (lighter revisit for rest)
let _retShownSet    = new Set();
// True during the flying-circle verification animation — prevents badge showing ✓ prematurely
let _retAnimating     = false;
let _spotResizeObserver = null;
function _updateSpotBottom() {
  const spot       = document.getElementById('retSetupSpotlight');
  const retGroup   = document.getElementById('retirementSettingsGroup');
  const spotAnchor = retGroup ? retGroup.querySelector('.highlighted-settings-subsection') : null;
  if (!spot || !retGroup || !spotAnchor) return;
  const groupRect  = retGroup.getBoundingClientRect();
  const anchorRect = spotAnchor.getBoundingClientRect();
  spot.style.bottom = `-${Math.max(18, groupRect.bottom - anchorRect.bottom + 18)}px`;
}
// True while a retirement field has focus — freezes all onboarding state changes during typing
let _retEditingActive = false;
let _retEditingTimer  = null;

// Investment Duration ("years") lock while viewing retirement analysis:
// _retYearsLockOriginal holds the pre-retirement value to restore on exit (null = not locked).
// _retLastTableYears holds the row count of the retirement table, refreshed on every render.
let _retYearsLockOriginal = null;
let _retLastTableYears    = null;

// Keeps the "years" input in sync with retirement-mode lock state. Returns true if it
// changed the field's value (caller should re-run the calculation to refresh the chart).
function _syncRetirementYearsLock() {
  const yearsEl  = document.getElementById('years');
  const labelEl  = document.getElementById('yearsLabel');
  if (!yearsEl) return false;

  const inRetirementView = highlightedTarget !== null && analysisTab === 'retirement';

  if (inRetirementView) {
    if (_retYearsLockOriginal === null) _retYearsLockOriginal = yearsEl.value;
    yearsEl.disabled = true;
    yearsEl.classList.add('ret-years-locked');
    yearsEl.title = 'Locked during retirement analysis — matches the years shown in the table below';
    if (labelEl) labelEl.classList.add('ret-years-locked');
    if (_retLastTableYears && String(yearsEl.value) !== String(_retLastTableYears)) {
      yearsEl.value = _retLastTableYears;
      return true;
    }
    return false;
  }

  if (_retYearsLockOriginal !== null) {
    yearsEl.disabled = false;
    yearsEl.classList.remove('ret-years-locked');
    yearsEl.title = '';
    if (labelEl) labelEl.classList.remove('ret-years-locked');
    yearsEl.value = _retYearsLockOriginal;
    _retYearsLockOriginal = null;
    return true;
  }
  return false;
}

// Per-person retirement settings: { [personId]: { currentAge, withdrawalGoal, ... } }
let personRetirementSettings = {};

function _retKey() {
  return `${activePlanId}__${highlightedTarget}`;
}

function _retDefaults() {
  return {
    currentAge: 30, withdrawalGoal: 5000, withdrawalRate: 4,
    statePensionEnabled: true, statePensionAge: 67, statePensionIncome: 0,
    additionalIncomeSources: [],
  };
}

// Migrate old single-source format to array format
function _migrateRetirementSettings(s) {
  if (!s) return _retDefaults();
  if (Array.isArray(s.additionalIncomeSources)) return s;
  const sources = [];
  const income = s.additionalRetirementIncome || 0;
  const age    = s.additionalIncomeAge || 0;
  if (income > 0) sources.push({ label: '', amount: income, startAge: age });
  return { ...s, additionalIncomeSources: sources };
}

function _getRetirementSettingsFromDOM() {
  const sources = [];
  document.querySelectorAll('.ret-income-card').forEach(card => {
    const amount   = parseFloat(card.querySelector('.ret-income-amount')?.value) || 0;
    const startAge = parseInt(card.querySelector('.ret-income-startage')?.value) || 0;
    const label    = card.querySelector('.ret-income-label')?.value || '';
    sources.push({ label, amount, startAge });
  });
  return {
    currentAge:             parseInt(document.getElementById('currentAge')?.value) || 30,
    withdrawalGoal:         parseFloat(document.getElementById('withdrawalGoal')?.value) || 0,
    withdrawalRate:         parseFloat(document.getElementById('withdrawalRate')?.value) || 4,
    statePensionEnabled:    document.getElementById('statePensionEnabled')?.checked ?? true,
    statePensionAge:        parseInt(document.getElementById('retirementAge')?.value) || 67,
    statePensionIncome:     parseFloat(document.getElementById('statePensionIncome')?.value) || 0,
    additionalIncomeSources: sources,
  };
}

function _setRetirementSettingsToDOM(s) {
  const d = _retDefaults();
  s = _migrateRetirementSettings(Object.assign({}, d, s || {}));
  const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = (v != null && v !== 0) ? v : ''; };
  setVal('currentAge', s.currentAge || 30);
  setVal('withdrawalGoal', s.withdrawalGoal || '');
  setVal('withdrawalRate', s.withdrawalRate || 4);
  setVal('retirementAge', s.statePensionAge || 67);
  setVal('statePensionIncome', s.statePensionIncome || '');
  const spEl = document.getElementById('statePensionEnabled');
  if (spEl) { spEl.checked = s.statePensionEnabled; onStatePensionToggleChange(true); }
  _renderAdditionalIncomeSources(s.additionalIncomeSources || []);
  _updateVerifyBtn();
}

const _incomeSourceLabels = ['Employer Pension', 'Private Pension', 'Rental Income', 'Other Income', 'Other Income'];

function _renderAdditionalIncomeSources(sources) {
  const container = document.getElementById('additionalIncomeContainer');
  if (!container) return;
  const isDark = document.body.classList.contains('dark-mode');
  container.innerHTML = '';
  (sources || []).forEach((src, i) => {
    const card = document.createElement('div');
    card.className = 'ret-income-card';
    card.dataset.index = i;
    const placeholder = _incomeSourceLabels[Math.min(i, _incomeSourceLabels.length - 1)];
    card.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <span style="font-size:9px;font-weight:700;letter-spacing:0.07em;text-transform:uppercase;
          color:var(--color-text-muted);">Income Source ${i + 1}</span>
        <button onclick="_removeIncomeSource(${i})"
          style="background:none;border:none;cursor:pointer;color:var(--color-text-muted);
          font-size:16px;line-height:1;padding:0 2px;opacity:0.6;transition:opacity var(--anim-fast);"
          onmouseenter="this.style.opacity='1'" onmouseleave="this.style.opacity='0.6'">×</button>
      </div>
      <input type="text" class="ret-income-label"
        placeholder="${placeholder}" value="${escapeHTML(src.label || '')}"
        style="width:100%;box-sizing:border-box;padding:6px 10px;border-radius:8px;
          border:1px solid var(--color-border);background:var(--bg-card);
          color:var(--color-text);font-size:12px;margin-bottom:8px;outline:none;"
        oninput="calculateInvestment();_saveCurrentPersonRetirementSettings()">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
        <div>
          <div style="font-size:10px;color:var(--color-text-muted);margin-bottom:4px;font-weight:500;">Monthly Amount</div>
          <input type="number" class="ret-income-amount" min="0"
            placeholder="0" value="${src.amount || ''}"
            style="width:100%;box-sizing:border-box;padding:6px 10px;border-radius:8px;
              border:1px solid var(--color-border);background:var(--bg-card);
              color:var(--color-text);font-size:12px;outline:none;"
            oninput="calculateInvestment();_saveCurrentPersonRetirementSettings()">
        </div>
        <div>
          <div style="font-size:10px;color:var(--color-text-muted);margin-bottom:4px;font-weight:500;">Starts at Age</div>
          <input type="number" class="ret-income-startage" min="0"
            placeholder="e.g. 65" value="${src.startAge || ''}"
            style="width:100%;box-sizing:border-box;padding:6px 10px;border-radius:8px;
              border:1px solid var(--color-border);background:var(--bg-card);
              color:var(--color-text);font-size:12px;outline:none;"
            oninput="calculateInvestment();_saveCurrentPersonRetirementSettings()">
        </div>
      </div>`;
    container.appendChild(card);
  });
  // Show/hide add button based on max
  const addBtn = document.getElementById('addIncomeSourceBtn');
  if (addBtn) addBtn.style.display = (sources || []).length >= 5 ? 'none' : 'flex';
}

function _addIncomeSource() {
  const current = _getRetirementSettingsFromDOM().additionalIncomeSources || [];
  if (current.length >= 5) return;
  current.push({ label: '', amount: 0, startAge: 0 });
  _renderAdditionalIncomeSources(current);
  requestAnimationFrame(_updateSpotBottom);
  // Focus the label field of the new card
  const cards = document.querySelectorAll('.ret-income-card');
  const lastCard = cards[cards.length - 1];
  if (lastCard) lastCard.querySelector('.ret-income-label')?.focus();
}

function _removeIncomeSource(index) {
  const card = document.querySelector(`.ret-income-card[data-index="${index}"]`);
  if (!card) return;
  card.style.transition = 'opacity 250ms, transform 250ms';
  card.style.opacity = '0';
  card.style.transform = 'translateY(-4px)';
  setTimeout(() => {
    const current = _getRetirementSettingsFromDOM().additionalIncomeSources || [];
    current.splice(index, 1);
    _renderAdditionalIncomeSources(current);
    requestAnimationFrame(_updateSpotBottom);
    calculateInvestment();
    _saveCurrentPersonRetirementSettings();
  }, 250);
}

function _saveCurrentPersonRetirementSettings() {
  if (highlightedTarget && highlightedTarget !== 'combined') {
    personRetirementSettings[highlightedTarget] = _getRetirementSettingsFromDOM();
  }
}

function _loadPersonRetirementSettings(personId) {
  if (!personId || personId === 'combined') return;
  _setRetirementSettingsToDOM(personRetirementSettings[personId] || _retDefaults());
}
function _retFieldsValid() {
  const age  = parseFloat(document.getElementById('currentAge')?.value);
  const goal = parseFloat(document.getElementById('withdrawalGoal')?.value);
  const rate = parseFloat(document.getElementById('withdrawalRate')?.value);
  if (!age || age <= 0 || !goal || goal <= 0 || !rate || rate <= 0) return false;
  const pensionEnabled = document.getElementById('statePensionEnabled')?.checked;
  if (pensionEnabled) {
    const retAge = parseFloat(document.getElementById('retirementAge')?.value);
    if (!retAge || retAge <= 0) return false;
  }
  return true;
}
function _updateVerifyBtn() {
  const btn  = document.getElementById('retVerifyBtn');
  const hint = document.getElementById('retVerifyHint');
  if (!btn) return;
  const status = retirementStatus[_retKey()] || 'needs_review';
  if (status === 'verified') {
    btn.style.display = 'none';
    if (hint) hint.style.display = 'none';
    return;
  }
  btn.style.display = '';
  const valid = _retFieldsValid();
  btn.disabled = !valid;
  btn.textContent = 'Review & Verify Settings';
  btn.classList.remove('confirmed');
  if (hint) hint.style.display = valid ? 'none' : '';
}
function _onRetVerify() {
  const btn = document.getElementById('retVerifyBtn');
  if (!btn || btn.disabled || btn.classList.contains('confirmed')) return;
  btn.textContent = '✓ Settings Confirmed';
  btn.classList.add('confirmed');
  btn.disabled = true;
  const hint = document.getElementById('retVerifyHint');
  if (hint) hint.style.display = 'none';
  setTimeout(() => {
    _retAnimating = true;
    calculateInvestment();
    setTimeout(_retPlayVerificationAnimation, 0);
  }, 500);
}
function _onRetInput(field) {
  _updateVerifyBtn();
  // No calculateInvestment() here — page is frozen during editing, will recalculate on blur
}
function updateRetirementFieldStyles() {
  if (!activePlanId || highlightedTarget === null || highlightedTarget === 'combined') return;
  ['currentAge', 'withdrawalGoal', 'retirementAge', 'withdrawalRate'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.style.color = ''; el.style.fontStyle = ''; }
  });
}
function _retFieldFocus() {
  if (_retEditingTimer) { clearTimeout(_retEditingTimer); _retEditingTimer = null; }
  _retEditingActive = true;
}

function _retFieldBlur() {
  _retEditingTimer = setTimeout(() => {
    _retEditingTimer = null;
    const focused = document.activeElement;
    const retFieldIds = ['currentAge', 'retirementAge', 'withdrawalGoal', 'withdrawalRate'];
    if (!retFieldIds.some(id => document.getElementById(id) === focused)) {
      _retEditingActive = false;
      calculateInvestment();
    }
  }, 200);
}

function _retShowBadgeTooltip(el) {
  let t = document.getElementById('retBadgeTooltip');
  if (!t) {
    t = document.createElement('div');
    t.id = 'retBadgeTooltip';
    const inner = document.createElement('div');
    inner.id = 'retBadgeTooltipContent';
    t.appendChild(inner);
    document.body.appendChild(t);
  }
  const inner = document.getElementById('retBadgeTooltipContent');
  const isVerified = el.classList.contains('verified');
  const isSkipped  = el.classList.contains('skipped');
  if (isVerified) {
    inner.innerHTML = `
      <div style="font-weight:600;color:var(--accent);margin-bottom:5px;display:flex;align-items:center;gap:5px;">
        <span>✓</span><span>Retirement Plan Verified</span>
      </div>
      <div style="color:var(--color-text-muted);font-size:11px;line-height:1.5;">All retirement assumptions have been reviewed for this person. Projections use your confirmed settings.</div>`;
  } else if (isSkipped) {
    inner.innerHTML = `
      <div style="font-weight:600;color:var(--color-text-title);margin-bottom:5px;">Retirement Settings Skipped</div>
      <div style="color:var(--color-text-muted);font-size:11px;line-height:1.5;">Retirement settings have not been reviewed. Analysis is using default assumptions.</div>`;
  } else {
    inner.innerHTML = `
      <div style="font-weight:600;color:var(--color-text-title);margin-bottom:5px;">Retirement Plan Needs Review</div>
      <div style="color:var(--color-text-muted);font-size:11px;line-height:1.5;">Some retirement assumptions haven't been reviewed yet. Complete setup for accurate projections.</div>`;
  }
  const rect = el.getBoundingClientRect();
  const w    = 230;
  let left   = rect.left + rect.width / 2 - w / 2;
  const top  = rect.bottom + 10;
  left = Math.max(8, Math.min(left, window.innerWidth - w - 8));
  t.style.left    = `${left}px`;
  t.style.top     = `${top}px`;
  t.style.opacity = '1';
}

function _retHideBadgeTooltip() {
  const t = document.getElementById('retBadgeTooltip');
  if (t) t.style.opacity = '0';
}

function _showRetInfoTooltip(el) {
  let t = document.getElementById('retInfoTooltip');
  if (!t) {
    t = document.createElement('div');
    t.id = 'retInfoTooltip';
    const inner = document.createElement('div');
    inner.id = 'retInfoTooltipContent';
    t.appendChild(inner);
    document.body.appendChild(t);
  }
  document.getElementById('retInfoTooltipContent').textContent =
    'Additional income you expect to receive during retirement that does not come from your investment portfolio — such as an employer pension, private pension, or rental income.';
  const rect = el.getBoundingClientRect();
  const w    = 220;
  let left   = rect.left + rect.width / 2 - w / 2;
  const top  = rect.bottom + 8;
  left = Math.max(8, Math.min(left, window.innerWidth - w - 8));
  t.style.left    = `${left}px`;
  t.style.top     = `${top}px`;
  t.style.opacity = '1';
}
function _hideRetInfoTooltip() {
  const t = document.getElementById('retInfoTooltip');
  if (t) t.style.opacity = '0';
}

function _cleanupRetirementSetupUI() {
  _retBlurActive    = false;
  _retAnimating     = false;
  _retEditingActive = false;
  if (_retEditingTimer) { clearTimeout(_retEditingTimer); _retEditingTimer = null; }
  _retHideBadgeTooltip();
  const flyingCircle = document.getElementById('retVerifyCircle');
  if (flyingCircle) flyingCircle.remove();
  const card    = document.getElementById('retSetupCard');
  const overlay = document.getElementById('retSetupOverlay');
  const spot    = document.getElementById('retSetupSpotlight');
  const grp     = document.getElementById('retirementSettingsGroup');
  if (card)    card.remove();
  if (overlay) overlay.remove();
  if (spot)    spot.remove();
  if (grp) {
    grp.classList.remove('ret-settings-focus-box');
    const subsection = grp.querySelector('.highlighted-settings-subsection');
    if (subsection) subsection.style.position = '';
  }
  const aCard = document.querySelector('.retirement-analytics-card');
  if (aCard) {
    aCard.style.transition    = 'none';
    aCard.style.filter        = '';
    aCard.style.opacity       = '';
    aCard.style.pointerEvents = '';
    aCard.style.boxShadow     = '';
  }
}
let personFinalBalances = {};
let profitDonutChart = null;
let portfolioDonutChart = null;
let portfolioSummaryData = null;

const breakEvenPlugin = {
  id: 'breakEvenLine',
  afterDraw(chart) {
    if (analysisTab !== 'profit' || !breakEvenYear) return;
    const isDark = document.body.classList.contains('dark-mode');
    const ctx = chart.ctx;
    const xAxis = chart.scales.x;
    const yAxis = chart.scales.y;
    if (!xAxis || !yAxis) return;
    const x = xAxis.getPixelForValue(breakEvenYear - 1);
    const label = 'Profit = Investment';
    ctx.save();
    ctx.font = '10px Arial, sans-serif';
    const tw = ctx.measureText(label).width;
    const lx = x;
    const ly = yAxis.top + 20;
    const padX = 6;
    const padY = 4;
    const boxH = 15;

    // Draw line first (behind label box)
    ctx.strokeStyle = isDark ? 'rgba(16,185,129,0.7)' : 'rgba(16,185,129,0.6)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(x, yAxis.top);
    ctx.lineTo(x, yAxis.bottom);
    ctx.stroke();
    ctx.setLineDash([]);

    // Opaque pill behind text (covers the line)
    const bgColor = isDark ? '#1e1e1e' : '#ffffff';
    const borderClr = isDark ? 'rgba(16,185,129,0.55)' : 'rgba(16,185,129,0.45)';
    ctx.fillStyle = bgColor;
    ctx.strokeStyle = borderClr;
    ctx.lineWidth = 1;
    const rx = lx - tw / 2 - padX;
    const ry = ly - boxH + padY;
    const rw = tw + padX * 2;
    const rh = boxH;
    const r = 4;
    ctx.beginPath();
    ctx.moveTo(rx + r, ry);
    ctx.lineTo(rx + rw - r, ry);
    ctx.quadraticCurveTo(rx + rw, ry, rx + rw, ry + r);
    ctx.lineTo(rx + rw, ry + rh - r);
    ctx.quadraticCurveTo(rx + rw, ry + rh, rx + rw - r, ry + rh);
    ctx.lineTo(rx + r, ry + rh);
    ctx.quadraticCurveTo(rx, ry + rh, rx, ry + rh - r);
    ctx.lineTo(rx, ry + r);
    ctx.quadraticCurveTo(rx, ry, rx + r, ry);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Text on top
    ctx.fillStyle = isDark ? 'rgba(16,185,129,0.9)' : 'rgba(16,185,129,0.8)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, lx, ry + rh / 2);
    ctx.restore();
  }
};
Chart.register(breakEvenPlugin);

// CROSSHAIR — interpolated x for smooth glide between years
let crosshairX = null;
let crosshairTargetX = null;
let crosshairVisible = false;
let crosshairRafId = null;
let dotOpacity = 0;

function crosshairTick(chartRef) {
  if (!crosshairVisible || crosshairTargetX === null) {
    crosshairX = null;
    crosshairRafId = null;
    dotOpacity = 0;
    return;
  }
  if (crosshairX === null) crosshairX = crosshairTargetX;
  const diff = crosshairTargetX - crosshairX;
  const speed = Math.abs(diff);
  crosshairX = speed < 0.4 ? crosshairTargetX : crosshairX + diff * 0.18;

  // Fade dots out fast when moving, fade in slowly when settled
  if (speed > 4) {
    dotOpacity = Math.max(0, dotOpacity - 0.22);
  } else {
    dotOpacity = Math.min(1, dotOpacity + 0.035);
  }

  chartRef.draw();

  // Keep ticking until both crosshair and dots are fully settled
  const settled = speed < 0.4 && dotOpacity >= 0.999;
  if (!settled) {
    crosshairRafId = requestAnimationFrame(() => crosshairTick(chartRef));
  } else {
    crosshairRafId = null;
  }
}

const crosshairPlugin = {
  id: 'crosshairProfit',
  afterDraw(chart) {
    if (!chart.tooltip || !chart.tooltip._active || !chart.tooltip._active.length) {
      crosshairVisible = false;
      return;
    }
    const activePoint = chart.tooltip._active[0];
    const newTargetX = activePoint.element.x;
    if (newTargetX !== crosshairTargetX) {
      crosshairTargetX = newTargetX;
      crosshairVisible = true;
      if (!crosshairRafId) {
        crosshairRafId = requestAnimationFrame(() => crosshairTick(chart));
      }
    }
    if (crosshairX === null) crosshairX = crosshairTargetX;

    const isDark = document.body.classList.contains('dark-mode');
    const ctx = chart.ctx;
    const yAxis = chart.scales.y;
    if (!yAxis) return;
    const x = crosshairX;

    ctx.save();
    ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.12)';
    ctx.lineWidth = 1;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(x, yAxis.top);
    ctx.lineTo(x, yAxis.bottom);
    ctx.stroke();

    const activeIndex = activePoint.index;
    const xScale = chart.scales.x;
    const targetPx = xScale.getPixelForValue(activeIndex);
    const totalPoints = chart.data.labels.length;

    // Pick which neighbouring year to interpolate toward based on which
    // side of the target the crosshair is currently sitting on.
    let fromIdx, toIdx, fromPx, toPx;
    if (x <= targetPx) {
      // Crosshair is left of / at target (moving right): interpolate prev→current
      fromIdx = Math.max(0, activeIndex - 1);
      toIdx   = activeIndex;
      fromPx  = xScale.getPixelForValue(fromIdx);
      toPx    = targetPx;
    } else {
      // Crosshair is right of target (moving left): interpolate current→next
      fromIdx = activeIndex;
      toIdx   = Math.min(totalPoints - 1, activeIndex + 1);
      fromPx  = targetPx;
      toPx    = xScale.getPixelForValue(toIdx);
    }
    const spanPx = toPx - fromPx;
    const t = spanPx === 0 ? 1 : Math.min(1, Math.max(0, (x - fromPx) / spanPx));

    if (dotOpacity > 0.01) {
      const activeDsIndices = new Set((chart.tooltip?.dataPoints || []).map(dp => dp.datasetIndex));
      ctx.globalAlpha = dotOpacity;
      chart.data.datasets.forEach((dataset, dsIndex) => {
        if (!activeDsIndices.has(dsIndex)) return;
        const valAtFrom = dataset.data[fromIdx] ?? dataset.data[activeIndex];
        if (valAtFrom == null) return;
        const valAtTo = dataset.data[toIdx] ?? dataset.data[activeIndex];
        const interpolatedVal = valAtFrom + (valAtTo - valAtFrom) * t;
        const y = yAxis.getPixelForValue(interpolatedVal);
        const color = typeof dataset.borderColor === 'string' ? dataset.borderColor : '#888888';
        ctx.beginPath();
        ctx.arc(x, y, 5, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.strokeStyle = isDark ? 'rgba(20,20,20,0.88)' : 'rgba(255,255,255,0.95)';
        ctx.lineWidth = 2;
        ctx.stroke();
      });
      ctx.globalAlpha = 1;
    }
    ctx.restore();

    // Keep HTML tooltip offset from the animated crosshair — runs every frame
    const tooltipEl = document.getElementById('profitTooltip');
    if (tooltipEl && parseFloat(tooltipEl.style.opacity) > 0) {
      const cw = chart.canvas.offsetWidth;
      const tw = tooltipEl.offsetWidth || 200;
      const gap = 18;
      let newLeft = x + gap;
      if (newLeft + tw > cw - 6) newLeft = x - tw - gap;
      tooltipEl.style.left = newLeft + 'px';
    }
  }
};
Chart.register(crosshairPlugin);

const milestoneOverlayPlugin = {
  id: 'milestoneOverlay',
  afterDraw(chart) {
    if (highlightedTarget === null) return;
    if (analysisTab !== 'milestones' && analysisTab !== 'retirement') return;
    const ctx = chart.ctx;
    const xAxis = chart.scales.x;
    const yAxis = chart.scales.y;
    if (!xAxis || !yAxis) return;
    const isDark = document.body.classList.contains('dark-mode');

    // Draw regular milestone markers
    if (analysisTab === 'milestones' && milestoneOverlayData.length) {
      milestoneOverlayData.forEach(({ year, label }) => {
        const x = xAxis.getPixelForValue(year - 1);
        ctx.save();
        ctx.strokeStyle = isDark ? 'rgba(245,158,11,0.45)' : 'rgba(245,158,11,0.55)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(x, yAxis.top);
        ctx.lineTo(x, yAxis.bottom);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.font = 'bold 9px Arial, sans-serif';
        const tw = ctx.measureText(label).width;
        const padX = 5;
        const boxW = tw + padX * 2;
        const boxH = 15;
        const rawBx = x - boxW / 2;
        const bx = Math.max(xAxis.left, Math.min(xAxis.right - boxW, rawBx));
        const by = yAxis.top + 4;
        const rr = 3;

        ctx.fillStyle = isDark ? '#1e1e1e' : '#ffffff';
        ctx.strokeStyle = isDark ? 'rgba(245,158,11,0.5)' : 'rgba(245,158,11,0.6)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(bx + rr, by);
        ctx.lineTo(bx + boxW - rr, by);
        ctx.quadraticCurveTo(bx + boxW, by, bx + boxW, by + rr);
        ctx.lineTo(bx + boxW, by + boxH - rr);
        ctx.quadraticCurveTo(bx + boxW, by + boxH, bx + boxW - rr, by + boxH);
        ctx.lineTo(bx + rr, by + boxH);
        ctx.quadraticCurveTo(bx, by + boxH, bx, by + boxH - rr);
        ctx.lineTo(bx, by + rr);
        ctx.quadraticCurveTo(bx, by, bx + rr, by);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = isDark ? '#f59e0b' : '#92640a';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, bx + boxW / 2, by + boxH / 2);
        ctx.restore();
      });
    }

    // Draw active milestone highlight (hovered / selected node)
    if (milestoneActiveYear !== null) {
      const x = xAxis.getPixelForValue(milestoneActiveYear - 1);
      ctx.save();
      ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.28)' : 'rgba(37,99,235,0.32)';
      ctx.lineWidth = 2;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(x, yAxis.top);
      ctx.lineTo(x, yAxis.bottom);
      ctx.stroke();
      ctx.fillStyle = isDark ? 'rgba(255,255,255,0.55)' : 'rgba(37,99,235,0.55)';
      ctx.beginPath();
      ctx.arc(x, yAxis.bottom + 4, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Retirement tab — persistent FI marker (accent, solid)
    if (retirementFiYear !== null) {
      const x = xAxis.getPixelForValue(retirementFiYear - 1);
      ctx.save();
      ctx.strokeStyle = isDark ? 'rgba(0,212,170,0.6)' : 'rgba(37,99,235,0.6)';
      ctx.lineWidth = 2;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(x, yAxis.top);
      ctx.lineTo(x, yAxis.bottom);
      ctx.stroke();
      ctx.fillStyle = isDark ? 'rgba(0,212,170,0.85)' : 'rgba(37,99,235,0.85)';
      ctx.font = '700 10px system-ui,sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('FI', x, yAxis.top - 5);
      ctx.beginPath();
      ctx.arc(x, yAxis.bottom + 5, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Retirement tab — persistent AOW marker (neutral, dashed)
    if (retirementAowYear !== null) {
      const x = xAxis.getPixelForValue(retirementAowYear - 1);
      ctx.save();
      ctx.strokeStyle = isDark ? 'rgba(148,163,184,0.45)' : 'rgba(100,116,139,0.4)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(x, yAxis.top);
      ctx.lineTo(x, yAxis.bottom);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = isDark ? 'rgba(148,163,184,0.65)' : 'rgba(100,116,139,0.65)';
      ctx.font = '10px system-ui,sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Pension', x, yAxis.top - 5);
      ctx.beginPath();
      ctx.arc(x, yAxis.bottom + 5, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
};
Chart.register(milestoneOverlayPlugin);

// =========================
// ACCOUNTS (localStorage)
// =========================

let plans = {};
let activePlanId = null;

function loadPlansFromStorage() {
  const savedPlans = readPlansFromStorage();
  plans = savedPlans.plans;
  activePlanId = savedPlans.activePlanId;
  renderPlansBar();
  renderPlansPanel();

  if (activePlanId && plans[activePlanId]) {
    // load but don't autosave immediately
    loadPlan(activePlanId);
  }
}

function savePlansToStorage() {
  writePlansToStorage(plans, activePlanId);
}

function startRename(id) {
  if (!plans[id]) return;
  const list = document.getElementById('plansList');
  if (!list) return;

  // Find the DOM item that corresponds to this plan id
  let itemEl = null;
  let idx = 0;
  for (const accId in plans) {
    if (accId === id) { itemEl = list.children[idx]; break; }
    idx++;
  }
  if (!itemEl) return;

  const left = itemEl.firstElementChild;
  const nameSpan = left.firstElementChild;
  const currentName = plans[id].name;

  const input = document.createElement('input');
  input.value = currentName;
  input.style.cssText = 'width:auto;flex:1;min-width:0;padding:2px 6px;font-size:13px;border-radius:4px;';

  const commit = () => {
    const newName = input.value.trim();
    if (newName && newName !== currentName) {
      plans[id].name = newName;
      savePlansToStorage();
      renderPlansBar();
    }
    renderPlansPanel();
  };

  input.onblur = commit;
  input.onkeydown = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
    if (e.key === 'Escape') { input.onblur = null; renderPlansPanel(); }
  };

  nameSpan.replaceWith(input);
  input.focus();
  input.select();
}

function createNewPlan() {
  if (Object.keys(plans).length >= 10) {
    alert('Maximum of 10 strategies reached.');
    return;
  }

  let suggestedName = 'Plan 1';
  const existingNames = Object.values(plans).map(a => a.name);
  let i = 1;
  while (existingNames.includes(`Plan ${i}`)) { i++; }
  suggestedName = `Plan ${i}`;

  const name = prompt('Plan name', suggestedName);
  if (!name) return;
  const id = 'acct_' + Date.now();
  // Create a fresh plan with default settings (do NOT copy current UI state)
  plans[id] = {
    name,
    people: [],
    settings: {
      years: 30,
      increaseRate: 2,
      returnRate: 8,
      perPersonReturn: false,
      useInflation: false,
      inflationRate: 2.5,
      scenarioRange: 2,
      currentAge: 30,
      retirementAge: 67,
      noStatePension: false,
      withdrawalGoal: 5000,
      withdrawalRate: 4,
      householdMembers: [],
      currency: '€',
      startYear: 0
    }
  };
  // Make it active and load it (this clears UI and gives a fresh default person)
  activePlanId = id;
  savePlansToStorage();
  renderPlansBar();
  renderPlansPanel();
  loadPlan(id);
  const toggleBtn = document.getElementById('plansToggleBtn');
  if (toggleBtn) toggleBtn.style.display = activePlanId ? 'flex' : 'none';
}

function saveCurrentToPlan(silent) {
  if (!activePlanId) {
    if (!silent) alert('No active plan. Create or select one first.');
    return;
  }

  // Persist the current person's retirement settings before saving
  _saveCurrentPersonRetirementSettings();

  // Ensure every person that was never highlighted has at least defaults saved,
  // so they never fall back to plan-level settings on the next load.
  document.querySelectorAll('.person-card').forEach(pe => {
    const pid = Number(pe.id.split('-')[1]);
    if (!personRetirementSettings[pid]) {
      personRetirementSettings[pid] = _retDefaults();
    }
  });

  const acc = { name: plans[activePlanId].name || 'Plan', people: [], settings: {} };
  const returnRateInput = parseFloat(document.getElementById('returnRate').value);
  const inflationRateInput = parseFloat(document.getElementById('inflationRate').value);
  const scenarioRangeInput = parseFloat(document.getElementById('scenarioRange')?.value);

  // collect people
  const peopleEls = document.querySelectorAll('.person-card');
  peopleEls.forEach(pe => {
    const pid = Number(pe.id.split('-')[1]);
    acc.people.push({
      id: pid,
      name: document.getElementById(`name-${pid}`)?.value || `Person ${pid}`,
      initial: parseFloat(document.getElementById(`initial-${pid}`)?.value) || 0,
      monthly: parseFloat(document.getElementById(`monthly-${pid}`)?.value) || 0,
      increaseRate: parseFloat(document.getElementById(`increaseRate-${pid}`)?.value) ?? 2,
      startOffset: parseInt(document.getElementById(`startOffset-${pid}`)?.value) || 1,
      stopOffset: parseInt(document.getElementById(`stopOffset-${pid}`)?.value) || 0,
      returnRate: parseFloat(document.getElementById(`returnRate-${pid}`)?.value) ?? null,
      retirementSettings: personRetirementSettings[pid],
    });
  });

  acc.settings = {
    // While the Investment Duration field is locked for retirement analysis, its DOM value
    // is a temporary projection length — persist the real pre-lock value instead.
    years: parseInt(_retYearsLockOriginal !== null ? _retYearsLockOriginal : document.getElementById('years').value) || 30,
    increaseRate: 2,
    returnRate: Number.isFinite(returnRateInput) ? returnRateInput : 8,
    perPersonReturn: document.getElementById('perPersonReturn')?.checked || false,
    useInflation: document.getElementById('useInflation').checked || false,
    inflationRate: Number.isFinite(inflationRateInput) ? inflationRateInput : 2.5,
    scenarioRange: Number.isFinite(scenarioRangeInput) ? scenarioRangeInput : 2,
    currentAge: parseInt(document.getElementById('currentAge')?.value) || 30,
    retirementAge: parseInt(document.getElementById('retirementAge')?.value) || 67,
    noStatePension: !(document.getElementById('statePensionEnabled')?.checked ?? true),
    withdrawalGoal: parseFloat(document.getElementById('withdrawalGoal')?.value) || 5000,
    withdrawalRate: parseFloat(document.getElementById('withdrawalRate')?.value) || 4,
    statePensionIncome: parseFloat(document.getElementById('statePensionIncome')?.value) || 0,
    householdMembers: Array.from(householdMembers),
    currency: document.getElementById('planCurrency')?.value || '€',
    startYear: parseInt(document.getElementById('planStartYear')?.value) || 0
  };

  plans[activePlanId] = acc;
  savePlansToStorage();
  if (!silent) renderPlansPanel();
}

function duplicatePlan(id) {
  if (!plans[id]) return;
  if (Object.keys(plans).length >= 10) {
    alert('Maximum of 10 strategies reached.');
    return;
  }
  const original = plans[id];
  const existingNames = Object.values(plans).map(a => a.name);
  let n = 1;
  let copyName = `${original.name} Copy 1`;
  while (existingNames.includes(copyName)) {
    n++;
    copyName = `${original.name} Copy ${n}`;
  }
  const newId = 'acct_' + Date.now();
  plans[newId] = JSON.parse(JSON.stringify(original));
  plans[newId].name = copyName;
  savePlansToStorage();
  renderPlansPanel();
}

function deletePlan(id) {
  if (!plans[id]) return;
  delete plans[id];
  if (activePlanId === id) activePlanId = null;
  savePlansToStorage();
  renderPlansPanel();
  renderPlansBar();
  updateLockState();
  const toggleBtn = document.getElementById('plansToggleBtn');
  if (toggleBtn) toggleBtn.style.display = activePlanId ? 'flex' : 'none';
}

function resetPlans() {
  // If a plan is active, reset the UI to its last saved state.
  if (activePlanId) {
    if (!confirm('Are you sure you want to reset? This will discard unsaved changes.')) return;
    // loadPlan will re-apply the saved plan data to the UI
    loadPlan(activePlanId);
    return;
  }

  // No active plan: fallback to clearing all saved plans
  if (!confirm('No active plan selected. Clear all saved plans?')) return;
  plans = {};
  activePlanId = null;
  savePlansToStorage();
  renderPlansPanel();
  renderPlansBar();
}

function saveActivePlanIfAny() {
  if (!activePlanId) return;
  saveCurrentToPlan(true);
}

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character]);
}

function sharePlan(id) {
  if (!plans[id]) return;

  saveCurrentToPlan(true);

  const plan = plans[id];
  const payload = JSON.stringify(plan);
  const encoded = btoa(unescape(encodeURIComponent(payload)));

  const url = new URL(window.location.href);
  url.search = '';
  url.searchParams.set('plan', encoded);
  const shareUrl = url.toString();

  navigator.clipboard.writeText(shareUrl).then(() => {
    const shareBtn = document.querySelector(`[data-share-id="${id}"]`);
    if (shareBtn) {
      const originalHTML = shareBtn.innerHTML;
      const originalColor = shareBtn.style.color;
      const originalBorder = shareBtn.style.borderColor;
      shareBtn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24"
          fill="none" stroke="currentColor" stroke-width="2.2"
          stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;">
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
        </svg>
        Link copied
      `;
      shareBtn.style.color = '#059669';
      shareBtn.style.borderColor = 'rgba(5,150,105,0.4)';
      setTimeout(() => {
        shareBtn.innerHTML = originalHTML;
        shareBtn.style.color = originalColor;
        shareBtn.style.borderColor = originalBorder;
      }, 2000);
    }
  }).catch(() => {
    prompt('Copy this link to share your plan:', shareUrl);
  });
}

function importSharedPlan() {
  const raw = prompt('Paste a shared plan link:');
  if (!raw) return;

  try {
    if (raw.length > MAX_SHARED_PLAN_CHARS + 4096) throw new Error('Shared plan link is too large');
    const url = new URL(raw.trim());
    const encoded = url.searchParams.get('plan');
    if (!encoded) {
      alert('No plan found in that link. Make sure you copied the full URL.');
      return;
    }

    const plan = decodeAndValidateSharedPlan(encoded);

    if (Object.keys(plans).length >= 10) {
      alert('Maximum of 10 plans reached. Delete one before importing.');
      return;
    }

    const id = 'shared_' + Date.now();
    plan.name = plan.name ? `${plan.name} (imported)` : 'Imported Plan';
    plans[id] = plan;
    activePlanId = id;
    savePlansToStorage();
    loadPlan(id);

  } catch (e) {
    alert('This shared plan link is invalid or too large. Your saved plans were not changed.');
    console.warn('Import failed:', e);
  }
}

// Personal rates may be zero; only missing or non-finite input uses 8%.
function parsePersonReturnRate(value) {
  const rate = parseFloat(value);
  return Number.isFinite(rate) ? rate : 8;
}

function createPersonFromData(data) {
  const peopleContainer = document.getElementById('peopleContainer');
  const personId = data.id;

  const personHTML = `
    <div class="person-card" id="person-${personId}" 
    style="background: ${document.body.classList.contains('dark-mode') ? hexToRgba(personColors[(personId - 1) % personColors.length], 0.28) : `color-mix(in srgb, ${personColors[(personId - 1) % personColors.length]} 12%, white)`}; 
    border-color: ${document.body.classList.contains('dark-mode') ? hexToRgba(personColors[(personId - 1) % personColors.length], 0.5) : `color-mix(in srgb, ${personColors[(personId - 1) % personColors.length]} 25%, #dbe4ee)`};"
    data-color="${personColors[(personId - 1) % personColors.length]}"
    onmouseenter="peekCard(${personId})"
    onmouseleave="unpeekCard(${personId})">

      <button
        class="delete-btn"
        onclick="removePerson(${personId})">
        ×
      </button>

      <div class="card-header">
        <button class="collapse-btn" onclick="togglePersonCardPin(${personId})"></button>
        <h3 class="person-title">Person ${personId}</h3>
        <span class="collapse-header-name"></span>
      </div>
      <div class="card-body">

      <div class="input-group">
        <label>Name</label>

        <input type="text"
               id="name-${personId}"
               value="${escapeHTML(data.name || 'Person ' + personId)}"
    oninput="calculateInvestment()">
      </div>

      <div class="input-group">
        <label>Initial Investment (€)</label>

        <input type="number"
               id="initial-${personId}"
               value="${data.initial || 0}"
oninput="calculateInvestment()">
      </div>

      <div class="input-group">
        <label>Monthly Contribution (€)</label>

         <input type="number"
           id="monthly-${personId}"
           value="${data.monthly || 0}"
           oninput="calculateInvestment()">
      </div>

      <div class="input-group">
        <label>Yearly Contribution Increase (%)</label>
        <input type="number"
               id="increaseRate-${personId}"
               value="${data.increaseRate ?? 2}"
               step="0.1"
               oninput="calculateInvestment()">
      </div>

      ${document.getElementById('perPersonReturn')?.checked ? `
      <div class="input-group" id="returnRate-group-${personId}">
        <label>Annual Return Rate (%)</label>
        <input type="number"
               id="returnRate-${personId}"
               value="${data.returnRate ?? parsePersonReturnRate(document.getElementById('returnRate')?.value)}"
               step="0.1"
               oninput="calculateInvestment()">
      </div>` : ''}

      <div class="input-group">
        <label>Start Investing (Year)</label>
        <input type="number"
               id="startOffset-${personId}"
               value="${data.startOffset ?? 1}"
               min="1"
               oninput="calculateInvestment()">
      </div>

      <div class="input-group">
        <label>Stop Contributing (Year)</label>
        <input type="number"
               id="stopOffset-${personId}"
               value="${data.stopOffset || ''}"
               min="1"
               placeholder="never"
               oninput="calculateInvestment()">
      </div>

      </div>

    </div>
  `;

  peopleContainer.insertAdjacentHTML('beforeend', personHTML);
  // keep nextPersonId correct
  nextPersonId = Math.max(nextPersonId, personId + 1);
}

function toggleAccountDropdown() {
  const existing = document.getElementById('accountDropdown');
  if (existing) {
    existing.remove();
    document.getElementById('accountDropdownBackdrop')?.remove();
    return;
  }

  const btn = document.getElementById('accountBtn');
  const rect = btn.getBoundingClientRect();
  const isDark = document.body.classList.contains('dark-mode');

  const planCurrencyVal = document.getElementById('planCurrency')?.value || '€';
  const planStartYearVal = document.getElementById('planStartYear')?.value || '0';

  const dropdown = document.createElement('div');
  dropdown.id = 'accountDropdown';
  dropdown.style.cssText = `
    position: fixed;
    top: ${rect.bottom + 10}px;
    right: ${window.innerWidth - rect.right}px;
    width: 300px;
    background: var(--bg-panel);
    border: 1px solid var(--color-border);
    border-radius: 14px;
    box-shadow: 0 8px 32px rgba(0,0,0,${isDark ? '0.5' : '0.14'});
    z-index: 500;
    overflow: hidden;
    animation: dropdownFadeIn var(--anim-fast);
  `;

  dropdown.innerHTML = `
    <div style="padding: 18px 20px 16px;">

      <!-- APPEARANCE -->
      <div style="font-size:11px;font-weight:700;color:var(--color-text-muted);
        letter-spacing:0.06em;margin-bottom:12px;">APPEARANCE</div>

      <div style="display:flex;justify-content:space-between;align-items:center;
        padding:10px 0;border-bottom:1px solid var(--color-border);">
        <div style="display:flex;align-items:center;gap:10px;">
          <div style="width:32px;height:32px;border-radius:8px;background:var(--bg-card);
            display:flex;align-items:center;justify-content:center;flex-shrink:0;">
            <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24"
              fill="none" stroke="var(--color-text-muted)" stroke-width="1.8"
              stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
            </svg>
          </div>
          <div>
            <div style="font-size:14px;color:var(--color-text-title);font-weight:500;">Dark mode</div>
            <div style="font-size:11px;color:var(--color-text-muted);">${isDark ? 'Turn on the lights' : 'Turn off the lights'}</div>
          </div>
        </div>
        <label style="position:relative;width:44px;height:24px;cursor:pointer;flex-shrink:0;">
          <input type="checkbox" id="dropdownDarkModeToggle" ${isDark ? 'checked' : ''}
            role="switch" aria-label="Dark Mode"
            style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);clip-path:inset(50%);"
            onchange="toggleDarkMode(this.checked);">
          <div id="dropdownDarkModeTrack" style="position:absolute;inset:0;border-radius:999px;
            background:${isDark ? 'var(--accent)' : '#cbd5e1'};transition:background var(--anim-standard);"></div>
          <div id="dropdownDarkModeThumb" style="position:absolute;top:3px;
            left:${isDark ? '23px' : '3px'};width:18px;height:18px;border-radius:50%;
            background:white;box-shadow:0 1px 4px rgba(0,0,0,0.18);transition:left var(--anim-standard);"></div>
        </label>
      </div>

      <!-- PLAN SETTINGS -->
      <div style="font-size:11px;font-weight:700;color:var(--color-text-muted);
        letter-spacing:0.06em;margin:16px 0 12px;">PLAN SETTINGS</div>

      <div style="display:flex;justify-content:space-between;align-items:center;
        padding:10px 0;">
        <span style="font-size:14px;color:var(--color-text-title);font-weight:500;">Currency</span>
        <select id="dropdownCurrencySelect"
          onchange="
            document.getElementById('planCurrency').value = this.value;
            calculateInvestment();
          "
          style="padding:5px 8px;border-radius:6px;border:1px solid var(--color-border);
            font-size:14px;background:var(--bg-input);color:var(--color-text);cursor:pointer;">
          <option value="€" ${planCurrencyVal === '€' ? 'selected' : ''}>€ Euro</option>
          <option value="$" ${planCurrencyVal === '$' ? 'selected' : ''}>$ Dollar</option>
          <option value="£" ${planCurrencyVal === '£' ? 'selected' : ''}>£ Pound</option>
          <option value="¥" ${planCurrencyVal === '¥' ? 'selected' : ''}>¥ Yen</option>
          <option value="₣" ${planCurrencyVal === '₣' ? 'selected' : ''}>₣ Franc</option>
        </select>
      </div>
      <p style="font-size:10px;color:#94a3b8;margin-bottom:10px;line-height:1.4;">
        Conversion is approximate. Rates based on mid-market values as of 05/2026.
      </p>

      <div style="display:flex;justify-content:space-between;align-items:center;
        padding:10px 0;border-bottom:1px solid var(--color-border);">
        <div>
          <div style="font-size:14px;color:var(--color-text-title);font-weight:500;">Starting Year</div>
          <div style="font-size:11px;color:var(--color-text-muted);margin-top:2px;">
            Leave 0 to show years as offsets
          </div>
        </div>
        <input type="number" id="dropdownStartYear"
          value="${planStartYearVal}"
          min="1900" max="2200" step="1"
          onchange="
            document.getElementById('planStartYear').value = this.value;
            calculateInvestment();
          "
          style="width:76px;padding:5px 8px;border-radius:6px;border:1px solid var(--color-border);
            font-size:14px;background:var(--bg-input);color:var(--color-text);text-align:center;">
      </div>

      <!-- ACCOUNT -->
      <div style="font-size:11px;font-weight:700;color:var(--color-text-muted);
        letter-spacing:0.06em;margin:16px 0 8px;">ACCOUNT</div>
      <div style="font-size:13px;color:var(--color-text-muted);font-style:italic;padding:4px 0;">
        Login & profile coming soon
      </div>

    </div>
  `;

  const backdrop = document.createElement('div');
  backdrop.id = 'accountDropdownBackdrop';
  backdrop.style.cssText = `
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.06);
    backdrop-filter: blur(3px);
    -webkit-backdrop-filter: blur(3px);
    z-index: 499;
  `;
  document.body.appendChild(backdrop);
  document.body.appendChild(dropdown);

  // Close on outside click (or backdrop click)
  setTimeout(() => {
    document.addEventListener('click', function closeDropdown(e) {
      const dd = document.getElementById('accountDropdown');
      const ab = document.getElementById('accountBtn');
      if (dd && !dd.contains(e.target) && ab && !ab.contains(e.target)) {
        dd.remove();
        document.getElementById('accountDropdownBackdrop')?.remove();
        document.removeEventListener('click', closeDropdown);
      }
    });
  }, 0);
}

function loadPlan(id) {
  if (!plans[id]) return;
  const acc = plans[id];
  updateLockState();

// panel stays open after loading
  highlightedTarget = null;
  hideHighlightedSettings();
  clearAnalysisFocus();

  // Switching plans abandons any in-progress retirement-view years lock
  const _yearsElForReset = document.getElementById('years');
  if (_yearsElForReset) {
    _yearsElForReset.classList.remove('ret-years-locked');
    _yearsElForReset.disabled = false;
  }
  document.getElementById('yearsLabel')?.classList.remove('ret-years-locked');
  _retYearsLockOriginal = null;
  _retLastTableYears    = null;

  // Clear per-person retirement state for the outgoing plan
  Object.keys(retirementStatus).forEach(k => {
    if (k.startsWith(`${activePlanId}__`)) delete retirementStatus[k];
  });
  _retShownSet.forEach(k => { if (k.startsWith(`${activePlanId}__`)) _retShownSet.delete(k); });
  _retBlurActive = false;
  personRetirementSettings = {};

  // remove existing people
  document.querySelectorAll('.person-card').forEach(el => el.remove());
  nextPersonId = 1;
  householdMembers = acc.settings?.householdMembers ? Array.from(acc.settings.householdMembers) : [];

  // restore per-person return rate mode BEFORE creating people so cards render correctly
  const perPersonReturn = !!acc.settings?.perPersonReturn;
  document.getElementById('perPersonReturn').checked = perPersonReturn;
  const returnRateGroup = document.getElementById('returnRateGroup');
  if (returnRateGroup) returnRateGroup.style.display = perPersonReturn ? 'none' : '';
  const perPersonReturnPill = document.getElementById('perPersonReturnPill');
  if (perPersonReturnPill) perPersonReturnPill.classList.toggle('toggle-active', perPersonReturn);

  // recreate people
  if (acc.people && acc.people.length) {
    acc.people.forEach(p => {
      createPersonFromData(p);
      // Restore per-person retirement settings.
      // New saves always have p.retirementSettings; the plan-level fallback is only for
      // very old saves that pre-date the per-person system.
      const _fallbackSettings = p.retirementSettings ? null : {
        currentAge:                 acc.settings?.currentAge || 30,
        withdrawalGoal:             acc.settings?.withdrawalGoal || 5000,
        withdrawalRate:             acc.settings?.withdrawalRate || 4,
        statePensionEnabled:        !(acc.settings?.noStatePension),
        statePensionAge:            acc.settings?.retirementAge || 67,
        statePensionIncome:         acc.settings?.statePensionIncome || 0,
        additionalRetirementIncome: acc.settings?.additionalRetirementIncome || 0,
        additionalIncomeAge:        acc.settings?.additionalIncomeAge || 0,
      };
      personRetirementSettings[p.id] = _migrateRetirementSettings(p.retirementSettings || _fallbackSettings);
    });
  } else {
    // ensure at least one person
    addPerson();
  }

  // load settings
  document.getElementById('years').value = acc.settings?.years || 30;
  const savedReturnRate = acc.settings?.returnRate;
  document.getElementById('returnRate').value = Number.isFinite(savedReturnRate) ? savedReturnRate : 8;
  document.getElementById('useInflation').checked = !!acc.settings?.useInflation;
  const savedInflationRate = acc.settings?.inflationRate;
  document.getElementById('inflationRate').value = Number.isFinite(savedInflationRate) ? savedInflationRate : 2.5;
  const savedScenarioRange = acc.settings?.scenarioRange;
  document.getElementById('scenarioRange').value = Number.isFinite(savedScenarioRange) ? savedScenarioRange : 2;
  // Seed DOM from the first person's retirement settings (milestones tab uses these)
  const _firstRetPid = acc.people?.[0]?.id;
  const _firstRet = _firstRetPid ? (personRetirementSettings[_firstRetPid] || {}) : {};
  document.getElementById('currentAge').value = _firstRet.currentAge ?? (acc.settings?.currentAge || 30);
  document.getElementById('retirementAge').value = _firstRet.statePensionAge ?? (acc.settings?.retirementAge || 67);
  if (document.getElementById('statePensionEnabled')) {
    const _spOn = _firstRet.statePensionEnabled ?? !(acc.settings?.noStatePension);
    document.getElementById('statePensionEnabled').checked = _spOn;
    onStatePensionToggleChange(true);
  }
  document.getElementById('withdrawalGoal').value = _firstRet.withdrawalGoal ?? (acc.settings?.withdrawalGoal || 5000);
  document.getElementById('withdrawalRate').value = _firstRet.withdrawalRate ?? (acc.settings?.withdrawalRate || 4);
  document.getElementById('statePensionIncome').value = _firstRet.statePensionIncome || '';
  _renderAdditionalIncomeSources(_firstRet.additionalIncomeSources || []);
  document.getElementById('planCurrency').value = acc.settings?.currency || '€';
  document.getElementById('planStartYear').value = acc.settings?.startYear || 0;
  updateCurrencyLabels();
  toggleInflationSettings();

  activePlanId = id;
  savePlansToStorage();
  renderPlansBar();
  renderPlansPanel();
  updateDeleteButtons();
  updateCurrencyLabels();
  calculateInvestment();
}

// =========================
// UTILITY FUNCTIONS
// =========================



function showValidationHint(inputId, message) {
  const input = document.getElementById(inputId);
  if (!input) return;
  const group = input.closest('.input-group');
  if (!group) return;
  let hint = group.querySelector('.validation-hint');
  if (!hint) {
    hint = document.createElement('div');
    hint.className = 'validation-hint';
    group.appendChild(hint);
  }
  hint.textContent = message;
  hint.style.display = 'block';
  input.style.borderColor = '#ef4444';
}

function clearValidationHint(inputId) {
  const input = document.getElementById(inputId);
  if (!input) return;
  const group = input.closest('.input-group');
  if (!group) return;
  const hint = group.querySelector('.validation-hint');
  if (hint) hint.style.display = 'none';
  input.style.borderColor = '';
}

function updateCurrencyLabels() {
  const c = getCurrency();
  const wl = document.getElementById('withdrawalGoalLabel');
  if (wl) wl.textContent = `Monthly Income Target (${c})`;
  const al = document.getElementById('additionalIncomeLabel');
  if (al) al.textContent = `Other Monthly Income (${c}/mo)`;
  const pl = document.getElementById('statePensionIncomeLabel');
  if (pl) pl.textContent = `Monthly State Pension (${c}/mo)`;
  document.querySelectorAll('.person-card label').forEach(label => {
    if (label.textContent.startsWith('Initial Investment')) {
      label.textContent = `Initial Investment (${c})`;
    } else if (label.textContent.startsWith('Monthly Contribution')) {
      label.textContent = `Monthly Contribution (${c})`;
    }
  });
}

// MINI PIE CHART — conic-gradient proportional to each member's balance
function buildMiniPie(memberIds) {
  if (!memberIds || memberIds.length === 0) return '#374151';
  const balances = memberIds.map(mid => personFinalBalances[mid] || 0);
  const total = balances.reduce((s, b) => s + b, 0);
  const segDeg = 360 / memberIds.length;
  let cumDeg = 0;
  const stops = memberIds.map((mid, i) => {
    const col = personColors[(mid - 1) % personColors.length];
    const deg = total > 0 ? (balances[i] / total) * 360 : segDeg;
    const stop = `${col} ${cumDeg}deg ${cumDeg + deg}deg`;
    cumDeg += deg;
    return stop;
  });
  return `conic-gradient(${stops.join(', ')})`;
}

// =========================
// UI FUNCTIONS
// =========================

function toggleInflationSettings() {

  const useInflation =
    document.getElementById('useInflation').checked;

  const inflationSettings =
    document.getElementById('inflationSettings');

  const pill =
    document.getElementById('togglePill');

  if (useInflation) {
    inflationSettings.style.maxHeight =
      (inflationSettings.scrollHeight + 4) + 'px';
    inflationSettings.style.opacity = '1';
    pill.classList.add('toggle-active');
  } else {
    inflationSettings.style.maxHeight = '0';
    inflationSettings.style.opacity = '0';
    pill.classList.remove('toggle-active');
  }
}

function toggleReturnRateMode() {
  const perPerson = document.getElementById('perPersonReturn')?.checked;
  const globalRateGroup = document.getElementById('returnRateGroup');
  const pill = document.getElementById('perPersonReturnPill');
  const currentGlobalRate = parsePersonReturnRate(document.getElementById('returnRate')?.value);

  if (globalRateGroup) globalRateGroup.style.display = perPerson ? 'none' : '';
  if (pill) pill.classList.toggle('toggle-active', perPerson);

  document.querySelectorAll('.person-card').forEach(card => {
    const pid = Number(card.id.split('-')[1]);
    const existing = document.getElementById(`returnRate-group-${pid}`);
    if (perPerson && !existing) {
      const startGroup = document.getElementById(`startOffset-${pid}`)?.closest('.input-group');
      const html = `
        <div class="input-group" id="returnRate-group-${pid}">
          <label>Annual Return Rate (%)</label>
          <input type="number" id="returnRate-${pid}" value="${currentGlobalRate}" step="0.1" oninput="calculateInvestment()">
        </div>`;
      const cardBody = card.querySelector('.card-body');
      if (startGroup) startGroup.insertAdjacentHTML('beforebegin', html);
      else if (cardBody) cardBody.insertAdjacentHTML('beforeend', html);
      else card.insertAdjacentHTML('beforeend', html);
    } else if (!perPerson && existing) {
      existing.remove();
    }
  });
}

function toggleAllCards() {
  const cards = Array.from(document.querySelectorAll('.person-card'));
  const allCollapsed = cards.every(c => c.classList.contains('collapsed'));
  cards.forEach(card => {
    const pid = Number(card.id.split('-')[1]);
    if (allCollapsed) {
      card.classList.remove('collapsed');
      card.dataset.pinned = 'open';
    } else {
      const nameInput = document.getElementById(`name-${pid}`);
      const nameDisplay = card.querySelector('.collapse-header-name');
      if (nameDisplay && nameInput) nameDisplay.textContent = nameInput.value.trim() || `Person ${pid}`;
      card.classList.add('collapsed');
      card.dataset.pinned = 'closed';
    }
  });
  const btn = document.querySelector('.people-collapse-btn');
  if (btn) btn.classList.toggle('all-collapsed', !allCollapsed);
}

function togglePersonCardPin(id) {
  const card = document.getElementById(`person-${id}`);
  if (!card) return;
  if (card.dataset.pinned === 'closed') {
    card.dataset.pinned = 'open';
    card.classList.remove('collapsed');
  } else {
    card.dataset.pinned = 'closed';
    const nameInput = document.getElementById(`name-${id}`);
    const nameDisplay = card.querySelector('.collapse-header-name');
    if (nameDisplay && nameInput) nameDisplay.textContent = nameInput.value.trim() || `Person ${id}`;
    card.classList.add('collapsed');
  }
}

function peekCard(id) {
  const card = document.getElementById(`person-${id}`);
  if (!card || card.dataset.pinned !== 'closed') return;
  card.classList.remove('collapsed');
}

function unpeekCard(id) {
  const card = document.getElementById(`person-${id}`);
  if (!card || card.dataset.pinned !== 'closed') return;
  const nameInput = document.getElementById(`name-${id}`);
  const nameDisplay = card.querySelector('.collapse-header-name');
  if (nameDisplay && nameInput) nameDisplay.textContent = nameInput.value.trim() || `Person ${id}`;
  card.classList.add('collapsed');
}

// =========================
// PERSON MANAGEMENT
// =========================


// ADD PERSON
function addPerson() {

  // MAXIMUM 10 PEOPLE
  if (document.querySelectorAll('.person-card').length >= 10) {
    alert("Maximum of 10 people reached.");
    return;
  }


  const personId = nextPersonId++;

  // Give every new person their own independent retirement settings from the start
  if (!personRetirementSettings[personId]) {
    personRetirementSettings[personId] = _retDefaults();
  }

  const peopleContainer =
    document.getElementById('peopleContainer');

  const personHTML = `
    <div class="person-card" id="person-${personId}" 
    style="background: ${document.body.classList.contains('dark-mode') ? hexToRgba(personColors[(personId - 1) % personColors.length], 0.28) : `color-mix(in srgb, ${personColors[(personId - 1) % personColors.length]} 12%, white)`}; 
    border-color: ${document.body.classList.contains('dark-mode') ? hexToRgba(personColors[(personId - 1) % personColors.length], 0.5) : `color-mix(in srgb, ${personColors[(personId - 1) % personColors.length]} 25%, #dbe4ee)`};"
    data-color="${personColors[(personId - 1) % personColors.length]}"
    onmouseenter="peekCard(${personId})"
    onmouseleave="unpeekCard(${personId})">

      <button
        class="delete-btn"
        onclick="removePerson(${personId})">
        ×
      </button>

      <div class="card-header">
        <button class="collapse-btn" onclick="togglePersonCardPin(${personId})"></button>
        <h3 class="person-title">Person ${personId}</h3>
        <span class="collapse-header-name"></span>
      </div>
      <div class="card-body">

      <div class="input-group">
        <label>Name</label>

        <input type="text"
               id="name-${personId}"
               value="Person ${personId}"
    oninput="calculateInvestment()">
      </div>

      <div class="input-group">
        <label>Initial Investment (€)</label>

        <input type="number"
               id="initial-${personId}"
               value="10000"
oninput="calculateInvestment()">
      </div>

      <div class="input-group">
        <label>Monthly Contribution (€)</label>

        <input type="number"
               id="monthly-${personId}"
               value="500"
		oninput="calculateInvestment()">
      </div>

      <div class="input-group">
        <label>Yearly Contribution Increase (%)</label>
        <input type="number"
               id="increaseRate-${personId}"
               value="2"
               step="0.1"
               oninput="calculateInvestment()">
      </div>

      ${document.getElementById('perPersonReturn')?.checked ? `
      <div class="input-group" id="returnRate-group-${personId}">
        <label>Annual Return Rate (%)</label>
        <input type="number"
               id="returnRate-${personId}"
               value="${parsePersonReturnRate(document.getElementById('returnRate')?.value)}"
               step="0.1"
               oninput="calculateInvestment()">
      </div>` : ''}

      <div class="input-group">
        <label>Start Investing (Year)</label>
        <input type="number"
               id="startOffset-${personId}"
               value="1"
               min="1"
               oninput="calculateInvestment()">
      </div>

      <div class="input-group">
        <label>Stop Contributing (Year)</label>
        <input type="number"
               id="stopOffset-${personId}"
               value=""
               min="1"
               placeholder="never"
               oninput="calculateInvestment()">
      </div>

      </div>

    </div>
  `;

  peopleContainer.insertAdjacentHTML(
    'beforeend',
    personHTML
  );

  const newCard = peopleContainer.lastElementChild;
  if (newCard) {
    newCard.style.animation = 'personCardIn 280ms cubic-bezier(0.22, 1, 0.36, 1) both';
  }

  const analyzeBtn = document.querySelector('.analysis-entry-section button');
  if (analyzeBtn) {
    analyzeBtn.style.animation = 'none';
    void analyzeBtn.offsetWidth;
    analyzeBtn.style.animation = 'analyzeGlow 700ms cubic-bezier(0.22, 1, 0.36, 1) forwards';
  }

updateDeleteButtons();
  calculateInvestment();

}

function updatePerPersonReturnVisibility() {
  const count = document.querySelectorAll('.person-card').length;
  const group = document.getElementById('perPersonReturnGroup');
  if (!group) return;
  group.style.display = count > 1 ? 'block' : 'none';
  if (count <= 1 && document.getElementById('perPersonReturn')?.checked) {
    document.getElementById('perPersonReturn').checked = false;
    toggleReturnRateMode();
  }
}

function updateDeleteButtons() {

  const people =
    document.querySelectorAll('.person-card');

  people.forEach((person, index) => {

    if (people.length <= 1) {

      person.classList.remove('can-delete');

    } else {

      person.classList.add('can-delete');

    }

    // UPDATE DISPLAY TITLE
    const newLabel = `Person ${index + 1}`;
    const title = person.querySelector('.person-title');
    if (title) title.textContent = newLabel;

    // IF THE NAME INPUT STILL HOLDS A DEFAULT "Person N" VALUE, RENUMBER IT TOO
    const pid = Number(person.id.split('-')[1]);
    const nameInput = document.getElementById(`name-${pid}`);
    if (nameInput && /^Person \d+$/.test(nameInput.value)) {
      nameInput.value = newLabel;
      // KEEP THE COLLAPSED HEADER IN SYNC
      const headerName = person.querySelector('.collapse-header-name');
      if (headerName && headerName.textContent) headerName.textContent = newLabel;
    }

  });

  updatePerPersonReturnVisibility();
}

function toggleHouseholdMember(id) {

  // REMOVE FROM HOUSEHOLD
  
  if (householdMembers.includes(id)) {

  householdMembers =
    householdMembers.filter(
      memberId => memberId !== id
    );

  // ADD TO HOUSEHOLD
  } else {

    householdMembers.push(id);

  }

  calculateInvestment();
}

// REMOVE PERSON

function removePerson(id) {

  // GET ALL CURRENT PEOPLE
  const people =
    document.querySelectorAll('.person-card');

  // PREVENT REMOVING LAST PERSON
  if (people.length <= 1) {
    return;
  }

 // REMOVE HIGHLIGHT IF NEEDED

 if (highlightedTarget == id || highlightedTarget === 'combined') {
  highlightedTarget = null;
  hideHighlightedSettings();
}

// ALWAYS REMOVE FROM HOUSEHOLD
householdMembers =
  householdMembers.filter(
    memberId => memberId != id
  ); 

  // Clean up per-person retirement state
  Object.keys(retirementStatus).forEach(k => {
    if (k.endsWith(`__${id}`)) delete retirementStatus[k];
  });

  // REMOVE PERSON
  const person =
    document.getElementById(`person-${id}`);

  if (person) {
    person.remove();
  }

// HOUSEHOLD CAN BE EMPTY - NO AUTO-FILL

  updateDeleteButtons();

  calculateInvestment();
}

// =========================
// CALCULATION FUNCTIONS
// =========================

// SIMULATION
// =========================
// RENDER FUNCTIONS
// =========================

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


// =========================
// MAIN CONTROLLER
// =========================

// =========================
// HIGHLIGHT / ANALYZE
// =========================

function setAnalysisTab(tab) {
  // When switching TO retirement tab, load the current person's settings
  if (tab === 'retirement' && highlightedTarget && highlightedTarget !== 'combined') {
    // Save any unsaved edits first, in case the user switched away and back
    // to this tab without switching person or exiting analysis mode.
    _saveCurrentPersonRetirementSettings();
    _loadPersonRetirementSettings(highlightedTarget);
  }
  analysisTab = tab;
  if (tab !== 'retirement') {
    retirementFiYear  = null;
    retirementAowYear = null;
    if (chart) chart.update('none');
    // Clean up retirement setup overlay elements when leaving the tab
    _retBlurActive = false;
    if (_spotResizeObserver) { _spotResizeObserver.disconnect(); _spotResizeObserver = null; }
    const sp      = document.getElementById('retSetupSpotlight');
    const overlay = document.getElementById('retSetupOverlay');
    const card    = document.getElementById('retSetupCard');
    if (sp)      sp.remove();
    if (overlay) overlay.remove();
    if (card)    card.remove();
    const retGroup = document.getElementById('retirementSettingsGroup');
    if (retGroup) retGroup.classList.remove('ret-settings-focus-box');
  }
  calculateInvestment();
}

function exitAnalysisMode() {
  _saveCurrentPersonRetirementSettings();
  if (profitDonutChart) { profitDonutChart.destroy(); profitDonutChart = null; }
  _cleanupRetirementSetupUI();
  highlightedTarget = null;
  clearAnalysisFocus();
  calculateInvestment();
}

function highlightTarget(target) {
  // Save outgoing person's retirement settings before switching
  _saveCurrentPersonRetirementSettings();

  // TOGGLE OFF IF CLICKING SAME TARGET
  if (highlightedTarget === target) {
    highlightedTarget = null;
  } else {
    highlightedTarget = target;
  }

  // Load incoming person's retirement settings into DOM unconditionally —
  // the fields are hidden when not on the retirement tab so loading them early is harmless,
  // but it guarantees the DOM is in sync before setAnalysisTab('retirement') fires.
  _loadPersonRetirementSettings(highlightedTarget);

  calculateInvestment();
}

function showHighlightedSettings() {
  document.getElementById('highlightedSettingsPanel').style.display = 'block';
  updateRetirementSettingsVisibility();
  updateScenarioRangeVisibility();
}

function hideHighlightedSettings() {
  document.getElementById('highlightedSettingsPanel').style.display = 'none';
}

function onStatePensionToggleChange(silent) {
  const cb     = document.getElementById('statePensionEnabled');
  const pill   = document.getElementById('statePensionPill');
  const grp    = document.getElementById('statePensionAgeGroup');
  const incGrp = document.getElementById('statePensionIncomeGroup');
  if (!cb) return;
  if (pill)   pill.classList.toggle('toggle-active', cb.checked);
  if (grp)    grp.style.display    = cb.checked ? '' : 'none';
  if (incGrp) incGrp.style.display = cb.checked ? '' : 'none';
  if (!silent) {
    // Toggle is an instant action, not "editing" — clear any active edit guard
    if (_retEditingActive) {
      _retEditingActive = false;
      if (_retEditingTimer) { clearTimeout(_retEditingTimer); _retEditingTimer = null; }
    }
    _updateVerifyBtn();
    calculateInvestment();
  }
}

function reviewRetirementSettings() {
  const retGroup = document.getElementById('retirementSettingsGroup');
  if (retGroup) retGroup.scrollIntoView({ behavior: 'smooth', block: 'center' });

  // Pulse the spotlight
  const spot = document.getElementById('retSetupSpotlight');
  if (spot) {
    spot.style.animation = 'none';
    requestAnimationFrame(() => {
      spot.style.animation = 'retSpotPulse 0.65s cubic-bezier(0.22, 1, 0.36, 1)';
      setTimeout(() => { if (spot) spot.style.animation = ''; }, 750);
    });
  }

  // Focus the first empty required field (after scroll settles)
  const fields = [
    { id: 'currentAge' },
    { id: 'withdrawalGoal' },
    { id: 'retirementAge', skip: () => !(document.getElementById('statePensionEnabled')?.checked) },
    { id: 'withdrawalRate' },
  ];
  for (const f of fields) {
    if (f.skip && f.skip()) continue;
    const el = document.getElementById(f.id);
    if (el && (!el.value || parseFloat(el.value) <= 0)) {
      setTimeout(() => { el.focus(); el.select(); }, 420);
      break;
    }
  }
}

function _retPlayVerificationAnimation() {
  const spotEl   = document.getElementById('retSetupSpotlight');
  const retGroup = document.getElementById('retirementSettingsGroup');
  const badge    = document.getElementById('retVerifyBadge');

  if (!badge) {
    dismissRetirementSetup(false);
    return;
  }

  const isDark      = document.body.classList.contains('dark-mode');
  const accentColor = isDark ? '#00d4aa' : '#2563eb';

  // Source: center of spotlight; Target: center of badge (now in the analysis header)
  const spotRect  = spotEl ? spotEl.getBoundingClientRect() : (retGroup ? retGroup.getBoundingClientRect() : null);
  const badgeRect = badge.getBoundingClientRect();
  const srcX = spotRect ? spotRect.left + spotRect.width  / 2 : badgeRect.left;
  const srcY = spotRect ? spotRect.top  + spotRect.height / 2 : badgeRect.top;
  const tgtX = badgeRect.left + badgeRect.width  / 2;
  const tgtY = badgeRect.top  + badgeRect.height / 2;

  // ── Step 1: Freeze spotlight 250ms — let user register "setup complete"
  if (spotEl) {
    spotEl.style.transition = 'none';
    spotEl.style.boxShadow  = `0 0 0 3.5px ${accentColor}, 0 0 40px 14px ${accentColor}55`;
  }

  setTimeout(() => {
    // ── Step 2: Spotlight begins collapsing (550ms — deliberate, visible)
    if (spotEl) {
      spotEl.style.transition = `transform 550ms cubic-bezier(0.22,1,0.36,1), opacity 550ms ease`;
      spotEl.style.transform  = 'scale(0.04)';
      spotEl.style.opacity    = '0';
    }

    // ── Step 3: Circle launches 80ms after collapse starts (slightly staggered)
    setTimeout(() => {
      const flyMs = 820;

      // Glow trail — blurred ghost that lags 90ms behind, fades as circle arrives
      const trail = document.createElement('div');
      trail.style.cssText = `
        position:fixed; width:22px; height:22px; border-radius:50%;
        background:${accentColor}88; filter:blur(7px);
        left:${srcX - 11}px; top:${srcY - 11}px;
        z-index:9998; pointer-events:none; opacity:0.7;`;
      document.body.appendChild(trail);

      // Main circle
      const circle = document.createElement('div');
      circle.id = 'retVerifyCircle';
      circle.style.cssText = `
        position:fixed; width:18px; height:18px; border-radius:50%;
        background:${accentColor};
        box-shadow: 0 0 0 3px ${accentColor}33, 0 0 16px 6px ${accentColor}55;
        left:${srcX - 9}px; top:${srcY - 9}px;
        z-index:9999; pointer-events:none; opacity:1;`;
      document.body.appendChild(circle);

      requestAnimationFrame(() => {
        // Circle: fast spring curve
        circle.style.transition = [
          `left    ${flyMs}ms cubic-bezier(0.22,1,0.36,1)`,
          `top     ${flyMs}ms cubic-bezier(0.22,1,0.36,1)`,
          `transform ${flyMs}ms cubic-bezier(0.22,1,0.36,1)`,
          `opacity 130ms ease ${flyMs - 100}ms`,
        ].join(',');
        circle.style.left      = `${tgtX - 9}px`;
        circle.style.top       = `${tgtY - 9}px`;
        circle.style.transform = 'scale(0.2)';
        circle.style.opacity   = '0';

        // Trail: same destination but 90ms delayed start + slightly longer (lags behind)
        setTimeout(() => {
          trail.style.transition = [
            `left    ${flyMs + 90}ms cubic-bezier(0.22,1,0.36,1)`,
            `top     ${flyMs + 90}ms cubic-bezier(0.22,1,0.36,1)`,
            `opacity 180ms ease ${flyMs - 160}ms`,
          ].join(',');
          trail.style.left    = `${tgtX - 11}px`;
          trail.style.top     = `${tgtY - 11}px`;
          trail.style.opacity = '0';
        }, 90);
      });

      setTimeout(() => trail.remove(), flyMs + 320);

      // ── Step 4/5: Circle lands — badge bounce + checkmark (250ms each)
      setTimeout(() => {
        circle.remove();
        _retAnimating = false;

        // Badge: pop + checkmark appear
        badge.textContent = '✓';
        badge.className   = 'ret-verify-badge verified ret-badge-pop';
        setTimeout(() => badge.classList.remove('ret-badge-pop'), 550);

        // Title gives a tiny confirming nudge — connects badge to heading
        const titleEl = document.getElementById('retAnalysisTitle');
        if (titleEl) {
          titleEl.style.transition = `transform 220ms cubic-bezier(0.22,1,0.36,1)`;
          titleEl.style.transform  = 'translateY(-1px) scale(1.012)';
          setTimeout(() => {
            titleEl.style.transform = '';
            setTimeout(() => { titleEl.style.transition = ''; }, 220);
          }, 200);
        }

        // ── Step 6: Workspace unlock 150ms after badge lands (blur fades 400ms)
        setTimeout(() => {
          dismissRetirementSetup(false);

          // FI hero card pulses after page sharpens
          setTimeout(() => {
            const heroCard = document.querySelector('.ret-hero-card');
            if (heroCard) {
              heroCard.classList.add('ret-hero-pulse');
              setTimeout(() => heroCard.classList.remove('ret-hero-pulse'), 900);
            }
          }, 420);
        }, 150);

      }, flyMs + 60);

    }, 80); // circle launches 80ms after collapse starts

  }, 250); // initial pause
}

function checkRetirementSetupOverlay() {
  // Guard 1: never interrupt a running verification animation
  if (_retAnimating) return;

  // Guard 2: while user is actively typing in a retirement field, freeze all onboarding state
  // changes — only re-apply blur so the new DOM element (rebuilt by innerHTML) stays blurred
  if (_retEditingActive) {
    if (_retBlurActive) {
      const _ac = document.querySelector('.retirement-analytics-card');
      if (_ac) {
        _ac.style.transition    = 'none';
        _ac.style.filter        = 'blur(2px)';
        _ac.style.opacity       = '0.55';
        _ac.style.pointerEvents = 'none';
        _ac.style.boxShadow     = 'inset 0 0 0 2000px rgba(0,0,0,0.03)';
      }
    }
    return;
  }

  // Only show for individual person analysis, not combined household
  if (!activePlanId || highlightedTarget === null || highlightedTarget === 'combined') {
    _cleanupRetirementSetupUI();
    return;
  }
  // Already verified or skipped — don't show onboarding again
  const _rstKey = _retKey();
  const _rstStatus = retirementStatus[_rstKey] || 'needs_review';
  if (_rstStatus === 'verified' || _rstStatus === 'skipped') {
    _cleanupRetirementSetupUI();
    _updateVerifyBtn();
    return;
  }

  const retGroup  = document.getElementById('retirementSettingsGroup');
  const cardSlot  = document.getElementById('retSetupCardSlot');
  const resultsEl = document.getElementById('personResults');
  if (!retGroup || !cardSlot) return;

  const key         = _retKey();
  const isFirstShow = !_retShownSet.has(key);

  // ── 1. Analytics card blur (anti-flicker: use _retBlurActive to sustain state across innerHTML resets)
  const analyticsCard = resultsEl ? resultsEl.querySelector('.retirement-analytics-card') : null;
  if (analyticsCard) {
    if (!_retBlurActive) {
      // First time for this person in this session — animate in
      _retBlurActive = true;
      analyticsCard.style.transition = `filter var(--anim-focus) var(--ease-premium),
        opacity var(--anim-focus) var(--ease-premium)`;
      requestAnimationFrame(() => {
        analyticsCard.style.filter        = 'blur(2px)';
        analyticsCard.style.opacity       = '0.55';
        analyticsCard.style.pointerEvents = 'none';
        analyticsCard.style.boxShadow     = 'inset 0 0 0 2000px rgba(0,0,0,0.03)';
      });
    } else {
      // Recalc created a new DOM element — reapply immediately, no animation (prevents flicker)
      analyticsCard.style.transition    = 'none';
      analyticsCard.style.filter        = 'blur(2px)';
      analyticsCard.style.opacity       = '0.55';
      analyticsCard.style.pointerEvents = 'none';
      analyticsCard.style.boxShadow     = 'inset 0 0 0 2000px rgba(0,0,0,0.03)';
    }
  }

  // ── 2. Spotlight — anchored to .highlighted-settings-subsection so top is tight above the title
  if (!document.getElementById('retSetupSpotlight')) {
    const spotAnchor = retGroup.querySelector('.highlighted-settings-subsection') || retGroup;
    spotAnchor.style.position = 'relative';
    retGroup.classList.add('ret-settings-focus-box');
    const spot = document.createElement('div');
    spot.id = 'retSetupSpotlight';
    spotAnchor.appendChild(spot);

    // Initial size
    requestAnimationFrame(() => {
      _updateSpotBottom();
      if (isFirstShow) {
        requestAnimationFrame(() => { spot.style.opacity = '1'; });
      } else {
        spot.style.transition = 'none';
        spot.style.opacity    = '1';
      }
    });

    // Keep bottom in sync as income cards are added / removed
    if (_spotResizeObserver) _spotResizeObserver.disconnect();
    _spotResizeObserver = new ResizeObserver(_updateSpotBottom);
    _spotResizeObserver.observe(retGroup);
  }

  // ── 3. Guidance card (persists in stable slot — never wiped by personResults innerHTML resets)
  if (!document.getElementById('retSetupCard')) {
    const card = document.createElement('div');
    card.id = 'retSetupCard';
    card.innerHTML = `
      <div style="font-size:9px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;
        color:var(--accent);margin-bottom:10px;">Retirement Setup</div>
      <div style="font-size:14px;font-weight:700;color:var(--color-text-title);margin-bottom:5px;line-height:1.35;">
        Review your retirement assumptions
      </div>
      <div style="font-size:12px;color:var(--color-text-muted);margin-bottom:14px;line-height:1.55;">
        Fill in the required settings on the left — projections update automatically as you type.
      </div>
      <div style="display:flex;justify-content:center;">
        <button onclick="dismissRetirementSetup(false,'skip')" style="
          padding:8px 24px;border-radius:10px;
          border:1.5px solid var(--color-border);
          background:transparent;color:var(--color-text-muted);font-size:12px;
          cursor:pointer;transition:background var(--anim-fast),color var(--anim-fast);"
          onmouseenter="this.style.background='var(--bg-card)';this.style.color='var(--color-text)'"
          onmouseleave="this.style.background='transparent';this.style.color='var(--color-text-muted)'">
          Skip for Now
        </button>
      </div>`;
    cardSlot.appendChild(card);
    if (isFirstShow) {
      // Full sequence: blur fires first (step 1 above), then spotlight (step 2), then card slides in
      requestAnimationFrame(() => requestAnimationFrame(() => card.classList.add('visible')));
    } else {
      // Revisit: opacity only, no movement
      card.style.transform = 'translateX(-50%) translateY(0) scale(1)';
      requestAnimationFrame(() => requestAnimationFrame(() => card.classList.add('visible-light')));
    }

    // First-show only: scroll settings into view so the spotlighted section is fully visible
    if (isFirstShow) {
      _retShownSet.add(key);
      setTimeout(() => {
        retGroup.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 300); // after blur + spotlight have started
    }
  }

  updateRetirementFieldStyles();
  _updateVerifyBtn();
}

// reason: 'verify' (animation path) | 'skip' (Skip for Now button)
function dismissRetirementSetup(scrollToSettings, reason) {
  reason = reason || 'verify';
  _retBlurActive = false;
  _retAnimating  = false; // Cancel any pending animation state (e.g. user hit Skip while animation was pending)

  // Persist the explicit badge state for this person
  const _key = _retKey();
  retirementStatus[_key] = reason === 'skip' ? 'skipped' : 'verified';

  const card        = document.getElementById('retSetupCard');
  const spotlight   = document.getElementById('retSetupSpotlight');
  const retGroup    = document.getElementById('retirementSettingsGroup');
  const analyticsCard = document.querySelector('.retirement-analytics-card');

  // Step 1 — success/skip state in card, then fade out
  if (card) {
    const isDark  = document.body.classList.contains('dark-mode');
    const accentC = isDark ? '#00d4aa' : '#10b981';
    if (reason === 'skip') {
      card.innerHTML = `
        <div style="display:flex;align-items:center;gap:12px;padding:2px 0;">
          <div style="font-size:22px;color:var(--color-text-muted);line-height:1;flex-shrink:0;opacity:0.65;">⏸</div>
          <div>
            <div style="font-size:13px;font-weight:600;color:var(--color-text-title);">Setup skipped</div>
            <div style="font-size:11px;color:var(--color-text-muted);margin-top:2px;">Projections are using default assumptions.</div>
          </div>
        </div>`;
    } else {
      card.innerHTML = `
        <div style="display:flex;align-items:center;gap:12px;padding:2px 0;">
          <div class="ret-setup-check" style="font-size:26px;color:${accentC};line-height:1;flex-shrink:0;">✓</div>
          <div>
            <div style="font-size:13px;font-weight:600;color:var(--color-text-title);">Retirement plan ready</div>
            <div style="font-size:11px;color:var(--color-text-muted);margin-top:2px;">Projections reflect your settings.</div>
          </div>
        </div>`;
    }
    setTimeout(() => {
      card.style.transition = `opacity 380ms var(--ease-premium), transform 380ms var(--ease-premium)`;
      card.style.opacity    = '0';
      card.style.transform  = 'translateY(-8px) scale(0.97)';
      setTimeout(() => card.remove(), 400);
    }, 500);
  }

  // Step 2 — spotlight fades + clean up anchor position + stop resize tracking
  if (spotlight) {
    if (_spotResizeObserver) { _spotResizeObserver.disconnect(); _spotResizeObserver = null; }
    setTimeout(() => {
      spotlight.style.opacity = '0';
      if (retGroup) {
        retGroup.classList.remove('ret-settings-focus-box');
        const sub = retGroup.querySelector('.highlighted-settings-subsection');
        if (sub) sub.style.position = '';
      }
      setTimeout(() => spotlight.remove(), 450);
    }, 180);
  } else if (retGroup) {
    retGroup.classList.remove('ret-settings-focus-box');
    const sub = retGroup.querySelector('.highlighted-settings-subsection');
    if (sub) sub.style.position = '';
  }

  // Step 3 — unblur analytics card
  setTimeout(() => {
    if (analyticsCard) {
      analyticsCard.style.transition    = `filter 380ms var(--ease-premium), opacity 380ms var(--ease-premium), box-shadow 380ms`;
      analyticsCard.style.filter        = '';
      analyticsCard.style.opacity       = '';
      analyticsCard.style.pointerEvents = '';
      analyticsCard.style.boxShadow     = '';
    }
    updateRetirementFieldStyles();
  }, 300);

  // Step 4 — update badge in-place (covers Skip; verify path badge was updated by animation)
  setTimeout(() => {
    const badge = document.getElementById('retVerifyBadge');
    if (badge) {
      if (reason === 'skip') {
        badge.textContent = '⏸';
        badge.className   = 'ret-verify-badge skipped';
      } else if (!badge.classList.contains('verified')) {
        badge.textContent = '✓';
        badge.className   = 'ret-verify-badge verified';
      }
    }
    // Update verify button state to match outcome
    _updateVerifyBtn();
  }, 520);

  if (scrollToSettings) {
    const target = retGroup || document.getElementById('highlightedSettingsPanel');
    if (target) setTimeout(() => target.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 80);
  }
}

function updateRetirementSettingsVisibility() {
  const group = document.getElementById('retirementSettingsGroup');
  if (group) {
    group.style.display = analysisTab === 'retirement' ? 'block' : 'none';
    if (analysisTab === 'retirement') onStatePensionToggleChange(true);
  }
}

function updateScenarioRangeVisibility() {
  const g = document.getElementById('scenarioRangeGroup');
  if (g) g.style.display = showScenarios ? 'block' : 'none';
}

function toggleShowScenarios() {
  showScenarios = !showScenarios;
  const cb = document.getElementById('showScenariosToggle');
  const pill = document.getElementById('showScenariosPill');
  if (cb) cb.checked = showScenarios;
  if (pill) pill.classList.toggle('toggle-active', showScenarios);
  updateScenarioRangeVisibility();
  calculateInvestment();
}

function startAnalysisMode() {
  if (highlightedTarget !== null) return;

  const people = Array.from(document.querySelectorAll('.person-card'));
  if (people.length === 0) return;

  const isDark = document.body.classList.contains('dark-mode');

  // Backdrop
  const backdrop = document.createElement('div');
  backdrop.id = 'analysisSelectionBackdrop';
  document.body.appendChild(backdrop);

  // Modal container
  const modal = document.createElement('div');
  modal.id = 'analysisSelectionModal';

  // Header
  modal.innerHTML = `
    <div style="text-align:center;margin-bottom:26px;">
      <div style="font-size:20px;font-weight:700;color:var(--color-text-title);margin-bottom:6px;">
        Select a Profile to Analyze
      </div>
      <div style="font-size:13px;color:var(--color-text-muted);">
        Choose a person or household to open their detailed analysis
      </div>
    </div>
  `;

  // Build selectable entries: household first (if eligible), then individuals
  const entries = [];

  // Household card — only when 2+ members
  if (householdMembers.length >= 2) {
    const hTotal = householdMembers.reduce((sum, mid) => sum + (personFinalBalances[mid] || 0), 0);
    const hValueText = hTotal > 0 ? `${getCurrency()}${formatCurrency(hTotal)}` : '—';
    const memberDots = householdMembers.slice(0, 5).map(mid => {
      const col = personColors[(mid - 1) % personColors.length];
      return `<div style="width:11px;height:11px;border-radius:50%;background:${col};
        margin-left:-4px;box-shadow:0 0 0 2px var(--bg-panel);"></div>`;
    }).join('');
    entries.push({
      type: 'household',
      label: 'Household Portfolio',
      subtitle: `Combined value — ${hValueText}`,
      icon: `<div style="display:flex;padding-left:4px;flex-shrink:0;">${memberDots}</div>`,
      arrowColor: 'var(--accent)',
      onClick: () => selectAnalysisPerson('combined')
    });
  }

  // Individual person cards
  people.forEach(personEl => {
    const pid = Number(personEl.id.split('-')[1]);
    const name = document.getElementById(`name-${pid}`)?.value.trim() || `Person ${pid}`;
    const color = personEl.dataset.color || personColors[(pid - 1) % personColors.length];
    const balance = personFinalBalances[pid];
    const valueText = balance != null ? `${getCurrency()}${formatCurrency(balance)}` : '—';
    entries.push({
      type: 'person',
      label: name,
      subtitle: `Portfolio value — ${valueText}`,
      icon: `<div style="width:16px;height:16px;border-radius:50%;background:${color};flex-shrink:0;
        box-shadow:0 0 0 4px ${color}28;"></div>`,
      arrowColor: color,
      onClick: () => selectAnalysisPerson(pid)
    });
  });

  entries.forEach((entry, i) => {
    const card = document.createElement('div');
    card.className = 'analysis-select-card';
    card.style.animationDelay = `${i * 55}ms`;
    card.innerHTML = `
      ${entry.icon}
      <div style="flex:1;min-width:0;">
        <div style="font-size:18px;font-weight:600;color:var(--color-text-title);
          white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHTML(entry.label)}</div>
        <div style="font-size:13px;color:var(--color-text-muted);margin-top:3px;">
          ${entry.subtitle}
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">
        <span style="font-size:13px;font-weight:600;color:${entry.arrowColor};letter-spacing:0.01em;">
          Analyze
        </span>
        <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24"
          fill="none" stroke="${entry.arrowColor}" stroke-width="2.5"
          stroke-linecap="round" stroke-linejoin="round">
          <line x1="5" y1="12" x2="19" y2="12"/>
          <polyline points="12 5 19 12 12 19"/>
        </svg>
      </div>
    `;
    card.addEventListener('click', entry.onClick);
    modal.appendChild(card);
  });

  document.body.appendChild(modal);

  // Dismiss on backdrop click
  backdrop.addEventListener('click', exitAnalysisEntry);

  // Dismiss on Escape
  function escHandler(e) {
    if (e.key === 'Escape') {
      exitAnalysisEntry();
      document.removeEventListener('keydown', escHandler);
    }
  }
  document.addEventListener('keydown', escHandler);
}

function selectAnalysisPerson(pid) {
  const modal = document.getElementById('analysisSelectionModal');
  const backdrop = document.getElementById('analysisSelectionBackdrop');

  if (modal) modal.classList.add('fade-out');
  if (backdrop) backdrop.classList.add('fade-out');

  setTimeout(() => {
    modal?.remove();
    backdrop?.remove();
    highlightTarget(pid);
  }, ANIM.fast + 20);
}

function exitAnalysisEntry() {
  const modal = document.getElementById('analysisSelectionModal');
  const backdrop = document.getElementById('analysisSelectionBackdrop');

  if (modal) modal.classList.add('fade-out');
  if (backdrop) backdrop.classList.add('fade-out');

  setTimeout(() => {
    modal?.remove();
    backdrop?.remove();
  }, ANIM.fast + 20);
}

function applyAnalysisFocus() {
  exitAnalysisEntry();
  document.body.classList.add('analysis-active');
  const isFirstEnter = !preAnalysisCollapseState;

  if (isFirstEnter) {
    preAnalysisCollapseState = new Map();
    document.querySelectorAll('.person-card').forEach(card => {
      const pid = Number(card.id.split('-')[1]);
      preAnalysisCollapseState.set(pid, card.classList.contains('collapsed'));
    });
    const addBtn = document.querySelector('.add-person-btn');
    if (addBtn) addBtn.style.display = 'none';
    showScenarios = false;
    const cb = document.getElementById('showScenariosToggle');
    const pill = document.getElementById('showScenariosPill');
    if (cb) cb.checked = false;
    if (pill) pill.classList.remove('toggle-active');
    updateScenarioRangeVisibility();
  }

  document.querySelectorAll('.person-card').forEach(card => {
    const pid = Number(card.id.split('-')[1]);
    const isHighlighted = highlightedTarget !== 'combined' && Number(highlightedTarget) === pid;
    const wasPrevFocused = prevAnalysisTarget !== 'combined' && Number(prevAnalysisTarget) === pid;

    card.classList.remove('analysis-dimmed', 'analysis-focus');

    if (highlightedTarget === 'combined' || !isHighlighted) {
      card.classList.add('analysis-dimmed');
      if (isFirstEnter || wasPrevFocused) {
        card.classList.add('collapsed');
        card.dataset.pinned = 'closed';
        const nameInput = document.getElementById(`name-${pid}`);
        const nameDisplay = card.querySelector('.collapse-header-name');
        if (nameDisplay && nameInput) nameDisplay.textContent = nameInput.value.trim() || `Person ${pid}`;
      }
    } else {
      card.classList.add('analysis-focus');
      card.classList.remove('collapsed');
      card.dataset.pinned = 'open';
    }
  });

  prevAnalysisTarget = highlightedTarget;
}

function clearAnalysisFocus() {
  if (!preAnalysisCollapseState) return;

  document.querySelectorAll('.person-card').forEach(card => {
    const pid = Number(card.id.split('-')[1]);
    card.classList.remove('analysis-dimmed', 'analysis-focus');

    const wasCollapsed = preAnalysisCollapseState.get(pid) ?? false;
    if (wasCollapsed) {
      card.classList.add('collapsed');
      card.dataset.pinned = 'closed';
    } else {
      card.classList.remove('collapsed');
      card.dataset.pinned = 'open';
    }
    const nameInput = document.getElementById(`name-${pid}`);
    const nameDisplay = card.querySelector('.collapse-header-name');
    if (nameDisplay && nameInput) nameDisplay.textContent = nameInput.value.trim() || `Person ${pid}`;
  });

  const addBtn = document.querySelector('.add-person-btn');
  if (addBtn) addBtn.style.display = '';

  showScenarios = true;
  updateScenarioRangeVisibility();
  preAnalysisCollapseState = null;
  prevAnalysisTarget = null;
  document.body.classList.remove('analysis-active');
}

// =========================
// RETIREMENT TABLE
// =========================

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

// ── UNIFIED MILESTONE SELECTION ──────────────────────────────
function deselectAllMilestones() {
  document.querySelectorAll('[data-ms-row]').forEach(r => r.classList.remove('ms-selected'));
  document.querySelectorAll('.milestone-node').forEach(n => n.classList.remove('ms-selected'));
  milestoneActiveYear = null;
  if (chart) chart.update('none');
  const panel = document.getElementById('msDetailsPanel');
  if (panel) {
    panel.style.transition = `opacity ${ANIM.fast}ms, transform ${ANIM.fast}ms`;
    panel.style.opacity = '0';
    panel.style.transform = 'translateY(4px)';
    setTimeout(() => {
      panel.dataset.hasContent = '0';
      panel.style.display = 'flex';
      panel.innerHTML = 'Hover or click a milestone to see details';
      panel.style.opacity = '1';
      panel.style.transform = 'translateY(0)';
    }, ANIM.fast + 10);
  }
}

function selectMilestone(m) {
  // Toggle off if already selected
  const alreadySel = document.querySelector(`[data-ms-row="${m}"].ms-selected`) ||
                     document.querySelector(`.milestone-node[data-mval="${m}"].ms-selected`);
  if (alreadySel) { deselectAllMilestones(); return; }

  // Clear previous selections
  document.querySelectorAll('[data-ms-row]').forEach(r => r.classList.remove('ms-selected'));
  document.querySelectorAll('.milestone-node').forEach(n => n.classList.remove('ms-selected'));

  // Select tracker row
  const trackerRow = document.querySelector(`[data-ms-row="${m}"]`);
  if (trackerRow) trackerRow.classList.add('ms-selected');

  // Select & ripple timeline node (only exists for future milestones)
  const timelineNode = document.querySelector(`.milestone-node[data-mval="${m}"]`);
  if (timelineNode) {
    timelineNode.classList.add('ms-selected');
    const dotEl = timelineNode.querySelector('.mnode-dot');
    if (dotEl) {
      const ring = document.createElement('div');
      ring.className = 'ms-ripple-ring';
      ring.style.background = timelineNode.dataset.color || 'var(--accent)';
      dotEl.style.position = 'relative';
      dotEl.appendChild(ring);
      setTimeout(() => ring.remove(), ANIM.focus + 100);
    }
  }

  const milestoneData = window._msMilestoneData;
  if (!milestoneData) return;
  const data = milestoneData.find(d => d.milestone === m);
  if (!data) return;

  const rows = window._milestoneRows;
  const primaryRow = rows && rows[0];
  if (!primaryRow) return;

  if (data.isCompleted) {
    milestoneActiveYear = null;
    if (chart) chart.update('none');
    updateMilestoneDetailsCompleted({
      label: data.label,
      currentValue: window._msCurrentPortfolioValue || 0,
      milestone: m,
      color: primaryRow.color
    });
  } else if (data.projectedYear !== null) {
    milestoneActiveYear = data.projectedYear;
    if (chart) chart.update('none');
    const balance = primaryRow.balances[data.projectedYear - 1] || 0;
    updateMilestoneDetails({
      label: data.label, year: data.projectedYear,
      name: primaryRow.name, color: primaryRow.color, balance, milestone: m
    });
  } else {
    milestoneActiveYear = null;
    if (chart) chart.update('none');
    updateMilestoneDetailsUnreachable({ label: data.label, color: primaryRow.color });
  }

  // Scroll details into view if off-screen
  setTimeout(() => {
    const panel = document.getElementById('msDetailsPanel');
    if (!panel) return;
    const container = document.querySelector('.right-column') || document.documentElement;
    const cRect = container.getBoundingClientRect();
    const pRect = panel.getBoundingClientRect();
    if (pRect.top < cRect.top || pRect.bottom > cRect.bottom) {
      panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, ANIM.fast + 20);
}

function onMilestoneDotClick(el) {
  selectMilestone(Number(el.dataset.mval));
}

function onMilestoneNodeHover(el) {
  const year = Number(el.dataset.year);
  if (!year) return;
  milestoneActiveYear = year;
  if (chart) chart.update('none');
  // Show detail preview only if nothing is selected
  if (!document.querySelector('.milestone-node.ms-selected, [data-ms-row].ms-selected')) {
    const m    = Number(el.dataset.mval);
    const ridx = Number(el.dataset.ridx);
    const rows = window._milestoneRows;
    if (rows && rows[ridx]) {
      const row = rows[ridx];
      const balance = row.balances[year - 1] || 0;
      updateMilestoneDetailsInstant({ label: el.dataset.label, year, name: row.name, color: el.dataset.color || row.color, balance, milestone: m });
    }
  }
}

function onMilestoneNodeLeave(el) {
  const selected = document.querySelector('.milestone-node.ms-selected');
  if (selected) {
    milestoneActiveYear = Number(selected.dataset.year) || null;
  } else {
    milestoneActiveYear = null;
    if (!document.querySelector('[data-ms-row].ms-selected')) {
      const panel = document.getElementById('msDetailsPanel');
      if (panel && panel.dataset.hasContent === '1') {
        panel.style.transition = `opacity ${ANIM.fast}ms`;
        panel.style.opacity = '0';
        setTimeout(() => {
          if (!document.querySelector('.milestone-node:hover, [data-ms-row].ms-selected')) {
            panel.dataset.hasContent = '0';
            panel.style.display = 'flex';
            panel.innerHTML = 'Hover or click a milestone to see details';
            panel.style.opacity = '1';
          }
        }, ANIM.fast + 10);
      }
    }
  }
  if (chart) chart.update('none');
}

// ── DETAIL PANEL BUILDERS ────────────────────────────────────
function buildMilestoneDetailHTML(info) {
  const fmtB = n => getCurrency() + formatNumber(Math.round(n * getConversionRate()));
  return `
    <div style="width:100%;">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;">
        <div style="width:11px;height:11px;border-radius:50%;background:${info.color};flex-shrink:0;
          box-shadow:0 0 0 3px ${hexToRgba(info.color,0.2)};"></div>
        <div style="font-size:14px;font-weight:700;color:var(--color-text-title);">${info.label} Milestone</div>
        <div style="margin-left:auto;font-size:9px;font-weight:700;letter-spacing:0.06em;
          text-transform:uppercase;background:${hexToRgba(info.color,0.12)};color:${info.color};
          padding:3px 10px;border-radius:999px;">${escapeHTML(info.name)}</div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;">
        <div style="background:var(--bg-card);border:1px solid var(--color-border);border-radius:10px;padding:12px 14px;">
          <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;
            color:var(--color-text-muted);margin-bottom:5px;">Year Projected</div>
          <div style="font-size:20px;font-weight:700;color:var(--color-text-title);">${getDisplayYear(info.year)}</div>
        </div>
        <div style="background:var(--bg-card);border:1px solid var(--color-border);border-radius:10px;padding:12px 14px;">
          <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;
            color:var(--color-text-muted);margin-bottom:5px;">Portfolio Value</div>
          <div style="font-size:20px;font-weight:700;color:${info.color};">${fmtB(info.balance)}</div>
        </div>
        <div style="background:var(--bg-card);border:1px solid var(--color-border);border-radius:10px;padding:12px 14px;">
          <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;
            color:var(--color-text-muted);margin-bottom:5px;">Years to Reach</div>
          <div style="font-size:20px;font-weight:700;color:var(--color-text-title);">${info.year} yr${info.year === 1 ? '' : 's'}</div>
        </div>
      </div>
    </div>`;
}

function updateMilestoneDetailsCompleted(info) {
  const fmtB = n => getCurrency() + formatNumber(Math.round(n * getConversionRate()));
  const html = `
    <div style="width:100%;">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;">
        <div style="width:11px;height:11px;border-radius:50%;background:${info.color};flex-shrink:0;
          box-shadow:0 0 0 3px ${hexToRgba(info.color,0.2)};"></div>
        <div style="font-size:14px;font-weight:700;color:var(--color-text-title);">${info.label} Milestone</div>
        <div style="margin-left:auto;background:rgba(16,185,129,0.12);color:#10b981;
          font-size:9px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;
          padding:3px 10px;border-radius:999px;">Already Achieved</div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
        <div style="background:var(--bg-card);border:1px solid var(--color-border);border-radius:10px;padding:12px 14px;">
          <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;
            color:var(--color-text-muted);margin-bottom:5px;">Status</div>
          <div style="font-size:16px;font-weight:700;color:#10b981;">✓ Achieved</div>
          <div style="font-size:11px;color:var(--color-text-muted);margin-top:3px;">before simulation start</div>
        </div>
        <div style="background:var(--bg-card);border:1px solid var(--color-border);border-radius:10px;padding:12px 14px;">
          <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;
            color:var(--color-text-muted);margin-bottom:5px;">Current Portfolio</div>
          <div style="font-size:16px;font-weight:700;color:${info.color};">${fmtB(info.currentValue)}</div>
        </div>
      </div>
    </div>`;
  _animateMilestonePanel(html);
}

function updateMilestoneDetailsUnreachable(info) {
  const html = `
    <div style="width:100%;">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;">
        <div style="width:11px;height:11px;border-radius:50%;background:${info.color};flex-shrink:0;opacity:0.4;"></div>
        <div style="font-size:14px;font-weight:700;color:var(--color-text-title);">${info.label} Milestone</div>
        <div style="margin-left:auto;background:var(--bg-card);color:var(--color-text-muted);
          font-size:9px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;
          padding:3px 10px;border-radius:999px;">Not in range</div>
      </div>
      <div style="font-size:13px;color:var(--color-text-muted);">
        This milestone is outside the current simulation timeframe.
        Extend your investment period to project reaching it.
      </div>
    </div>`;
  _animateMilestonePanel(html);
}

function _animateMilestonePanel(html) {
  const panel = document.getElementById('msDetailsPanel');
  if (!panel) return;
  panel.dataset.hasContent = '1';
  const _halfFast = Math.round(ANIM.fast / 2);
  panel.style.transition = `opacity ${_halfFast}ms, transform ${_halfFast}ms`;
  panel.style.opacity = '0';
  panel.style.transform = 'translateY(5px)';
  setTimeout(() => {
    panel.style.display = 'block';
    panel.innerHTML = html;
    panel.style.transform = 'translateY(-5px)';
    panel.style.opacity = '0';
    requestAnimationFrame(() => {
      panel.style.transition = `opacity ${ANIM.standard}ms, transform ${ANIM.standard}ms`;
      panel.style.opacity = '1';
      panel.style.transform = 'translateY(0)';
    });
  }, _halfFast + 10);
  if (window.DEBUG_ANIMATIONS) console.log('[ANIM] milestone panel swap', { fadeOut: _halfFast, fadeIn: ANIM.standard });
}

function updateMilestoneDetailsInstant(info) {
  const panel = document.getElementById('msDetailsPanel');
  if (!panel) return;
  panel.dataset.hasContent = '1';
  panel.style.display = 'block';
  panel.innerHTML = buildMilestoneDetailHTML(info);
}

function updateMilestoneDetails(info) {
  _animateMilestonePanel(buildMilestoneDetailHTML(info));
}

function renderMilestoneTimeline(peopleData, householdBalances, years, retirementYear, useInflation) {
  const isDark = document.body.classList.contains('dark-mode');
  const currency = getCurrency();
  const rate = getConversionRate();

  if (peopleData.length === 0 && !householdBalances) return '';
  const maxBalance = Math.max(
    ...(peopleData.length > 0 ? peopleData.map(p => p.balances.length > 0 ? Math.max(...p.balances) : 0) : [0]),
    householdBalances && householdBalances.length > 0 ? Math.max(...householdBalances) : 0
  );
  const maxMilestone = maxBalance * 1.5;
  // Only show milestones not yet reached at Year 0 (future milestones only)
  const currentVal = window._msCurrentPortfolioValue || 0;
  const activeMilestones = MILESTONES.filter(m => m <= maxMilestone && m > currentVal);
  if (activeMilestones.length === 0) return '';

  const allRows = [];
  if (householdBalances && householdBalances.some(b => b > 0)) {
    allRows.push({ name: 'Household', color: isDark ? '#9ca3af' : '#374151', balances: householdBalances, isHousehold: true });
  }
  peopleData.forEach(p => allRows.push(p));

  function firstYearHit(balances, threshold) {
    for (let i = 0; i < balances.length; i++) {
      if (balances[i] >= threshold) return i + 1;
    }
    return null;
  }

  const allHitYears = allRows.flatMap(r =>
    activeMilestones.map(m => firstYearHit(r.balances, m)).filter(y => y !== null)
  );
  if (retirementYear) allHitYears.push(retirementYear);
  if (allHitYears.length === 0) return '';

  const minYear = Math.max(1, Math.min(...allHitYears) - 1);
  const maxYear = Math.min(years, Math.max(...allHitYears) + 2);
  const span = Math.max(maxYear - minYear, 1);

  function milestoneLabel(m) {
    const converted = m * rate;
    if (converted >= 1000000) return currency + (converted / 1000000).toFixed(converted % 1000000 === 0 ? 0 : 1) + 'M';
    if (converted >= 1000) return currency + (converted / 1000).toFixed(0) + 'k';
    return currency + formatNumber(converted);
  }

  const rowHeight = 52;
  const paddingLeft = 90;
  const paddingRight = 24;

  const bgPanel = isDark ? '#2a2a2a' : '#ffffff';
  const textMuted = isDark ? '#686868' : '#475569';
  const borderColor = isDark ? '#3d3d3d' : '#dbe4ee';
  const goldColor = '#f59e0b';

  let rowsHTML = '';
  allRows.forEach((row, rowIndex) => {
    // Identify milestone statuses for this row
    const hitYearsForRow = activeMilestones.map(m => firstYearHit(row.balances, m));
    const lastCompletedIdx = [...hitYearsForRow].reverse().findIndex(y => y !== null);
    const currentTargetIdx = hitYearsForRow.findIndex(y => y === null); // first unreached

    const lastHitYear = hitYearsForRow.filter(y => y !== null).length > 0
      ? Math.max(...hitYearsForRow.filter(y => y !== null))
      : null;
    const completedPct = lastHitYear
      ? (((lastHitYear - minYear) / span) * 100).toFixed(1)
      : '0';

    let dotsHTML = '';

    activeMilestones.forEach((m, mIdx) => {
      const hitYear = hitYearsForRow[mIdx];
      const label   = milestoneLabel(m);
      const isCurrentTarget = (mIdx === currentTargetIdx);
      const isFuture = hitYear === null && !isCurrentTarget;
      const animDelay = (rowIndex * activeMilestones.length + mIdx) * 60;

      if (hitYear !== null) {
        // ── COMPLETED NODE ───────────────────────────────────
        const leftPct = ((hitYear - minYear) / span) * 100;
        dotsHTML += `
          <div class="milestone-node ms-node-completed"
            onmouseover="onMilestoneNodeHover(this)"
            onmouseleave="onMilestoneNodeLeave(this)"
            onclick="onMilestoneDotClick(this)"
            data-mval="${m}" data-year="${hitYear}" data-ridx="${rowIndex}"
            data-label="${label}" data-color="${row.color}"
            title="${label} — ${getDisplayYear(hitYear)}"
            style="position:absolute;left:calc(${leftPct}%);top:50%;
              transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;
              gap:3px;z-index:2;animation:analysisCardIn var(--anim-standard) var(--ease-premium) ${animDelay}ms both;">
            <span style="font-size:10px;font-weight:700;color:${row.color};white-space:nowrap;
              line-height:1;background:${bgPanel};padding:1px 4px;border-radius:3px;">${label}</span>
            <div style="width:2px;height:10px;background:${row.color};opacity:0.6;"></div>
            <div class="mnode-dot" style="width:14px;height:14px;background:${row.color};
              box-shadow:0 0 0 3px ${hexToRgba(row.color,0.22)}, 0 0 8px ${hexToRgba(row.color,0.15)};"></div>
            <span style="font-size:9px;color:${textMuted};white-space:nowrap;line-height:1;
              background:${bgPanel};padding:1px 3px;border-radius:3px;">${getDisplayYear(hitYear)}</span>
          </div>`;
      } else if (isCurrentTarget) {
        // ── CURRENT TARGET NODE (pulse, at right edge) ───────
        dotsHTML += `
          <div class="milestone-node ms-node-current"
            title="${label} — In progress"
            style="position:absolute;right:2px;top:50%;
              transform:translateY(-50%);display:flex;flex-direction:column;align-items:center;
              gap:3px;z-index:2;animation:analysisCardIn var(--anim-standard) var(--ease-premium) ${animDelay}ms both;">
            <span style="font-size:10px;font-weight:700;color:${row.color};white-space:nowrap;
              line-height:1;background:${bgPanel};padding:1px 4px;border-radius:3px;opacity:0.75;">${label}</span>
            <div style="width:2px;height:10px;background:${row.color};opacity:0.35;"></div>
            <div class="mnode-dot" style="width:14px;height:14px;
              background:transparent;border:2.5px solid ${row.color};"></div>
            <span style="font-size:9px;color:${textMuted};white-space:nowrap;line-height:1;
              background:${bgPanel};padding:1px 3px;border-radius:3px;opacity:0.65;">upcoming</span>
          </div>`;
      }
      // Future milestones beyond current target: not rendered on timeline
    });

    // Retirement line
    if (retirementYear && retirementYear >= minYear && retirementYear <= maxYear) {
      dotsHTML += `
        <div title="Retirement — ${getDisplayYear(retirementYear)}" style="
          position:absolute;
          left:calc(${((retirementYear - minYear) / span) * 100}%);
          top:0;bottom:0;width:2px;
          background:${goldColor};opacity:0.3;
          z-index:1;pointer-events:none;
        "></div>`;
    }

    rowsHTML += `
      <div style="display:flex;align-items:center;height:${rowHeight}px;">
        <div style="width:${paddingLeft}px;flex-shrink:0;font-size:11px;font-weight:600;
          color:${row.color};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
          padding-right:10px;text-align:right;">${escapeHTML(row.name)}</div>
        <div style="flex:1;position:relative;height:100%;
          border-bottom:1px solid ${borderColor};">
          <!-- Two-tone progress line -->
          <div style="position:absolute;top:50%;left:0;right:0;height:2px;
            transform:translateY(-50%);border-radius:1px;overflow:hidden;">
            <div style="position:absolute;left:0;width:${completedPct}%;height:100%;
              background:${hexToRgba(row.color,0.6)};border-radius:1px;
              transform-origin:left;animation:analysisCardIn var(--anim-focus) var(--ease-premium) ${rowIndex * 80}ms both;"></div>
            <div style="position:absolute;left:${completedPct}%;right:0;height:100%;
              background:${hexToRgba(row.color,0.11)};border-radius:1px;"></div>
          </div>
          ${dotsHTML}
        </div>
      </div>`;
  });

  // Time axis
  let axisHTML = `<div style="margin-left:${paddingLeft}px;margin-right:${paddingRight}px;
    position:relative;height:16px;font-size:9px;color:${textMuted};">`;

  const step = span <= 10 ? 1 : span <= 20 ? 5 : span <= 40 ? 10 : 15;
  for (let y = Math.ceil(minYear / step) * step; y <= maxYear; y += step) {
    axisHTML += `<span style="position:absolute;left:${((y - minYear) / span) * 100}%;
      transform:translateX(-50%);white-space:nowrap;">${getDisplayYear(y)}</span>`;
  }
  if (retirementYear && retirementYear >= minYear && retirementYear <= maxYear) {
    axisHTML += `<span style="position:absolute;left:${((retirementYear - minYear) / span) * 100}%;
      transform:translateX(-50%);white-space:nowrap;color:${goldColor};font-weight:600;">
      ${getStartYear() ? getDisplayYear(retirementYear) + ' retire' : '↑ retire'}</span>`;
  }
  axisHTML += '</div>';

  return `
    <div style="background:${bgPanel};border-radius:14px;padding:16px 18px 12px;
      box-shadow:0 2px 8px rgba(0,0,0,${isDark ? '0.35' : '0.06'});margin-bottom:4px;">
      <div style="font-size:10px;font-weight:700;color:#94a3b8;letter-spacing:0.07em;
        text-transform:uppercase;margin-bottom:14px;">Milestone Timeline</div>
      ${rowsHTML}
      ${axisHTML}
    </div>`;
}

function renderMilestoneTabContent(timelinePeople, timelineHousehold, years, retirementYear, useInflation) {
  const isDark = document.body.classList.contains('dark-mode');
  const currency = getCurrency();
  const rate = getConversionRate();
  const personResultsEl = document.getElementById('personResults');

  const allRows = [];
  if (timelineHousehold && timelineHousehold.some(b => b > 0)) {
    allRows.push({ name: 'Household', color: isDark ? '#9ca3af' : '#374151', balances: timelineHousehold });
  }
  timelinePeople.forEach(p => allRows.push(p));
  window._milestoneRows = allRows;

  const primaryRow = allRows[0];
  const primaryBalances = primaryRow ? primaryRow.balances : [];
  const primaryColor = primaryRow ? primaryRow.color : (isDark ? '#9ca3af' : '#374151');

  function mLabel(m) {
    const c = m * rate;
    if (c >= 1000000) return currency + (c / 1000000).toFixed(c % 1000000 === 0 ? 0 : 1) + 'M';
    if (c >= 1000) {
      const k = c / 1000;
      return currency + (k % 1 === 0 ? k.toFixed(0) : k.toFixed(1)) + 'k';
    }
    return currency + formatNumber(c);
  }

  // ── CURRENT PORTFOLIO VALUE (Year 0, not projection) ────
  let currentPortfolioValue = 0;
  if (highlightedTarget === 'combined') {
    document.querySelectorAll('.person-card').forEach(card => {
      const pid = Number(card.id.split('-')[1]);
      if (householdMembers.includes(pid)) {
        currentPortfolioValue += parseFloat(document.getElementById(`initial-${pid}`)?.value) || 0;
      }
    });
  } else if (highlightedTarget !== null && highlightedTarget !== 'combined') {
    currentPortfolioValue = parseFloat(document.getElementById(`initial-${highlightedTarget}`)?.value) || 0;
  } else if (timelinePeople.length > 0 && timelinePeople[0].id) {
    currentPortfolioValue = parseFloat(document.getElementById(`initial-${timelinePeople[0].id}`)?.value) || 0;
  }
  window._msCurrentPortfolioValue = currentPortfolioValue;

  // ── CLASSIFY MILESTONES ──────────────────────────────────
  // Completed  = current portfolio already >= milestone (Year 0 status)
  // Future     = not yet reached, but projected during simulation
  // Unreachable = not reached by end of simulation
  const milestoneData = MILESTONES.map(m => {
    const isCompleted = currentPortfolioValue >= m;
    let projectedYear = null;
    if (!isCompleted) {
      for (let i = 0; i < primaryBalances.length; i++) {
        if (primaryBalances[i] >= m) { projectedYear = i + 1; break; }
      }
    }
    return { milestone: m, label: mLabel(m), isCompleted, projectedYear };
  });
  window._msMilestoneData = milestoneData;

  // ── DERIVED SETS ────────────────────────────────────────
  // milestoneOverlayData: future milestones with projected years (for chart dashes)
  milestoneOverlayData = milestoneData
    .filter(d => !d.isCompleted && d.projectedYear !== null)
    .map(d => ({ year: d.projectedYear, label: d.label }));

  const completedMilestones = milestoneData.filter(d => d.isCompleted);
  const nextMilestone       = milestoneData.find(d => !d.isCompleted) || null;
  const upcomingMilestones  = milestoneData.filter(d => !d.isCompleted && d !== nextMilestone);

  // Progress toward next milestone based on CURRENT value (not projection)
  const nextProgress = nextMilestone
    ? Math.min(100, (currentPortfolioValue / nextMilestone.milestone) * 100)
    : 0;

  // Stats
  const finalVal = primaryBalances.length > 0 ? primaryBalances[primaryBalances.length - 1] : 0;
  const initVal  = currentPortfolioValue;
  const multiple = initVal > 0 ? (finalVal / initVal).toFixed(2) + '×' : '—';

  // ── LATEST MILESTONE CARD (based on current portfolio value) ──
  const latestMilestone = completedMilestones[completedMilestones.length - 1] || null;
  const fmtCurr = v => getCurrency() + formatNumber(Math.round(v * rate));

  const latestCardHTML = latestMilestone ? `
    <div style="flex:1;padding:18px 20px;border-radius:14px;
      border:1.5px solid ${hexToRgba(primaryColor, isDark ? 0.4 : 0.3)};
      background:${hexToRgba(primaryColor, isDark ? 0.08 : 0.04)};">
      <div style="font-size:9px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;
        color:${primaryColor};margin-bottom:10px;">Latest Milestone</div>
      <div style="font-size:28px;font-weight:700;color:var(--color-text-title);margin-bottom:6px;">${latestMilestone.label}</div>
      <div style="font-size:13px;color:var(--color-text-muted);">
        Already achieved · ${fmtCurr(currentPortfolioValue)} today
      </div>
    </div>` : `
    <div style="flex:1;padding:16px 18px;border-radius:14px;background:var(--bg-panel);
      border:1px solid var(--color-border);color:var(--color-text-muted);font-size:13px;
      display:flex;align-items:center;">
      No milestones reached yet.
    </div>`;

  // ── NEXT MILESTONE CARD ──────────────────────────────────
  const nextCardHTML = nextMilestone ? `
    <div style="flex:1;padding:18px 20px;border-radius:14px;background:var(--bg-panel);
      border:1px solid var(--color-border);">
      <div style="font-size:9px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;
        color:var(--color-text-muted);margin-bottom:10px;">Next Milestone</div>
      <div style="font-size:28px;font-weight:700;color:var(--color-text-title);margin-bottom:4px;">${nextMilestone.label}</div>
      <div style="font-size:13px;color:var(--color-text-muted);margin-bottom:14px;">
        ${nextProgress.toFixed(0)}% there${nextMilestone.projectedYear ? ' · projected ' + getDisplayYear(nextMilestone.projectedYear) : ''}
      </div>
      <div style="height:4px;border-radius:3px;background:${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)'};overflow:hidden;">
        <div id="msProgressBar" style="height:4px;border-radius:3px;width:0%;background:var(--accent);
          transition:width 1200ms var(--ease-premium);"></div>
      </div>
      <div style="font-size:11px;color:var(--accent);font-weight:600;margin-top:6px;">${nextProgress.toFixed(0)}% to ${nextMilestone.label}</div>
    </div>` : latestMilestone ? `
    <div style="flex:1;padding:18px 20px;border-radius:14px;background:var(--bg-panel);
      border:1px solid var(--color-border);display:flex;flex-direction:column;justify-content:center;">
      <div style="font-size:9px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;
        color:var(--color-text-muted);margin-bottom:8px;">Next Milestone</div>
      <div style="font-size:15px;font-weight:600;color:var(--color-text-title);">All milestones achieved</div>
      <div style="font-size:12px;color:var(--color-text-muted);margin-top:4px;">Outstanding achievement</div>
    </div>` : '';

  // ── MILESTONE TRACKER TABLE ──────────────────────────────
  // Show: last 3 completed + next milestone + first 2 upcoming
  const recentCompleted = completedMilestones.slice(-3);
  const trackerDisplay  = [
    ...recentCompleted,
    ...(nextMilestone ? [nextMilestone] : []),
    ...upcomingMilestones.slice(0, 2)
  ];

  const trackerRows = trackerDisplay.map(d => {
    const isNext = nextMilestone && d.milestone === nextMilestone.milestone;
    let statusHTML = '';
    let rowExtraStyle = '';

    if (d.isCompleted) {
      statusHTML = `
        <div style="display:flex;align-items:center;gap:6px;margin-left:auto;">
          <span style="color:#10b981;font-size:12px;font-weight:700;">✓</span>
          <span style="font-size:12px;color:var(--color-text-muted);">achieved</span>
        </div>`;
    } else if (isNext) {
      statusHTML = `
        <div style="display:flex;align-items:center;gap:10px;margin-left:auto;flex:1;max-width:200px;">
          <div style="flex:1;height:4px;border-radius:2px;
            background:${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)'};overflow:hidden;">
            <div id="msTrackerBar" style="height:4px;border-radius:2px;width:0%;background:var(--accent);
              transition:width 1200ms var(--ease-premium);"></div>
          </div>
          <span style="font-size:12px;color:var(--accent);font-weight:600;white-space:nowrap;">${nextProgress.toFixed(0)}%</span>
        </div>`;
      rowExtraStyle = `background:${hexToRgba(isDark ? '#ffffff' : primaryColor, 0.04)};`;
    } else {
      const label = d.projectedYear ? getDisplayYear(d.projectedYear) : 'Upcoming';
      statusHTML = `<span style="margin-left:auto;font-size:12px;color:var(--color-text-muted);opacity:0.55;">${label}</span>`;
    }

    const dotStyle = d.isCompleted
      ? `background:${primaryColor};box-shadow:0 0 0 2px ${hexToRgba(primaryColor,0.22)};`
      : `background:transparent;border:2px solid ${isNext ? 'var(--accent)' : (isDark ? '#4a4a4a' : '#d1d5db')};`;

    return `
      <div class="ms-tracker-row" data-ms-row="${d.milestone}"
        onclick="selectMilestone(${d.milestone})"
        style="cursor:pointer;${rowExtraStyle}">
        <div style="width:9px;height:9px;border-radius:50%;flex-shrink:0;${dotStyle}"></div>
        <span style="font-size:13px;font-weight:600;min-width:54px;
          color:${d.isCompleted ? 'var(--color-text-title)' : 'var(--color-text-muted)'};">${d.label}</span>
        ${statusHTML}
      </div>`;
  }).join('');

  const trackerHTML = `
    <div style="background:var(--bg-panel);border:1px solid var(--color-border);
      border-radius:14px;padding:14px 16px;">
      <div style="font-size:10px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;
        color:var(--color-text-muted);margin-bottom:12px;">Milestone Progress</div>
      ${trackerRows || '<div style="font-size:13px;color:var(--color-text-muted);padding:8px 0;">Start investing to unlock milestones</div>'}
    </div>`;

  // ── QUICK STATS (sidebar) ────────────────────────────────
  const statsHTML = completedMilestones.length > 0 ? `
    <div style="display:flex;flex-direction:column;gap:10px;min-width:148px;max-width:168px;">
      <div style="background:var(--bg-panel);border:1px solid var(--color-border);border-radius:12px;padding:12px 14px;">
        <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;
          color:var(--color-text-muted);margin-bottom:5px;">Projected Multiple</div>
        <div style="font-size:18px;font-weight:700;color:${primaryColor};">${multiple}</div>
        <div style="font-size:10px;color:var(--color-text-muted);margin-top:2px;">over ${years} yrs</div>
      </div>
      <div style="background:var(--bg-panel);border:1px solid var(--color-border);border-radius:12px;padding:12px 14px;">
        <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;
          color:var(--color-text-muted);margin-bottom:5px;">Achieved</div>
        <div style="font-size:20px;font-weight:700;color:var(--color-text-title);">${completedMilestones.length}</div>
        <div style="font-size:10px;color:var(--color-text-muted);margin-top:2px;">of ${MILESTONES.length} milestones</div>
      </div>
    </div>` : '';

  // ── BAR CHART (future milestones only) ───────────────────
  const showNameCol = allRows.length > 1;
  const futureMilestonesForChart = milestoneData.filter(d => !d.isCompleted && d.projectedYear !== null);
  let barChartHTML = '';
  if (futureMilestonesForChart.length > 0) {
    const milestoneGroupsHTML = futureMilestonesForChart.map(d => {
      const barsHTML = allRows.map(row => {
        let hitYear = null;
        for (let i = 0; i < row.balances.length; i++) {
          if (row.balances[i] >= d.milestone) { hitYear = i + 1; break; }
        }
        const reached = hitYear !== null;
        const pct = reached ? (hitYear / years) * 100 : 0;
        return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
          ${showNameCol ? `<div style="width:72px;flex-shrink:0;text-align:right;font-size:11px;font-weight:500;
            color:${reached ? row.color : 'var(--color-text-muted)'};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHTML(row.name)}</div>` : ''}
          <div style="flex:1;height:12px;border-radius:3px;background:${isDark?'rgba(255,255,255,0.06)':'rgba(0,0,0,0.05)'};position:relative;overflow:hidden;">
            ${reached ? `<div style="position:absolute;top:0;left:0;height:100%;width:${pct.toFixed(1)}%;border-radius:3px;background:${hexToRgba(row.color,isDark?0.55:0.45)};"></div>`
              : `<div style="position:absolute;inset:0;border-radius:3px;background:repeating-linear-gradient(90deg,transparent 0,transparent 5px,${isDark?'rgba(255,255,255,0.04)':'rgba(0,0,0,0.04)'} 5px,${isDark?'rgba(255,255,255,0.04)':'rgba(0,0,0,0.04)'} 9px);"></div>`}
          </div>
          <div style="width:72px;flex-shrink:0;font-size:11px;color:var(--color-text-muted);">${reached ? getDisplayYear(hitYear) : 'not in range'}</div>
        </div>`;
      }).join('');
      return `<div style="margin-bottom:16px;">
        <div style="font-size:11px;font-weight:700;color:#94a3b8;margin-bottom:7px;${showNameCol?'padding-left:80px;':''}">${d.label}</div>
        ${barsHTML}</div>`;
    }).join('');

    barChartHTML = `
      <div style="background:var(--bg-card);border:1px solid var(--color-border);border-radius:12px;padding:16px 18px;">
        <div style="font-size:10px;font-weight:700;letter-spacing:0.07em;text-transform:uppercase;
          color:#94a3b8;margin-bottom:14px;">Time to Upcoming Milestones</div>
        ${milestoneGroupsHTML}
        <div style="display:flex;align-items:center;gap:8px;">
          ${showNameCol ? `<div style="width:72px;flex-shrink:0;"></div>` : ''}
          <div style="flex:1;display:flex;justify-content:space-between;">
            <span style="font-size:9px;color:var(--color-text-muted);">${getDisplayYear(1)}</span>
            <span style="font-size:9px;color:var(--color-text-muted);">${getDisplayYear(years)}</span>
          </div>
          <div style="width:72px;flex-shrink:0;"></div>
        </div>
      </div>`;
  }

  const timelineHTML = renderMilestoneTimeline(timelinePeople, timelineHousehold, years, retirementYear, useInflation);

  // ── HEADER ────────────────────────────────────────────────
  const headerLabel = latestMilestone ? latestMilestone.label : '—';
  const headerSub   = latestMilestone
    ? 'Achieved · ' + fmtCurr(currentPortfolioValue) + ' today'
    : 'No milestones reached yet';

  // ── ASSEMBLE ─────────────────────────────────────────────
  const fullHTML = `
    <div class="milestone-analytics-card">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;
        margin-bottom:20px;padding-bottom:16px;border-bottom:1px solid var(--color-border);">
        <div>
          <div style="font-size:20px;font-weight:700;color:var(--color-text-title);margin-bottom:4px;">Milestone Analysis</div>
          <div style="font-size:13px;color:var(--color-text-muted);">Your financial journey — where you are today</div>
        </div>
        <div style="text-align:right;flex-shrink:0;margin-left:16px;">
          <div style="font-size:10px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;
            color:var(--color-text-muted);margin-bottom:4px;">${latestMilestone ? 'Latest Achieved' : 'Status'}</div>
          <div style="font-size:22px;font-weight:700;color:${primaryColor};">${headerLabel}</div>
          <div style="font-size:11px;color:var(--color-text-muted);margin-top:2px;">${headerSub}</div>
        </div>
      </div>

      <div style="display:flex;gap:12px;margin-bottom:18px;">
        ${latestCardHTML}
        ${nextCardHTML}
      </div>

      <div style="display:flex;gap:14px;align-items:flex-start;margin-bottom:18px;">
        <div style="flex:1;min-width:0;">${trackerHTML}</div>
        ${statsHTML}
      </div>

      ${timelineHTML ? `<div style="margin-bottom:16px;">${timelineHTML}</div>` : ''}

      ${barChartHTML ? `<div style="margin-bottom:16px;">${barChartHTML}</div>` : ''}

      <div id="msDetailsPanel" class="ms-details-panel">
        Hover or click a milestone to see details
      </div>
    </div>`;

  personResultsEl.innerHTML += fullHTML;

  setTimeout(() => {
    const bar = document.getElementById('msProgressBar');
    if (bar) bar.style.width = nextProgress.toFixed(1) + '%';
    const trackerBar = document.getElementById('msTrackerBar');
    if (trackerBar) trackerBar.style.width = nextProgress.toFixed(1) + '%';
  }, 80);
}

// MAIN CALCULATION
function calculateInvestment() {
  _calculateInvestmentCore();
  // Keep the "years" field locked/synced to the retirement table while in retirement
  // analysis, and restored once we leave it. Re-run the calc if the value changed so
  // the chart range picks it up immediately.
  if (!_retEditingActive && _syncRetirementYearsLock()) {
    _calculateInvestmentCore();
  }
}

function _calculateInvestmentCore() {
  // Freeze all recalculation while user is actively editing a retirement field.
  // Nothing updates (no chart, no KPIs, no validation messages) until blur.
  if (_retEditingActive) return;

  updateCurrencyLabels();
  breakEvenYear = null;
  milestoneOverlayData = [];
  milestoneActiveYear = null;
  personFinalBalances = {};

const rawYears = parseInt(document.getElementById('years').value);
const years = Math.max(1, rawYears || 1);
if (isNaN(rawYears) || rawYears < 1) {
  showValidationHint('years', 'Must be at least 1 year');
} else {
  clearValidationHint('years');
}

const increaseRate = 0; // now per-person, kept for retirement table fallback

const returnRate =
  (parseFloat(document.getElementById('returnRate').value) || 0) / 100;

const useInflation =
  document.getElementById('useInflation').checked;

const inflationRate =
  (parseFloat(document.getElementById('inflationRate').value) || 0) / 100;

const scenarioRange =
  (parseFloat(
    document.getElementById('scenarioRange')?.value
  ) || 0) / 100;

const perPersonReturnMode =
  document.getElementById('perPersonReturn')?.checked || false;

const combinedResults =
  document.getElementById('combinedResults');

const personResults =
  document.getElementById('personResults');

const bottomResults =
  document.getElementById('bottomResults');

combinedResults.innerHTML = '';
clearProfitDonut();
personResults.innerHTML = '';

bottomResults.innerHTML = '';

  let datasets = [];
  

  // HOUSEHOLD TOTALS

let householdBalances = Array(years).fill(0);

let householdBullBalances = Array(years).fill(0);
let householdBearBalances = Array(years).fill(0);

let highlightedInvestedBalances = Array(years).fill(0);
let combinedInvestedBalances = Array(years).fill(0);

let householdFinal = 0;
let householdInvested = 0;
let householdProfit = 0;

let householdBullFinal = 0;
let householdBearFinal = 0;


  let combinedFinal = 0;
  let combinedInvested = 0;
  let combinedProfit = 0;


  // ACTIVE PEOPLE
  const people =
    document.querySelectorAll('.person-card');

// SCENARIO RANGE VISIBILITY

if (highlightedTarget !== null) {

  showHighlightedSettings();
  applyAnalysisFocus();

} else {

  hideHighlightedSettings();
  clearAnalysisFocus();

}


// =========================
// INITIALIZATION
// =========================


let highlightedScenarioData = null;
let highlightedPortfolioBalances = null;

let highlightedCards = [];

let householdCards = [];
let excludedCards = [];

const isDarkMode = document.body.classList.contains('dark-mode');
const btnDefaultBg = isDarkMode ? '#374151' : '#e2e8f0';
const btnDefaultColor = isDarkMode ? '#e2e8f0' : '#1e293b';

  // LOOP THROUGH PEOPLE
  people.forEach((personElement, index) => {

    const id = Number(
  personElement.id.split('-')[1]
);

const colorIndex = (id - 1) % personColors.length;

    const name =
  document.getElementById(`name-${id}`).value.trim()
  || `Person ${id}`;

    const initial =
  parseFloat(document.getElementById(`initial-${id}`).value) || 0;

const monthly =
  parseFloat(document.getElementById(`monthly-${id}`).value) || 0;

const personIncreaseRate =
  (parseFloat(document.getElementById(`increaseRate-${id}`)?.value) ?? 2) / 100;

const personStartOffset =
  Math.max(1, parseInt(document.getElementById(`startOffset-${id}`)?.value) || 1);

const personStopOffset =
  parseInt(document.getElementById(`stopOffset-${id}`)?.value) || 0;

const personReturnRate = perPersonReturnMode
  ? parsePersonReturnRate(document.getElementById(`returnRate-${id}`)?.value) / 100
  : returnRate;

// VALIDATION
const rawInitial = parseFloat(document.getElementById(`initial-${id}`).value);
if (!isNaN(rawInitial) && rawInitial < 0) {
  showValidationHint(`initial-${id}`, 'Cannot be negative');
} else {
  clearValidationHint(`initial-${id}`);
}
const stopRaw = document.getElementById(`stopOffset-${id}`)?.value;
if (stopRaw && personStopOffset > 0 && personStopOffset <= personStartOffset) {
  showValidationHint(`stopOffset-${id}`, `Must be after start year (${personStartOffset})`);
} else {
  clearValidationHint(`stopOffset-${id}`);
}

const { result, bullResult, bearResult } = calculatePersonProjection({
  initial,
  monthly,
  years,
  personIncreaseRate,
  personReturnRate,
  personStartOffset,
  personStopOffset,
  scenarioRange,
  useInflation,
  inflationRate,
  isHighlighted: highlightedTarget === id
});

// STORE FINAL ANALYZED VALUES
if (highlightedTarget == id) {

  highlightedScenarioData = {

    bull: bullResult.finalBalance,

    base: result.finalBalance,

    bear: bearResult.finalBalance,

    invested: result.totalInvested,

    profit: result.totalProfit
  };
}

// CACHE FINAL BALANCE FOR SELECTION MODAL
personFinalBalances[id] = result.finalBalance;

  // COMBINED TOTALS
combinedFinal += result.finalBalance;
combinedInvested += result.totalInvested;
combinedProfit += result.totalProfit;

// COMBINED BULL / BEAR
const combinedBullResult = simulateInvestment(
  initial,
  monthly,
  years,
  personIncreaseRate,
  personReturnRate + scenarioRange,
  personStartOffset,
  personStopOffset
);

const combinedBearResult = simulateInvestment(
  initial,
  monthly,
  years,
  personIncreaseRate,
  personReturnRate - scenarioRange,
  personStartOffset,
  personStopOffset
);

// HOUSEHOLD TOTALS

({ householdFinal, householdInvested, householdProfit, householdBalances,
   householdBullFinal, householdBearFinal, householdBullBalances, householdBearBalances } =
  accumulateHouseholdProjection({
    householdFinal, householdInvested, householdProfit, householdBalances,
    householdBullFinal, householdBearFinal, householdBullBalances, householdBearBalances
  }, {
    isMember: householdMembers.includes(Number(id)),
    result,
    bullResult: combinedBullResult,
    bearResult: combinedBearResult
  }));

personElement._timelineBalances = result.balances;

// TRACK INVESTED BALANCES FOR PROFIT ANALYSIS
let personBalancesInvested = result.balancesInvested ? [...result.balancesInvested] : Array(years).fill(0);
if (useInflation) {
  personBalancesInvested = personBalancesInvested.map((val, i) => val / Math.pow(1 + inflationRate, i + 1));
}
if (highlightedTarget == id) {
  highlightedInvestedBalances = personBalancesInvested;
  highlightedPortfolioBalances = [...result.balances];
}
if (householdMembers.includes(Number(id))) {
  personBalancesInvested.forEach((val, i) => { combinedInvestedBalances[i] += val; });
}

    // GRAPH DATA
   
if (people.length > 0) {

datasets.push({

  label:
    highlightedTarget == id
      ? (showScenarios ? 'Base Case' : analysisTab === 'profit' ? name + ' — Portfolio Value' : name)
      : name,

  data: result.balances,

  tension: 0.3,

  borderColor:
    highlightedTarget === null
      ? personColors[colorIndex]
      : highlightedTarget == id
        ? personColors[colorIndex]
        : document.body.classList.contains('dark-mode')
          ? 'rgba(80, 80, 80, 0.6)'
          : 'rgba(203, 213, 225, 0.35)',

  backgroundColor:
    highlightedTarget === null
      ? personColors[colorIndex]
      : highlightedTarget == id
        ? personColors[colorIndex]
        : document.body.classList.contains('dark-mode')
          ? 'rgba(80, 80, 80, 0.6)'
          : 'rgba(203, 213, 225, 0.35)',

  borderWidth:
    highlightedTarget == id
      ? 5
      : highlightedTarget !== null && document.body.classList.contains('dark-mode')
        ? 1
        : 3,

  pointRadius: 0,
  pointHitRadius: 6,
  pointHoverRadius: 0
}); 

// HIGHLIGHTED PERSON ESTIMATES
if (
  highlightedTarget !== null &&
  highlightedTarget == id &&
  showScenarios
) {

  // BEST CASE
  const bestResult =
    simulateInvestment(
      initial,
      monthly,
      years,
      personIncreaseRate,
      personReturnRate + scenarioRange,
      personStartOffset,
      personStopOffset
    );

  // WORST CASE
  const worstResult =
    simulateInvestment(
      initial,
      monthly,
      years,
      personIncreaseRate,
      personReturnRate - scenarioRange,
      personStartOffset,
      personStopOffset
    );

  // APPLY INFLATION
  if (useInflation) {

    bestResult.balances =
      bestResult.balances.map((balance, index) => {

        return balance /
          Math.pow(1 + inflationRate, index + 1);

      });

    worstResult.balances =
      worstResult.balances.map((balance, index) => {

        return balance /
          Math.pow(1 + inflationRate, index + 1);

      });
  }

  // BULL CASE
datasets.push({

  label: 'Bull Case',

  data: bestResult.balances,

  tension: 0.3,

borderColor:
    hexToRgba(personColors[colorIndex], 0.55),

  backgroundColor:
    hexToRgba(personColors[colorIndex], 0.25),

  borderWidth: 4,

  pointRadius: 0,
  pointHitRadius: 5,
  pointHoverRadius: 0
});

// BEAR CASE
datasets.push({

  label: 'Bear Case',

  data: worstResult.balances,

  tension: 0.3,

  borderColor:
    hexToRgba(personColors[colorIndex], 0.25),

  backgroundColor:
    hexToRgba(personColors[colorIndex], 0.12),

  borderWidth: 4,

  pointRadius: 0,
  pointHitRadius: 5,
  pointHoverRadius: 0
});
}
}

// PERSON CARD SCENARIOS

let bullCardResult = simulateInvestment(
  initial,
  monthly,
  years,
  personIncreaseRate,
  personReturnRate + scenarioRange,
  personStartOffset,
  personStopOffset
);

let bearCardResult = simulateInvestment(
  initial,
  monthly,
  years,
  personIncreaseRate,
  personReturnRate - scenarioRange,
  personStartOffset,
  personStopOffset
);

// APPLY INFLATION TO CARD VALUES

if (useInflation) {

  const inflationMultiplier =
    Math.pow(1 + inflationRate, years);

  bullCardResult.finalBalance =
    bullCardResult.finalBalance / inflationMultiplier;

  bearCardResult.finalBalance =
    bearCardResult.finalBalance / inflationMultiplier;
}

// SMALL RESULTS
const cardHTML = `

<div
  class="results-section
    ${
      highlightedTarget == id
        ? 'highlighted-person'
        : ''
    }
  "

  style="
    --highlight-color:
      ${personColors[colorIndex]};
  "
>

  <div
    style="
      display:flex;
      justify-content:space-between;
      align-items:center;
      margin-bottom:8px;
    "
  >

    <h3 class="results-title person-result-title">

      <span
        class="person-color"
        style="background:${personColors[colorIndex]}"
      ></span>

      ${escapeHTML(name)}

    </h3>

    <div
  style="
    display:flex;
    flex-direction:row;
    gap:6px;
    align-items:center;
  "
>

${
  people.length > 1 && highlightedTarget === null
    ? `

    <!-- HOUSEHOLD BUTTON -->

    <button
      onclick="toggleHouseholdMember(${id})"

      style="
        padding:7px 10px;
        font-size:12px;
        font-weight:600;

        background:${btnDefaultBg};
        color:${btnDefaultColor};

        border:none;
        border-radius:7px;

        cursor:pointer;

        transition:var(--anim-fast);
      "

      onmouseover="
        this.style.background =
          ${
            householdMembers.includes(Number(id))
              ? `'rgba(239,68,68,0.12)'`
              : `'rgba(16,185,129,0.12)'`
          };

        this.style.color =
          ${
            householdMembers.includes(Number(id))
              ? `'#dc2626'`
              : `'#059669'`
          };
      "

      onmouseout="
        const dark = document.body.classList.contains('dark-mode');
        this.style.background = dark ? '#374151' : '#e2e8f0';
        this.style.color = dark ? '#e2e8f0' : '#1e293b';
      "
    >
      ${
        householdMembers.includes(Number(id))
          ? 'Exclude from Household'
          : 'Include in Household'
      }
    </button>

    `
    : ''
}


</div>

  </div>

  <div class="results small-results">

    ${
      highlightedTarget == id && showScenarios
        ? `

        <div class="card">
          <h3>Bull Case</h3>
          <p>
            ${getCurrency()}${formatCurrency(
              bullCardResult.finalBalance
            )}
          </p>
        </div>

        <div class="card">
          <h3>Base Case</h3>
          <p>
            ${getCurrency()}${formatCurrency(result.finalBalance)}
          </p>
        </div>

        <div class="card">
          <h3>Bear Case</h3>
          <p>
            ${getCurrency()}${formatCurrency(
              bearCardResult.finalBalance
            )}
          </p>
        </div>

        `
        : `

        <div class="card">
          <h3>Total Value</h3>
          <p>
            ${getCurrency()}${formatCurrency(result.finalBalance)}
          </p>
        </div>

        <div class="card">
          <h3>Total Invested</h3>
          <p>
            ${getCurrency()}${formatCurrency(result.totalInvested)}
          </p>
        </div>

        <div class="card">
          <h3>Total Profit</h3>
          <p>
            ${getCurrency()}${formatCurrency(result.totalProfit)}
          </p>
        </div>

        `
    }

  </div>

</div>
`;

if (highlightedTarget == id) {

  highlightedCards.push(cardHTML);

} else {

if (householdMembers.includes(Number(id))) {

  householdCards.push(cardHTML);

} else {

  excludedCards.push(cardHTML);

}

}

}); // CLOSE people.forEach

// UPDATE PORTFOLIO SUMMARY (for expansion chart)
portfolioSummaryData = {
  total: combinedFinal,
  people: Array.from(people).map(el => {
    const pid = Number(el.id.split('-')[1]);
    return {
      id: pid,
      name: document.getElementById('name-' + pid)?.value.trim() || 'Person ' + pid,
      color: el.dataset.color || personColors[(pid - 1) % personColors.length],
      balance: personFinalBalances[pid] || 0,
    };
  }).sort((a, b) => b.balance - a.balance),
};

// COMPUTE BREAK-EVEN YEAR FOR PROFIT ANALYSIS
if (analysisTab === 'profit' && highlightedTarget !== null) {
  const portfolioData = highlightedTarget === 'combined' ? householdBalances : (highlightedPortfolioBalances || []);
  const investedData = highlightedTarget === 'combined' ? combinedInvestedBalances : highlightedInvestedBalances;
  for (let i = 0; i < portfolioData.length; i++) {
    if (investedData[i] > 0 && portfolioData[i] >= investedData[i] * 2) {
      breakEvenYear = i + 1;
      break;
    }
  }
}

const currentAge = parseInt(document.getElementById('currentAge')?.value) || 30;
const retirementYear = !(document.getElementById('statePensionEnabled')?.checked ?? true)
  ? null
  : (parseInt(document.getElementById('retirementAge')?.value) || 67) - currentAge;

const peopleDataForTimeline = [];
people.forEach(personElement => {
  const pid = Number(personElement.id.split('-')[1]);
  const colorIndex = (pid - 1) % personColors.length;
  const nameEl = document.getElementById(`name-${pid}`);
  if (nameEl) {
    peopleDataForTimeline.push({
      name: nameEl.value.trim() || `Person ${pid}`,
      color: personColors[colorIndex],
      balances: personElement._timelineBalances || [],
      id: pid
    });
  }
});

let timelinePeople = [];
let timelineHousehold = null;

if (highlightedTarget === null) {
  timelinePeople = [...peopleDataForTimeline];
  timelineHousehold = householdMembers.length > 1 ? householdBalances : null;
} else if (highlightedTarget === 'combined') {
  timelinePeople = peopleDataForTimeline.filter(p => householdMembers.includes(p.id));
  timelineHousehold = [...householdBalances];
} else {
  timelinePeople = peopleDataForTimeline.filter(p => p.id === highlightedTarget);
  timelineHousehold = null;
}


let combinedCardHTML = '';

if (people.length > 1) {

  const householdIsEmpty = householdMembers.length === 0;

  combinedCardHTML = `

  <div
    class="results-section household-box
      ${
        highlightedTarget === 'combined'
          ? 'highlighted-person'
          : ''
      }
    "

    style="
      --highlight-color: #374151;
      border: 2px solid var(--color-border);
      border-radius: 14px;
      padding: 16px;
      margin-bottom: 22px;
      ${householdIsEmpty ? 'width: 100%; box-sizing: border-box;' : ''}
    "
  >

    <div
      style="
        display:flex;
        justify-content:space-between;
        align-items:center;
        margin-bottom:${householdIsEmpty ? '0' : '8px'};
      "
    >

      <h3 class="results-title person-result-title">

        <div style="display:flex;align-items:center;flex-shrink:0;">
          ${householdMembers.slice(0, 5).map((mid, i) =>
            `<div style="width:12px;height:12px;border-radius:50%;flex-shrink:0;
              background:${personColors[(mid - 1) % personColors.length]};
              ${i > 0 ? 'margin-left:-4px;' : ''}
              box-shadow:0 0 0 2px var(--bg-panel);"></div>`
          ).join('')}
        </div>

        Household Portfolio

      </h3>


    </div>

    ${
      !householdIsEmpty
        ? `<div class="results small-results">

            ${
              highlightedTarget === 'combined' && showScenarios
                ? `
                  <div class="card">
                    <h3>Bull Case</h3>
                    <p>${getCurrency()}${formatCurrency(householdBullFinal)}</p>
                  </div>

                  <div class="card">
                    <h3>Base Case</h3>
                    <p>${getCurrency()}${formatCurrency(householdFinal)}</p>
                  </div>

                  <div class="card">
                    <h3>Bear Case</h3>
                    <p>${getCurrency()}${formatCurrency(householdBearFinal)}</p>
                  </div>
                  `
                : `
                  <div class="card">
                    <h3>Total Value</h3>
                    <p>${getCurrency()}${formatCurrency(householdFinal)}</p>
                  </div>

                  <div class="card">
                    <h3>Total Invested</h3>
                    <p>${getCurrency()}${formatCurrency(householdInvested)}</p>
                  </div>

                  <div class="card">
                    <h3>Total Profit</h3>
                    <p>${getCurrency()}${formatCurrency(householdProfit)}</p>
                  </div>
                  `
            }

          </div>`
        : ''
    }

  </div>
  `;
}

// =========================
// RENDER PERSON SECTIONS
// =========================

if (highlightedTarget === 'combined' || highlightedTarget !== null) {

  // ANALYSIS MODE — top summary bar has all the data
  personResults.innerHTML = '';

} else {

  // NORMAL VIEW
  const showHouseholdWrapper = people.length > 1;

  if (!showHouseholdWrapper) {

    // SINGLE PERSON — compact strip
    const sp = people[0];
    const spId = Number(sp.id.split('-')[1]);
    const spName = document.getElementById(`name-${spId}`)?.value.trim() || `Person ${spId}`;
    const spColor = personColors[(spId - 1) % personColors.length];
    personResults.innerHTML = `
      <div class="single-person-strip">
        <span class="strip-dot" style="background:${spColor};"></span>
        <span class="strip-name">${escapeHTML(spName)}</span>
      </div>`;

  } else {

    // MULTI-PERSON — household wrapper unchanged
    personResults.innerHTML = `
 ${
      householdCards.length > 0
        ? `<div class="household-wrapper" style="
            border: 2px solid rgba(55, 65, 81, 0.18);
            border-radius: 18px;
            padding: 18px;
            background: var(--bg-card);
            margin-bottom: 24px;">
            ${combinedCardHTML}
            <div style="margin-top:14px;">${householdCards.join('')}</div>
          </div>`
        : ''
    }
  <div style="padding: 0 18px;">${excludedCards.join('')}</div>
  ${householdCards.length === 0 ? combinedCardHTML : ''}
`;

  }

}

// TOP SUMMARY

if (highlightedTarget === 'combined') {

  highlightedScenarioData = {

   bull: householdBullFinal,
base: householdFinal,
bear: householdBearFinal,
invested: householdInvested,
profit: householdProfit 
  };
}

if (highlightedTarget !== null && highlightedScenarioData) {

  // SHOW HIGHLIGHTED PERSON TOTALS

  
let highlightedPersonName =
  highlightedTarget === 'combined'
    ? 'Household Portfolio'
    : document.getElementById(
        `name-${highlightedTarget}`
      )?.value || `Person ${highlightedTarget}`;

let dotHTML = '';
if (highlightedTarget === 'combined') {
  const dots = householdMembers.slice(0, 5).map((mid, di) =>
    `<div style="width:12px;height:12px;border-radius:50%;background:${personColors[(mid-1)%personColors.length]};
      flex-shrink:0;${di > 0 ? 'margin-left:-4px;' : ''}box-shadow:0 0 0 2px var(--bg-panel);"></div>`
  ).join('');
  dotHTML = `<div style="display:flex;align-items:center;flex-shrink:0;">${dots}</div>`;
} else {
  const col = personColors[(highlightedTarget - 1) % personColors.length];
  dotHTML = `<span class="person-color" style="background:${col};width:12px;height:12px;flex-shrink:0;"></span>`;
}

renderTopSummary(
  highlightedPersonName,
  dotHTML,
  highlightedScenarioData,
  useInflation
);

// ANALYSIS TAB BUTTONS
const analysisTabsEl = document.getElementById('analysisTabs');
if (analysisTabsEl) {
  analysisTabsEl.innerHTML = `
    <div style="display:flex;gap:8px;margin:14px 0 2px;padding:0 2px;justify-content:center;">
      <button class="analysis-tab-btn${analysisTab === 'retirement' ? ' active' : ''}" onclick="setAnalysisTab('retirement')">Retirement Planner</button>
      <button class="analysis-tab-btn${analysisTab === 'profit' ? ' active' : ''}" onclick="setAnalysisTab('profit')">Profit Analysis</button>
      <button class="analysis-tab-btn${analysisTab === 'milestones' ? ' active' : ''}" onclick="setAnalysisTab('milestones')">Milestones</button>
    </div>`;
}

if (analysisTab === 'retirement') {

// RETIREMENT TABLE
const retirementAge =
  parseInt(document.getElementById('retirementAge')?.value) || 67;

const noStatePension =
  !(document.getElementById('statePensionEnabled')?.checked ?? true);

const withdrawalGoal =
  parseFloat(document.getElementById('withdrawalGoal')?.value) || 0;

const withdrawalRate =
  parseFloat(document.getElementById('withdrawalRate')?.value) || 4;

// GET INITIAL/MONTHLY FOR HIGHLIGHTED TARGET
let retInitial = 0;
let retMonthly = 0;

if (highlightedTarget === 'combined') {

  people.forEach(personElement => {
    const pid = Number(personElement.id.split('-')[1]);
    if (householdMembers.includes(pid)) {
      retInitial += parseFloat(document.getElementById(`initial-${pid}`).value) || 0;
      retMonthly += parseFloat(document.getElementById(`monthly-${pid}`).value) || 0;
    }
  });

} else {

  retInitial = parseFloat(document.getElementById(`initial-${highlightedTarget}`)?.value) || 0;
  retMonthly = parseFloat(document.getElementById(`monthly-${highlightedTarget}`)?.value) || 0;

}

const retirementColor =
  highlightedTarget === 'combined'
    ? '#374151'
    : personColors[(highlightedTarget - 1) % personColors.length];

const retReturnRate = perPersonReturnMode && highlightedTarget !== 'combined'
  ? parsePersonReturnRate(document.getElementById(`returnRate-${highlightedTarget}`)?.value) / 100
  : returnRate;

const statePensionIncome =
  parseFloat(document.getElementById('statePensionIncome')?.value) || 0;

const additionalIncomeSources = _getRetirementSettingsFromDOM().additionalIncomeSources || [];

document.getElementById('personResults').innerHTML +=
  renderRetirementTable(
    retInitial,
    retMonthly,
    increaseRate,
    retReturnRate,
    scenarioRange,
    useInflation,
    inflationRate,
    currentAge,
    retirementAge,
    withdrawalGoal,
    withdrawalRate,
    retirementColor,
    noStatePension,
    statePensionIncome,
    additionalIncomeSources
  );

  // If onboarding blur is active, re-apply immediately to the new DOM element
  // (personResults.innerHTML resets inline styles — this prevents any flash of unblurred content)
  if (_retBlurActive && !_retAnimating) {
    const _blurAC = document.querySelector('.retirement-analytics-card');
    if (_blurAC) {
      _blurAC.style.transition    = 'none';
      _blurAC.style.filter        = 'blur(2px)';
      _blurAC.style.opacity       = '0.55';
      _blurAC.style.pointerEvents = 'none';
      _blurAC.style.boxShadow     = 'inset 0 0 0 2000px rgba(0,0,0,0.03)';
    }
  }

  // Show onboarding overlay if setup not yet complete
  setTimeout(checkRetirementSetupOverlay, 350);

} // end if (analysisTab === 'retirement')

if (analysisTab === 'profit') {
  const totalInvestedProfit = highlightedScenarioData.invested;
  const totalProfitVal = highlightedScenarioData.profit;
  const finalVal = highlightedScenarioData.base;
  const returnMultiple = totalInvestedProfit > 0 ? (finalVal / totalInvestedProfit) : 0;
  const profitPctStat = totalInvestedProfit > 0 ? ((totalProfitVal / totalInvestedProfit) * 100) : 0;
  const profitPositive = totalProfitVal >= 0;
  const _profitPersonColor = highlightedTarget === 'combined'
    ? (document.body.classList.contains('dark-mode') ? '#9ca3af' : '#374151')
    : personColors[(highlightedTarget - 1) % personColors.length];

  const _breakEvenNote = breakEvenYear !== null
    ? '<div style="border-left:3px solid #10b981;padding:10px 14px;background:rgba(16,185,129,0.07);border-radius:0 8px 8px 0;font-size:13px;color:var(--color-text);margin-bottom:14px;">Your profits match your total investment in <strong>Year ' + getDisplayYear(breakEvenYear) + '</strong></div>'
    : '';

  const _balances = highlightedTarget === 'combined'
    ? (householdBalances || [])
    : (highlightedPortfolioBalances || []);
  const _monthly = highlightedTarget !== 'combined'
    ? parseFloat(document.getElementById('monthly-' + highlightedTarget)?.value) || 0
    : 0;

  const profitCardsHTML = _breakEvenNote
    + '<div class="profit-analytics-card" id="profitAnalyticsCard">'
    + '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px;padding-bottom:16px;border-bottom:1px solid var(--color-border);">'
    + '<div>'
    + '<div style="font-size:22px;font-weight:700;letter-spacing:0.4px;color:var(--color-text-title);margin-bottom:4px;">Profit Analysis</div>'
    + '<div style="font-size:13px;font-weight:400;color:var(--color-text-muted);">Investment growth and capital allocation</div>'
    + '</div>'
    + '<div style="text-align:right;flex-shrink:0;margin-left:16px;">'
    + '<div style="font-size:10px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:var(--color-text-muted);margin-bottom:4px;">Current Portfolio Value</div>'
    + '<div style="font-size:24px;font-weight:700;color:var(--color-text-title);">' + getCurrency() + formatCurrency(finalVal) + '</div>'
    + '</div>'
    + '</div>'
    + '<div class="profit-analytics-body">'
    + '<div class="profit-kpi-column" id="profitKpiColumn"></div>'
    + '<div class="profit-chart-column">'
    + '<div class="profit-chart-glow" id="profitChartGlow"></div>'
    + '<div id="profitDonutWrap" class="profit-donut-wrap">'
    + '<canvas id="profitDonutCanvas" width="360" height="360"></canvas>'
    + '<div class="profit-donut-center">'
    + '<div id="profitStatusBadge" class="profit-status-badge"></div>'
    + '<div class="profit-donut-center-lbl" id="profitDonutCenterLbl">CURRENT PORTFOLIO</div>'
    + '<div class="profit-donut-center-val" id="profitDonutCenterVal">' + getCurrency() + '0</div>'
    + '<div class="profit-donut-center-pct" id="profitDonutCenterPct"></div>'
    + '</div></div></div>'
    + '<div class="profit-insights-column" id="profitInsightsColumn"></div>'
    + '</div></div>';

  document.getElementById('personResults').innerHTML += profitCardsHTML;
  renderProfitDonut(totalInvestedProfit, totalProfitVal, finalVal, _profitPersonColor, years,
    { balances: _balances, monthly: _monthly });
}

if (analysisTab === 'milestones') {
  renderMilestoneTabContent(timelinePeople, timelineHousehold, years, retirementYear, useInflation);
}

} else {

  analysisTab = 'profit';
  const analysisTabsEl = document.getElementById('analysisTabs');
  if (analysisTabsEl) analysisTabsEl.innerHTML = '';

  const _allPids = Array.from(people).map(p => Number(p.id.split('-')[1]));
  const _splitCardHTML = people.length > 1
    ? '<div class="card portfolio-split-card" title="Click to expand portfolio breakdown" onclick="openPortfolioExpansion()" style="width:72px;height:72px;flex-shrink:0;padding:8px;border-radius:12px;display:flex;align-items:center;justify-content:center;">'
      + '<div style="width:100%;height:100%;border-radius:50%;'
      + 'background:' + buildMiniPie(_allPids) + ';'
      + 'box-shadow:0 0 0 2px var(--bg-panel),0 0 0 3px var(--color-border);">'
      + '</div></div>'
    : '';

  combinedResults.innerHTML = `

    <div class="results-section">

      <h2 class="results-title">

        ${people.length === 1 ? 'Portfolio Summary' : "Combined Portfolio's"}

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

  // SHOW PERSON RESULTS BELOW GRAPH
  personResults.style.display = 'block';

  // COMBINED GRAPH LINE

 if (people.length > 1) {

  // ANALYZING HOUSEHOLD
  if (highlightedTarget === 'combined') {

    if (showScenarios) datasets.push({

      label: 'Bull Case',

      data: householdBullBalances,

      tension: 0.3,

      borderColor: document.body.classList.contains('dark-mode') ? 'rgba(156, 163, 175, 0.55)' : 'rgba(55, 65, 81, 0.45)',

      backgroundColor: document.body.classList.contains('dark-mode') ? 'rgba(156, 163, 175, 0.15)' : 'rgba(55, 65, 81, 0.12)',

      borderWidth: 4,

      pointRadius: 0,
      pointHitRadius: 5,
      pointHoverRadius: 0
    });

    datasets.push({

      label: showScenarios ? 'Base Case' : analysisTab === 'profit' ? 'Household — Portfolio Value' : 'Household Portfolio',

      data: householdBalances,

      tension: 0.3,

      borderColor: document.body.classList.contains('dark-mode') ? '#9ca3af' : '#374151',

      backgroundColor: document.body.classList.contains('dark-mode') ? '#9ca3af' : '#374151',

      borderWidth: 5,

      pointRadius: 0,
      pointHitRadius: 5,
      pointHoverRadius: 0
    });

    if (showScenarios) datasets.push({

      label: 'Bear Case',

      data: householdBearBalances,

      tension: 0.3,

      borderColor: document.body.classList.contains('dark-mode') ? 'rgba(156, 163, 175, 0.3)' : 'rgba(55, 65, 81, 0.25)',

      backgroundColor: document.body.classList.contains('dark-mode') ? 'rgba(156, 163, 175, 0.08)' : 'rgba(55, 65, 81, 0.08)',

      borderWidth: 4,

      pointRadius: 0,
      pointHitRadius: 5,
      pointHoverRadius: 0
    });

  } else if (householdMembers.length > 1) {

    // NORMAL HOUSEHOLD LINE ONLY
    datasets.push({

      label: 'Household',

      data: householdBalances,

      tension: 0.3,

     borderColor:
  highlightedTarget === null
    ? (document.body.classList.contains('dark-mode') ? 'rgba(156, 163, 175, 0.9)' : 'rgba(55, 65, 81, 0.75)')
    : 'rgba(203, 213, 225, 0.35)',

backgroundColor:
  highlightedTarget === null
    ? (document.body.classList.contains('dark-mode') ? 'rgba(156, 163, 175, 0.9)' : 'rgba(55, 65, 81, 0.75)')
    : 'rgba(203, 213, 225, 0.35)',

borderWidth:
  highlightedTarget === null
    ? 4
    : 2,

      pointRadius: 0,
      pointHitRadius: 5,
      pointHoverRadius: 0
    });

  }
}

// PROFIT ANALYSIS — dotted invested line overlay
if (analysisTab === 'profit' && highlightedTarget !== null) {
  const isDark = document.body.classList.contains('dark-mode');
  const isHousehold = highlightedTarget === 'combined';
  const investedData = isHousehold ? combinedInvestedBalances : highlightedInvestedBalances;
  const lineColor = isHousehold
    ? (isDark ? '#9ca3af' : '#374151')
    : personColors[(highlightedTarget - 1) % personColors.length];
  const investedName = isHousehold
    ? 'Household'
    : (document.getElementById(`name-${highlightedTarget}`)?.value?.trim() || `Person ${highlightedTarget}`);

  datasets.push({
    label: investedName + ' — Invested Capital',
    data: investedData,
    borderColor: hexToRgba(lineColor, 0.7),
    backgroundColor: hexToRgba(lineColor, 0.07),
    borderDash: [6, 4],
    borderWidth: 2,
    tension: 0.3,
    pointRadius: 0,
    pointHitRadius: 5,
    pointHoverRadius: 0,
    fill: false
  });
}

// PROFIT ANALYSIS — reorder datasets for shaded fill between portfolio and invested
if (analysisTab === 'profit' && highlightedTarget !== null) {
  const isDark = document.body.classList.contains('dark-mode');
  const rawColor = highlightedTarget === 'combined'
    ? (isDark ? '#9ca3af' : '#374151')
    : personColors[(highlightedTarget - 1) % personColors.length];
  const fillColor = hexToRgba(rawColor, isDark ? 0.10 : 0.07);
  const investedIdx  = datasets.findIndex(d => d.label && d.label.endsWith('— Invested Capital'));
  const portfolioIdx = datasets.findIndex(d => (d.borderWidth || 0) >= 5);
  if (investedIdx !== -1 && portfolioIdx !== -1) {
    const [investedDs] = datasets.splice(investedIdx, 1);
    investedDs.fill = false;
    const newPortfolioIdx = datasets.findIndex(d => (d.borderWidth || 0) >= 5);
    datasets.splice(newPortfolioIdx, 0, investedDs);
    const portfolioDs = datasets[newPortfolioIdx + 1];
    portfolioDs.fill = {target: newPortfolioIdx};
    portfolioDs.backgroundColor = fillColor;
  }
}

  // X LABELS
  const labels = [];

  for (let i = 1; i <= years; i++) {
    labels.push(getDisplayYearLabel(i));
  }

 // CREATE CHART FIRST TIME
if (!chart) {

  chart = new Chart(
    document.getElementById('investmentChart'),
    {
      type: 'line',

      data: {
        labels: labels,
        datasets: datasets
      },

      options: {

  responsive: true,
  maintainAspectRatio: false,

 interaction: {
  mode: 'nearest',
  intersect: false,
  axis: 'x'
},
        animation: {
          duration: 1200,
          easing: 'easeOutCubic'
        },

      plugins: {

tooltip: {

  backgroundColor: 'rgba(0,0,0,0)',
  borderColor: 'rgba(0,0,0,0)',
  padding: 0,
  caretSize: 0,
  boxWidth: 0,
  boxHeight: 0,
  displayColors: false,

  callbacks: {
    title: function() { return ''; },
    label: function() { return ''; },
    afterLabel: function() { return ''; }
  },

  filter: function(tooltipItem) {

  if (highlightedTarget === null) {
    return true;
  }

  const label = tooltipItem.dataset.label;

  if (!showScenarios) {
    if (analysisTab === 'profit') {
      return label && (label.endsWith('— Portfolio Value') || label.endsWith('— Invested Capital'));
    }
    const targetLabel = highlightedTarget === 'combined'
      ? 'Household Portfolio'
      : (document.getElementById(`name-${highlightedTarget}`)?.value?.trim() || `Person ${highlightedTarget}`);
    return label === targetLabel;
  }

  return (
    label === 'Base Case' ||
    label === 'Bull Case' ||
    label === 'Bear Case' ||
    (label && label.endsWith('— Invested Capital'))
  );
},

  itemSort: function(a, b) {

    if (highlightedTarget === null) {
      return 0;
    }

    const order = [
      'Bull Case',
      'Base Case',
      'Bear Case'
    ];

    return (
      order.indexOf(a.dataset.label) -
      order.indexOf(b.dataset.label)
    );
  },

  external: function(context) {
    const tooltipEl = document.getElementById('profitTooltip');
    if (!tooltipEl) return;

    const { chart, tooltip } = context;

    if (!tooltip.dataPoints || !tooltip.dataPoints.length) {
      tooltipEl.style.opacity = '0';
      return;
    }

    const isDark = document.body.classList.contains('dark-mode');
    const activeIndex = tooltip.dataPoints[0].dataIndex;
    const yearLabel   = chart.data.labels[activeIndex];
    const displayYear = getStartYear() ? yearLabel : `Year ${yearLabel}`;

    const tPrimary = isDark ? '#ffffff' : '#1e293b';
    const tMuted   = isDark ? '#b8b8b8' : '#475569';
    const tDim     = isDark ? '#606060' : '#94a3b8';
    const tSub     = isDark ? '#8a8a8a' : '#64748b';
    const divider  = isDark ? '#383838' : '#e9ecef';

    const header = `<div style="font-size:10px;color:${tDim};margin-bottom:8px;letter-spacing:0.06em;text-transform:uppercase;font-weight:600;">${displayYear}</div>`;

    let body = '';

    if (analysisTab === 'profit' && highlightedTarget !== null) {
      const portfolioDs = chart.data.datasets.find(d => (d.borderWidth || 0) >= 5);
      const investedDs  = chart.data.datasets.find(d => d.label && d.label.endsWith('— Invested Capital'));
      if (!portfolioDs || !investedDs) { tooltipEl.style.opacity = '0'; return; }

      const portfolioVal   = portfolioDs.data[activeIndex] || 0;
      const investedVal    = investedDs.data[activeIndex]  || 0;
      const profit         = portfolioVal - investedVal;
      const profitPositive = profit >= 0;
      const personColor    = typeof portfolioDs.borderColor === 'string' ? portfolioDs.borderColor : '#888888';

      body = `
        <div style="display:flex;justify-content:space-between;align-items:center;gap:14px;margin-bottom:5px;">
          <div style="display:flex;align-items:center;gap:7px;">
            <div style="width:9px;height:9px;border-radius:50%;background:${personColor};flex-shrink:0;"></div>
            <span style="font-size:12px;color:${tMuted};">Portfolio</span>
          </div>
          <span style="font-size:13px;font-weight:600;color:${tPrimary};">${getCurrency()}${formatCurrency(portfolioVal)}</span>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;gap:14px;margin-bottom:8px;">
          <div style="display:flex;align-items:center;gap:7px;">
            <svg width="10" height="8" viewBox="0 0 10 8" style="flex-shrink:0;opacity:0.7;"><line x1="0" y1="4" x2="10" y2="4" stroke="${personColor}" stroke-width="2" stroke-dasharray="3 2"/></svg>
            <span style="font-size:12px;color:${tDim};">Invested</span>
          </div>
          <span style="font-size:12px;font-weight:500;color:${tSub};">${getCurrency()}${formatCurrency(investedVal)}</span>
        </div>
        <div style="border-top:1px solid ${divider};padding-top:6px;display:flex;justify-content:space-between;align-items:center;gap:14px;">
          <span style="font-size:12px;color:${tDim};">Profit</span>
          <span style="font-size:13px;font-weight:700;color:${profitPositive ? '#10b981' : '#ef4444'};">${profitPositive ? '+' : ''}${getCurrency()}${formatCurrency(profit)}</span>
        </div>`;

    } else {
      body = tooltip.dataPoints.map((dp, i) => {
        const ds = chart.data.datasets[dp.datasetIndex];
        if (!ds) return '';
        const color = typeof ds.borderColor === 'string' ? ds.borderColor : '#888888';
        return `<div style="display:flex;justify-content:space-between;align-items:center;gap:14px;${i < tooltip.dataPoints.length - 1 ? 'margin-bottom:5px;' : ''}">
          <div style="display:flex;align-items:center;gap:7px;">
            <div style="width:9px;height:9px;border-radius:50%;background:${color};flex-shrink:0;"></div>
            <span style="font-size:12px;color:${tMuted};">${escapeHTML(ds.label || '')}</span>
          </div>
          <span style="font-size:13px;font-weight:600;color:${tPrimary};">${getCurrency()}${formatCurrency(dp.parsed.y)}</span>
        </div>`;
      }).join('');
    }

    tooltipEl.innerHTML = header + body;

    // Vertical position set here; horizontal is updated every frame in afterDraw
    const top = Math.max(4, tooltip.caretY - 44);
    tooltipEl.style.top  = top + 'px';
    tooltipEl.style.opacity = '1';
  }
},

  legend: {

  display: true,
  position: 'bottom',

  labels: {

    color: document.body.classList.contains('dark-mode') ? '#b8b8b8' : 'rgba(0,0,0,0.7)',

    usePointStyle: false,

    generateLabels(chart) {

      const original =
        Chart.defaults.plugins.legend.labels
          .generateLabels(chart);

      // FORCE FILLED RECTANGLES
      original.forEach(label => {

        const dataset =
          chart.data.datasets[label.datasetIndex];

        label.fillStyle =
          dataset.backgroundColor;

        label.strokeStyle =
          dataset.borderColor;

        label.lineWidth =
          dataset.borderWidth;

      });

      return original;
    },

    filter: function(legendItem) {

  if (highlightedTarget === null) {
    return true;
  }

  const label = legendItem.text;

  if (!showScenarios) {
    if (analysisTab === 'profit') {
      return label && (label.endsWith('— Portfolio Value') || label.endsWith('— Invested Capital'));
    }
    const targetLabel = highlightedTarget === 'combined'
      ? 'Household Portfolio'
      : (document.getElementById(`name-${highlightedTarget}`)?.value?.trim() || `Person ${highlightedTarget}`);
    return label === targetLabel;
  }

  return (
    label === 'Base Case' ||
    label === 'Bull Case' ||
    label === 'Bear Case' ||
    (label && label.endsWith('— Invested Capital'))
  );

},

    sort: function(a, b) {

      if (highlightedTarget === null) {
        return 0;
      }

      const order = [
  'Bull Case',
  'Base Case',
  'Bear Case'
];

      return (
        order.indexOf(a.text) -
        order.indexOf(b.text)
      );
    }
  }
}
},

        scales: {

          x: {
            title: {
              display: true,
              text: getStartYear() ? 'Year' : 'Years'
            }
          },

          y: {

            beginAtZero: true,

            title: {
              display: true,
              text: `Portfolio Value (${getCurrency()})`,
              color: document.body.classList.contains('dark-mode') ? '#b8b8b8' : 'rgba(0,0,0,0.7)'
            },

            ticks: {
              color: document.body.classList.contains('dark-mode') ? '#b8b8b8' : 'rgba(0,0,0,0.7)',
              callback: function(value) {
                return getCurrency() + formatCurrency(value);
              }
            }
          }
        }
      }
    }
  );

} else {

// UPDATE EXISTING CHART
chart.data.labels = labels;
chart.data.datasets = datasets;

// DYNAMIC Y-AXIS SCALING

let visibleMax = 0;

// IGNORE COMBINED LINE WHEN ANALYZING
datasets.forEach(dataset => {

  // ANALYSIS MODE
  if (highlightedTarget !== null) {
    if (showScenarios) {
      const allowedLabels = ['Bull Case', 'Base Case', 'Bear Case'];
      if (!allowedLabels.includes(dataset.label)) { return; }
    } else {
      if (analysisTab === 'profit') {
        if (!dataset.label || !dataset.label.endsWith('— Portfolio Value')) { return; }
      } else {
        const targetLabel = highlightedTarget === 'combined'
          ? 'Household Portfolio'
          : (document.getElementById(`name-${highlightedTarget}`)?.value?.trim() || `Person ${highlightedTarget}`);
        if (dataset.label !== targetLabel) { return; }
      }
    }
  }

  const datasetMax =
    Math.max(...dataset.data);

  visibleMax =
    Math.max(visibleMax, datasetMax);

});

visibleMax = visibleMax * 1.1;

chart.options.scales.y = {

  beginAtZero: true,

  max: visibleMax,

  title: {
    display: true,
    text: `Portfolio Value (${getCurrency()})`,
    color: document.body.classList.contains('dark-mode') ? '#b8b8b8' : 'rgba(0,0,0,0.7)'
  },

  ticks: {
    color: document.body.classList.contains('dark-mode') ? '#b8b8b8' : 'rgba(0,0,0,0.7)',
    callback: function(value) {
      return getCurrency() + formatCurrency(value);
    }
  }
};

// FORCE COMPLETE RECALCULATION
updateChartColors();
chart.options.plugins.legend.display = highlightedTarget === null;
chart.update();

// AUTO-SAVE CURRENT ACCOUNT
saveActivePlanIfAny();
renderPlansBar();

}

}

function toggleDarkMode(enabled) {
  document.body.classList.toggle('dark-mode', enabled);
  localStorage.setItem('investment_darkMode', enabled ? '1' : '0');
  document.getElementById('dropdownDarkModeTrack')?.style.setProperty('background', enabled ? 'var(--accent)' : '#cbd5e1');
  document.getElementById('dropdownDarkModeThumb')?.style.setProperty('left', enabled ? '23px' : '3px');
  if (document.getElementById('dropdownDarkModeToggle')) document.getElementById('dropdownDarkModeToggle').checked = enabled;
  document.getElementById('accountDropdown')?.remove();
  document.getElementById('accountDropdownBackdrop')?.remove();
  updateChartColors();
  recolorPersonCards();
  renderPlansPanel();
  calculateInvestment();
}

function recolorPersonCards() {
  const isDark = document.body.classList.contains('dark-mode');
  document.querySelectorAll('.person-card[data-color]').forEach(card => {
    const color = card.getAttribute('data-color');
    if (isDark) {
      card.style.background = hexToRgba(color, 0.28);
      card.style.borderColor = hexToRgba(color, 0.5);
    } else {
      card.style.background = `color-mix(in srgb, ${color} 12%, white)`;
      card.style.borderColor = `color-mix(in srgb, ${color} 25%, #dbe4ee)`;
    }
  });
}

function updateChartColors() {
  if (!chart) return;
  const isDark = document.body.classList.contains('dark-mode');
  const textColor = isDark ? '#b8b8b8' : 'rgba(0,0,0,0.7)';
  const gridColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.1)';

  chart.options.plugins.legend.labels.color = textColor;
  chart.options.scales.x.ticks = { ...chart.options.scales.x.ticks, color: textColor };
  chart.options.scales.x.title.color = textColor;
  chart.options.scales.y.ticks = { ...chart.options.scales.y.ticks, color: textColor };
  chart.options.scales.y.title.color = textColor;
  chart.options.scales.x.grid = { color: gridColor };
  chart.options.scales.y.grid = { color: gridColor };
  chart.update();
}

function updateLockState() {
  const hasActivePlan = !!(activePlanId && plans[activePlanId]);
  document.body.classList.toggle('app-locked', !hasActivePlan);
}

// APPLY CHART COLORS AFTER CHART IS CREATED
window.addEventListener('load', () => {
  updateChartColors();
  recolorPersonCards();
  if (chart) chart.update();
});

document.addEventListener('click', function(e) {
  const panel = document.getElementById('plansPanel');
  if (!panel) return;
  if (!panel.classList.contains('open')) return;
  if (!activePlanId) return;
  const plansPanelWrapper = panel.closest('.panel');
  if (plansPanelWrapper && !plansPanelWrapper.contains(e.target)) {
    closePlansPanel();
  }
});

// SCROLL INDICATOR — show scrollbar only while scrolling
(function() {
  const timers = new WeakMap();
  function attachScrollFade(el) {
    if (!el) return;
    el.addEventListener('scroll', () => {
      el.classList.add('scrolling');
      clearTimeout(timers.get(el));
      timers.set(el, setTimeout(() => el.classList.remove('scrolling'), 1000));
    }, { passive: true });
  }
  document.addEventListener('DOMContentLoaded', () => {
    attachScrollFade(document.querySelector('.people-column'));
    attachScrollFade(document.querySelector('.settings-scroll-area'));
    attachScrollFade(document.querySelector('.right-column'));
  });
  // Fallback if DOM already ready
  attachScrollFade(document.querySelector('.people-column'));
  attachScrollFade(document.querySelector('.settings-scroll-area'));
  attachScrollFade(document.querySelector('.right-column'));
})();

// LOAD SAVED ACCOUNTS (if any) and ensure at least one person
loadPlansFromStorage();

// Auto-import if page was opened with a ?plan= link
(function() {
  const params = new URLSearchParams(window.location.search);
  const encoded = params.get('plan');
  if (encoded) {
    try {
      const plan = decodeAndValidateSharedPlan(encoded);
      if (Object.keys(plans).length < 10) {
        const id = 'shared_' + Date.now();
        plan.name = plan.name ? `${plan.name} (imported)` : 'Imported Plan';
        plans[id] = plan;
        activePlanId = id;
        savePlansToStorage();
        loadPlan(id);
      }
    } catch(e) {}
    window.history.replaceState({}, '', window.location.pathname);
  }
})();

updateLockState();
if (!activePlanId) {
  const p = document.getElementById('plansPanel');
  const toggleBtn = document.getElementById('plansToggleBtn');
  if (p) {
    p.classList.add('open');
    const inner = p.firstElementChild;
    p.style.maxHeight = (inner ? inner.scrollHeight + 24 : 200) + 'px';
  }
  if (toggleBtn) toggleBtn.style.display = 'none';
}

if (document.querySelectorAll('.person-card').length === 0) {
  addPerson();
}

// SET INITIAL VISIBILITY
const inflationSettings =
  document.getElementById('inflationSettings');
inflationSettings.style.maxHeight = '0';
inflationSettings.style.opacity = '0';

// INITIAL CALCULATION
calculateInvestment();
updateDeleteButtons();

// TOOLTIP + CROSSHAIR — clear reliably on cursor exit
function clearCrosshairAndTooltip() {
  crosshairVisible = false;
  crosshairX = null;
  crosshairTargetX = null;
  if (crosshairRafId) { cancelAnimationFrame(crosshairRafId); crosshairRafId = null; }
  const tooltipEl = document.getElementById('profitTooltip');
  if (tooltipEl) tooltipEl.style.opacity = '0';
  if (chart) {
    if (chart.tooltip) chart.tooltip.setActiveElements([], { x: 0, y: 0 });
    chart.update('none');
  }
}

// Both canvas and container — catches fast exits that miss the canvas event
document.getElementById('investmentChart').addEventListener('pointerleave', clearCrosshairAndTooltip);
document.querySelector('.chart-container').addEventListener('pointerleave', clearCrosshairAndTooltip);

