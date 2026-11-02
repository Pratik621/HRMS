export function getNextBirthday(dob, joiningDate = '', today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Kolkata' }).format(new Date())) {
  const birth = String(dob || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birth)) return '';
  const parsed = new Date(birth + 'T00:00:00Z');
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== birth) return '';
  const employmentStart = String(joiningDate || '').slice(0, 10);
  // Past birthdays in the current year remain eligible when employment had begun.
  const yearStart = today.slice(0, 4) + '-01-01';
  const lowerBound = employmentStart > yearStart ? employmentStart : yearStart;
  const firstYear = Number(lowerBound.slice(0, 4));
  for (let year = firstYear; year <= firstYear + 8; year++) {
    const candidate = year + birth.slice(4);
    const date = new Date(candidate + 'T00:00:00Z');
    if (date.toISOString().slice(0, 10) === candidate && candidate >= lowerBound) return candidate;
  }
  return '';
}
