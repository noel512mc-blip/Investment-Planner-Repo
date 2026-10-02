const MAX_SHARED_PLAN_CHARS = 350000;
const MAX_SHARED_PLAN_BYTES = 256 * 1024;
const MAX_IMPORTED_AMOUNT = 1e12;
const MAX_IMPORTED_PERSON_ID = 1000000;
const SUPPORTED_PLAN_CURRENCIES = new Set(['€', '$', '£', '¥', '₣']);

function isImportedRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function importedNumber(record, key, fallback, minimum, maximum, integer = false) {
  const value = Object.prototype.hasOwnProperty.call(record, key) ? record[key] : fallback;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum || (integer && !Number.isInteger(value))) {
    throw new Error(`Invalid ${key}`);
  }
  return value;
}

function importedBoolean(record, key, fallback) {
  const value = Object.prototype.hasOwnProperty.call(record, key) ? record[key] : fallback;
  if (typeof value !== 'boolean') throw new Error(`Invalid ${key}`);
  return value;
}

function importedText(value, fallback, field, maximumLength) {
  if (value === undefined || value === null || value === '') value = fallback;
  if (typeof value !== 'string' || value.length > maximumLength) throw new Error(`Invalid ${field}`);
  return value;
}

function validateAndNormalizeSharedPlan(value) {
  if (!isImportedRecord(value) || !Array.isArray(value.people) || value.people.length > 10 || !isImportedRecord(value.settings)) {
    throw new Error('Invalid plan structure');
  }

  const sourceSettings = value.settings;
  const settings = {
    years: importedNumber(sourceSettings, 'years', 30, 1, 100, true),
    increaseRate: importedNumber(sourceSettings, 'increaseRate', 2, -1000, 1000),
    returnRate: importedNumber(sourceSettings, 'returnRate', 8, -100, 300),
    perPersonReturn: importedBoolean(sourceSettings, 'perPersonReturn', false),
    useInflation: importedBoolean(sourceSettings, 'useInflation', false),
    inflationRate: importedNumber(sourceSettings, 'inflationRate', 2.5, -50, 100),
    scenarioRange: importedNumber(sourceSettings, 'scenarioRange', 2, -100, 100),
    currentAge: importedNumber(sourceSettings, 'currentAge', 30, 0, 150, true),
    retirementAge: importedNumber(sourceSettings, 'retirementAge', 67, 0, 150, true),
    noStatePension: importedBoolean(sourceSettings, 'noStatePension', false),
    withdrawalGoal: importedNumber(sourceSettings, 'withdrawalGoal', 5000, 0, MAX_IMPORTED_AMOUNT),
    withdrawalRate: importedNumber(sourceSettings, 'withdrawalRate', 4, 0, 100),
    statePensionIncome: importedNumber(sourceSettings, 'statePensionIncome', 0, 0, MAX_IMPORTED_AMOUNT),
    householdMembers: [],
    currency: importedText(sourceSettings.currency, '€', 'currency', 4),
    startYear: importedNumber(sourceSettings, 'startYear', 0, 0, 9999, true)
  };
  if (!SUPPORTED_PLAN_CURRENCIES.has(settings.currency)) throw new Error('Invalid currency');

  const personIds = new Set();
  const people = value.people.map(sourcePerson => {
    if (!isImportedRecord(sourcePerson) || !Number.isSafeInteger(sourcePerson.id) || sourcePerson.id < 1 || sourcePerson.id > MAX_IMPORTED_PERSON_ID) {
      throw new Error('Invalid person ID');
    }
    if (personIds.has(sourcePerson.id)) throw new Error('Duplicate person ID');
    personIds.add(sourcePerson.id);

    const person = {
      id: sourcePerson.id,
      name: importedText(sourcePerson.name, `Person ${sourcePerson.id}`, 'person name', 256),
      initial: importedNumber(sourcePerson, 'initial', 0, -MAX_IMPORTED_AMOUNT, MAX_IMPORTED_AMOUNT),
      monthly: importedNumber(sourcePerson, 'monthly', 0, -MAX_IMPORTED_AMOUNT, MAX_IMPORTED_AMOUNT),
      increaseRate: importedNumber(sourcePerson, 'increaseRate', 2, -1000, 1000),
      startOffset: importedNumber(sourcePerson, 'startOffset', 1, 1, 10000, true),
      stopOffset: importedNumber(sourcePerson, 'stopOffset', 0, 0, 10000, true),
      returnRate: sourcePerson.returnRate === null || sourcePerson.returnRate === undefined
        ? null
        : importedNumber(sourcePerson, 'returnRate', null, -100, 300)
    };

    const sourceRetirement = sourcePerson.retirementSettings;
    if (sourceRetirement !== undefined && !isImportedRecord(sourceRetirement)) throw new Error('Invalid retirement settings');
    const retirement = sourceRetirement || {};
    let incomeSources = retirement.additionalIncomeSources;
    if (incomeSources === undefined) {
      const legacyAmount = importedNumber(retirement, 'additionalRetirementIncome', importedNumber(sourceSettings, 'additionalRetirementIncome', 0, 0, MAX_IMPORTED_AMOUNT), 0, MAX_IMPORTED_AMOUNT);
      const legacyAge = importedNumber(retirement, 'additionalIncomeAge', importedNumber(sourceSettings, 'additionalIncomeAge', 0, 0, 150, true), 0, 150, true);
      incomeSources = legacyAmount > 0 ? [{ label: '', amount: legacyAmount, startAge: legacyAge }] : [];
    }
    if (!Array.isArray(incomeSources) || incomeSources.length > 5) throw new Error('Invalid retirement income sources');

    person.retirementSettings = {
      currentAge: importedNumber(retirement, 'currentAge', settings.currentAge, 0, 150, true),
      withdrawalGoal: importedNumber(retirement, 'withdrawalGoal', settings.withdrawalGoal, 0, MAX_IMPORTED_AMOUNT),
      withdrawalRate: importedNumber(retirement, 'withdrawalRate', settings.withdrawalRate, 0, 100),
      statePensionEnabled: importedBoolean(retirement, 'statePensionEnabled', !settings.noStatePension),
      statePensionAge: importedNumber(retirement, 'statePensionAge', settings.retirementAge, 0, 150, true),
      statePensionIncome: importedNumber(retirement, 'statePensionIncome', settings.statePensionIncome, 0, MAX_IMPORTED_AMOUNT),
      additionalIncomeSources: incomeSources.map(source => {
        if (!isImportedRecord(source)) throw new Error('Invalid retirement income source');
        return {
          label: importedText(source.label, '', 'income label', 128),
          amount: importedNumber(source, 'amount', 0, 0, MAX_IMPORTED_AMOUNT),
          startAge: importedNumber(source, 'startAge', 0, 0, 150, true)
        };
      })
    };

    return person;
  });

  const sourceHouseholdMembers = Object.prototype.hasOwnProperty.call(sourceSettings, 'householdMembers')
    ? sourceSettings.householdMembers
    : [];
  if (!Array.isArray(sourceHouseholdMembers) || sourceHouseholdMembers.length > people.length) {
    throw new Error('Invalid household people');
  }
  const householdMembers = new Set();
  sourceHouseholdMembers.forEach(personId => {
    if (!Number.isSafeInteger(personId) || !personIds.has(personId) || householdMembers.has(personId)) {
      throw new Error('Invalid household person ID');
    }
    householdMembers.add(personId);
  });
  settings.householdMembers = Array.from(householdMembers);

  return {
    name: importedText(value.name, 'Imported Plan', 'plan name', 256),
    people,
    settings
  };
}

function decodeAndValidateSharedPlan(encoded) {
  if (typeof encoded !== 'string' || encoded.length === 0 || encoded.length > MAX_SHARED_PLAN_CHARS ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) {
    throw new Error('Invalid shared plan payload');
  }
  const bytes = atob(encoded);
  if (bytes.length > MAX_SHARED_PLAN_BYTES) throw new Error('Shared plan is too large');
  const json = decodeURIComponent(escape(bytes));
  return validateAndNormalizeSharedPlan(JSON.parse(json));
}