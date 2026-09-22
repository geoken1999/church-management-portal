export function validateSessionTitle(title: string): string | undefined {
  if (!title.trim() || title.trim().length < 2) {
    return "Give the session a title of at least 2 characters.";
  }
  return undefined;
}

export function validateOccurrenceDate(date: string): string | undefined {
  if (!date || Number.isNaN(new Date(date).getTime())) {
    return "Choose a valid date.";
  }
  return undefined;
}

export function validateHeadcount(value: string): string | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    return "Headcount must be a whole number of 0 or more.";
  }
  return undefined;
}
