// Mutates only the supplied accumulator, never the per-person results.
// Base values arrive with any inflation adjustment already applied; bull/bear
// arrive nominal. This function sums them as supplied without changing units.
function accumulateHouseholdProjection(totals, { isMember, result, bullResult, bearResult }) {
  if (!isMember) return totals;

  totals.householdFinal += result.finalBalance;
  totals.householdInvested += result.totalInvested;
  totals.householdProfit += result.totalProfit;

  result.balances.forEach((value, balanceIndex) => {
    totals.householdBalances[balanceIndex] += value;
  });

  totals.householdBullFinal += bullResult.finalBalance;
  totals.householdBearFinal += bearResult.finalBalance;

  bullResult.balances.forEach((value, balanceIndex) => {
    totals.householdBullBalances[balanceIndex] += value;
  });

  bearResult.balances.forEach((value, balanceIndex) => {
    totals.householdBearBalances[balanceIndex] += value;
  });

  return totals;
}
