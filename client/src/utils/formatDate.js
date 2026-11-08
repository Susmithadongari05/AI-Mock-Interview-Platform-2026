// Indian date format DD/MM/YYYY. Returns the fallback for missing or invalid dates.
export const formatDate = (value, fallback = 'Unknown date') => {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

export default formatDate;
