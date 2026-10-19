export function getHalfDayOptions(shiftTiming) {
  const fallback = [{ value: 'first_half', label: 'First Half' }, { value: 'second_half', label: 'Second Half' }];
  if (typeof shiftTiming !== 'string') return fallback;
  const parts = shiftTiming.trim().split(/\s*[-–—]\s*/);
  if (parts.length !== 2) return fallback;
  const parse = text => {
    const match = text.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/i);
    if (!match) return null;
    let hour = Number(match[1]);
    const minute = Number(match[2] || 0), meridiem = match[3]?.toUpperCase();
    if (minute > 59 || (meridiem ? hour < 1 || hour > 12 : hour > 23)) return null;
    if (meridiem) hour = hour % 12 + (meridiem === 'PM' ? 12 : 0);
    return hour * 60 + minute;
  };
  const start = parse(parts[0]), end = parse(parts[1]);
  if (start == null || end == null || start === end) return fallback;
  const duration = (end - start + 1440) % 1440;
  const middle = start + Math.round(duration / 2);
  const format = value => {
    const minutes = value % 1440, hour = Math.floor(minutes / 60);
    return (hour % 12 || 12) + ':' + String(minutes % 60).padStart(2, '0') + (hour >= 12 ? ' PM' : ' AM');
  };
  return [
    { value: 'first_half', label: 'First Half (' + format(start) + ' - ' + format(middle) + ')' },
    { value: 'second_half', label: 'Second Half (' + format(middle) + ' - ' + format(end) + ')' },
  ];
}
