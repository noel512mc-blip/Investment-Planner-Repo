function retirementIncomeAtAge(age, noStatePension, statePensionAge, statePensionIncome, additionalIncomeSources) {
  let incomeTotal = 0;
  if (!noStatePension && statePensionIncome > 0 && age >= statePensionAge) incomeTotal += statePensionIncome;
  for (const source of additionalIncomeSources) {
    if (source.amount > 0 && age >= (source.startAge || 0)) incomeTotal += source.amount;
  }
  return incomeTotal;
}

function calculateRetirementRows(inputs, annualReturnRate) {
  const {
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
    startYear
  } = inputs;

  const yearsToStatePension = noStatePension ? null : (statePensionAge - currentAge);
  const totalYears = noStatePension
    ? Math.max(110 - currentAge, 40)
    : Math.max((yearsToStatePension || 0) + 10, 40);
  const rows = [];
  let balance = initial;
  let currentMonthly = monthly;
  let invested = initial;

  for (let year = 1; year <= totalYears; year++) {
    for (let month = 1; month <= 12; month++) {
      invested += currentMonthly;
      balance  += currentMonthly;
      balance  *= (1 + annualReturnRate / 12);
    }
    currentMonthly *= (1 + increaseRate);
    const adjustedBalance = useInflation ? balance / Math.pow(1 + inflationRate, year) : balance;
    const age = currentAge + year;
    const safeMonthly = (adjustedBalance * withdrawalRate / 100) / 12;
    const effectiveGoalAtAge = Math.max(0, withdrawalGoal - retirementIncomeAtAge(
      age,
      noStatePension,
      statePensionAge,
      statePensionIncome,
      additionalIncomeSources
    ));
    const calendarYear = startYear ? startYear + year - 1 : null;
    rows.push({ year, age, balance: adjustedBalance, safeMonthly,
      goalMet: safeMonthly >= effectiveGoalAtAge, invested, calendarYear });
  }
  return rows;
}