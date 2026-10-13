// src/data/holidays.js

export const holidays = [
  // January 2026
  {
    date: '2026-01-01',
    name: "New Year's Day",
    region: 'USA',
    type: 'public_holiday'
  },
  {
    date: '2026-01-19',
    name: 'Martin Luther King Jr. Day',
    region: 'USA',
    type: 'public_holiday'
  },
  {
    date: '2026-01-26',
    name: 'Republic Day',
    region: 'India',
    type: 'public_holiday'
  },
  
  // February 2026
  {
    date: '2026-02-16',
    name: 'Presidents\' Day',
    region: 'USA',
    type: 'public_holiday'
  },
  
  // March 2026
  {
    date: '2026-03-04',
    name: 'Holi',
    region: 'India',
    type: 'public_holiday'
  },
  {
    date: '2026-03-20',
    name: 'Eid-Ul-Fitr',
    region: 'India',
    type: 'public_holiday'
  },
  
  // April 2026
  {
    date: '2026-04-03',
    name: 'Good Friday',
    region: 'USA & India',
    type: 'public_holiday'
  },
  
  // May 2026
  {
    date: '2026-05-25',
    name: 'Memorial Day',
    region: 'USA',
    type: 'public_holiday'
  },
  
  // June 2026
  {
    date: '2026-06-19',
    name: 'Juneteenth',
    region: 'USA',
    type: 'public_holiday'
  },
  
  // July 2026
  {
    date: '2026-07-03',
    name: 'US Independence Day',
    region: 'USA',
    type: 'public_holiday'
  },
  
  // August 2026
  {
    date: '2026-08-15',
    name: 'India Independence Day',
    region: 'India',
    type: 'public_holiday'
  },
  
  // September 2026
  {
    date: '2026-09-07',
    name: 'Labor Day',
    region: 'USA',
    type: 'public_holiday'
  },
  {
    date: '2026-09-14',
    name: 'Ganesh Chaturthi',
    region: 'India',
    type: 'public_holiday'
  },
  
  // October 2026
  {
    date: '2026-10-02',
    name: 'Gandhi Jayanti',
    region: 'India',
    type: 'optional_holiday',
    note: 'Optional holiday'
  },
  {
    date: '2026-10-12',
    name: 'Columbus Day',
    region: 'USA',
    type: 'public_holiday'
  },
  
  // November 2026
  {
    date: '2026-11-08',
    name: 'Diwali',
    region: 'India',
    type: 'public_holiday'
  },
  {
    date: '2026-11-26',
    name: 'Thanksgiving',
    region: 'USA',
    type: 'public_holiday'
  },
  
  // December 2026
  {
    date: '2026-12-25',
    name: 'Christmas Day',
    region: 'USA & India',
    type: 'public_holiday'
  }
];

// Helper function to check if a date is a holiday
export const isHoliday = (date) => {
  const dateStr = date.toISOString().split('T')[0];
  const holiday = holidays.find(h => h.date === dateStr);
  
  if (holiday) {
    return {
      isHoliday: true,
      type: holiday.type,
      name: holiday.name,
      region: holiday.region,
      note: holiday.note || null
    };
  }
  
  // Check for weekends (Saturday and Sunday)
  const dayOfWeek = date.getDay();
  if (dayOfWeek === 0) {
    return { isHoliday: true, type: 'weekly_off', name: 'Sunday', region: 'All' };
  }
  if (dayOfWeek === 6) {
    return { isHoliday: true, type: 'weekly_off', name: 'Saturday', region: 'All' };
  }
  
  return { isHoliday: false };
};

// Get holidays by region (for Dashboard)
export const getHolidaysByRegion = (region = 'All') => {
  if (region === 'All') {
    return holidays;
  }
  return holidays.filter(holiday => 
    holiday.region === region || 
    holiday.region === 'USA & India'
  );
};

// Get holidays by month for calendar display
export const getHolidaysByMonth = (year = 2026) => {
  const months = {};
  
  holidays.forEach(holiday => {
    const [holidayYear, month] = holiday.date.split('-');
    if (parseInt(holidayYear) === year) {
      if (!months[month]) {
        months[month] = [];
      }
      months[month].push(holiday);
    }
  });
  
  return months;
};

// Get upcoming holidays
export const getUpcomingHolidays = (fromDate = new Date(), limit = 5) => {
  const todayStr = fromDate.toISOString().split('T')[0];
  const upcoming = holidays
    .filter(holiday => holiday.date >= todayStr)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, limit);
  
  return upcoming;
};

// Get holidays for a specific month and year
export const getHolidaysForMonth = (year, month) => {
  const monthStr = String(month).padStart(2, '0');
  return holidays.filter(holiday => {
    const [holidayYear, holidayMonth] = holiday.date.split('-');
    return holidayYear === String(year) && holidayMonth === monthStr;
  });
};

// Get total holidays count for a year
export const getTotalHolidaysCount = (year = 2026, region = 'All') => {
  const filtered = getHolidaysByRegion(region);
  return filtered.filter(holiday => holiday.date.startsWith(String(year))).length;
};

// Check if a specific date is a holiday (with region support)
export const isHolidayForRegion = (date, region = 'All') => {
  const dateStr = date.toISOString().split('T')[0];
  const holiday = holidays.find(h => h.date === dateStr);
  
  if (holiday) {
    if (region === 'All') return { isHoliday: true, name: holiday.name };
    if (holiday.region === region || holiday.region === 'USA & India') {
      return { isHoliday: true, name: holiday.name };
    }
  }
  
  return { isHoliday: false };
};