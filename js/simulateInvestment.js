function simulateInvestment(
  initial,
  monthly,
  years,
  increaseRate,
  returnRate,
  startOffset = 1,
  stopOffset = 0
) {

  let balance = 0;
  let totalInvested = 0;
  let currentMonthly = monthly;

  let balances = [];
  let balancesInvested = [];

  for (let year = 1; year <= years; year++) {

    const isActive = year >= startOffset && (stopOffset === 0 || year < stopOffset);

    // Deposit the initial lump sum at the start of the first active year
    if (year === startOffset) {
      balance += initial;
      totalInvested += initial;
    }

    for (let month = 1; month <= 12; month++) {

      if (isActive) {
        balance += currentMonthly;
        totalInvested += currentMonthly;
      }

      if (balance > 0) {
        balance *= (1 + returnRate / 12);
      }
    }

    if (isActive) {
      currentMonthly *= (1 + increaseRate);
    }

    balances.push(balance);
    balancesInvested.push(totalInvested);
  }

  return {
    finalBalance: balance,
    totalInvested: totalInvested,
    totalProfit: balance - totalInvested,
    balances: balances,
    balancesInvested: balancesInvested
  };
}