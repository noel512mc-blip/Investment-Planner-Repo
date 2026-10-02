// Rates are decimal fractions. Inputs are already read/validated by the caller.
// This calculation depends only on its inputs and simulateInvestment().
function calculatePersonProjection({
  initial, monthly, years, personIncreaseRate, personReturnRate,
  personStartOffset, personStopOffset, scenarioRange,
  useInflation, inflationRate, isHighlighted
}) {
  const result = simulateInvestment(
    initial,
    monthly,
    years,
    personIncreaseRate,
    personReturnRate,
    personStartOffset,
    personStopOffset
  );

  let bullResult = null;
  let bearResult = null;

  if (isHighlighted) {
    bullResult = simulateInvestment(
      initial,
      monthly,
      years,
      personIncreaseRate,
      personReturnRate + scenarioRange,
      personStartOffset,
      personStopOffset
    );

    bearResult = simulateInvestment(
      initial,
      monthly,
      years,
      personIncreaseRate,
      personReturnRate - scenarioRange,
      personStartOffset,
      personStopOffset
    );

    // Preserve scenario treatment: only final balances are deflated;
    // yearly balances stay nominal and profit subtracts nominal investment.
    if (useInflation) {
      const inflationMultiplier = Math.pow(1 + inflationRate, years);

      bullResult.finalBalance = bullResult.finalBalance / inflationMultiplier;
      bearResult.finalBalance = bearResult.finalBalance / inflationMultiplier;

      bullResult.totalProfit = bullResult.finalBalance - bullResult.totalInvested;
      bearResult.totalProfit = bearResult.finalBalance - bearResult.totalInvested;
    }
  }

  // Preserve base treatment: deflate final/yearly balances and the invested
  // amount used for profit, but return nominal invested totals and history.
  if (useInflation) {
    const inflationMultiplier = Math.pow(1 + inflationRate, years);

    result.finalBalance = result.finalBalance / inflationMultiplier;
    result.totalProfit = result.finalBalance - (result.totalInvested / inflationMultiplier);
    result.balances = result.balances.map((balance, index) => {
      return balance / Math.pow(1 + inflationRate, index + 1);
    });
  }

  return { result, bullResult, bearResult };
}
