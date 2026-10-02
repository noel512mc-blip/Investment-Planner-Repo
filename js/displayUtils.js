function hexToRgba(hex, alpha) {

  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);

  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function getStartYear() {
  return parseInt(document.getElementById('planStartYear')?.value) || 0;
}

function getDisplayYear(offsetYear) {
  const startYear = getStartYear();
  if (!startYear) return `yr ${offsetYear}`;
  return String(startYear + offsetYear - 1);
}

function getDisplayYearLabel(offsetYear) {
  const startYear = getStartYear();
  if (!startYear) return String(offsetYear);
  return String(startYear + offsetYear - 1);
}

function getCurrency() {
  return document.getElementById('planCurrency')?.value || '€';
}

// CONVERSION RATES RELATIVE TO € (base)
const currencyRates = {
  '€': 1,
  '$': 1.08,
  '£': 0.86,
  '¥': 163,
  '₣': 0.96
};

function getConversionRate() {
  return currencyRates[getCurrency()] || 1;
}

function convertAmount(euroValue) {
  return euroValue * getConversionRate();
}

// FORMAT NUMBERS — formats a number for display (no conversion)
function formatNumber(num) {
  return new Intl.NumberFormat('nl-NL')
    .format(Math.round(num));
}

// FORMAT AND CONVERT — converts from € base and formats
function formatCurrency(num) {
  return new Intl.NumberFormat('nl-NL')
    .format(Math.round(num * getConversionRate()));
}