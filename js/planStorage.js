function readPlansFromStorage() {
  // One-time migration from old key names
  const oldData = localStorage.getItem('investment_accounts');
  if (oldData && !localStorage.getItem('investment_plans')) {
    localStorage.setItem('investment_plans', oldData);
    localStorage.removeItem('investment_accounts');
  }
  const oldActiveId = localStorage.getItem('investment_activeAccountId');
  if (oldActiveId && !localStorage.getItem('investment_activePlanId')) {
    localStorage.setItem('investment_activePlanId', oldActiveId);
    localStorage.removeItem('investment_activeAccountId');
  }

  let plans;
  try {
    const raw = localStorage.getItem('investment_plans');
    plans = raw ? JSON.parse(raw) : {};
  } catch (e) {
    plans = {};
  }

  const activePlanId = localStorage.getItem('investment_activePlanId') || null;
  return { plans, activePlanId };
}

function writePlansToStorage(plans, activePlanId) {
  try {
    localStorage.setItem('investment_plans', JSON.stringify(plans));
    if (activePlanId) {
      localStorage.setItem('investment_activePlanId', activePlanId);
    } else {
      localStorage.removeItem('investment_activePlanId');
    }
  } catch (e) {
    console.error('Failed to save plans', e);
  }
}