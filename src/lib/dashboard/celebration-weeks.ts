// Calendar weeks for the Birthdays & anniversaries widget: "this week" is Monday to Sunday of the current week and
// "next week" the Monday to Sunday after it, whatever day today is. Days already past this week still show.


/** The Monday on or before a date, at local midnight. */
export function mondayOf(date: Date): Date {
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const sinceMonday = (day.getDay() + 6) % 7; // Sunday is 0 in JS, so it counts as day 6 of the week
  return new Date(day.getFullYear(), day.getMonth(), day.getDate() - sinceMonday);
}

export interface CelebrationWindows {
  thisStart: Date;
  nextStart: Date;
  nextEnd: Date;
}

export function celebrationWindows(today: Date): CelebrationWindows {
  const thisStart = mondayOf(today);
  return {
    thisStart,
    nextStart: new Date(thisStart.getFullYear(), thisStart.getMonth(), thisStart.getDate() + 7),
    nextEnd: new Date(thisStart.getFullYear(), thisStart.getMonth(), thisStart.getDate() + 13),
  };
}

/**
 * Where a yearly date (a birthday or wedding date, as "YYYY-MM-DD") falls in the two weeks: its date in the window
 * (so a week that spans New Year works), and which week it is in. Null when it falls in neither.
 */
export function placeInWeeks(iso: string, today: Date): { week: "thisWeek" | "nextWeek"; occurrence: Date } | null {
  const [, month, day] = iso.split("-").map(Number);
  const { thisStart, nextStart, nextEnd } = celebrationWindows(today);
  for (let year = thisStart.getFullYear(); year <= nextEnd.getFullYear(); year++) {
    const occurrence = new Date(year, month - 1, day);
    if (occurrence < thisStart || occurrence > nextEnd) continue;
    return { week: occurrence < nextStart ? "thisWeek" : "nextWeek", occurrence };
  }
  return null;
}

