// Pure attendance rule for the Member follow-up automation. No DB or server
// imports, so it can be tested directly.
//
// A Sunday only counts if it was recorded (attendance_sessions.recorded_at
// is set). Unrecorded Sundays are skipped, not counted as absence: we can't
// tell "nobody came" from "nobody wrote it down". A member is flagged when
// they're absent from the N most recent recorded Sundays in a row.

export interface FollowupEvaluationInput {
  // Sunday dates in the window, most recent first, as YYYY-MM-DD.
  sundays: string[];
  // Subset of sundays whose sessions were recorded.
  recordedSundays: Set<string>;
  // For each recorded Sunday, the member ids marked present.
  presentByDate: Map<string, Set<string>>;
  // Members in scope for this automation.
  memberIds: string[];
  requiredConsecutive: number;
}

export interface FollowupEvaluation {
  qualifiedMemberIds: string[];
  skippedUnrecordedSundays: string[];
  // True when fewer recorded Sundays exist than the rule needs, so nobody can
  // be flagged safely. The caller records this as a data-quality warning.
  insufficientData: boolean;
}

export function evaluateFollowup(input: FollowupEvaluationInput): FollowupEvaluation {
  const recorded = input.sundays.filter((date) => input.recordedSundays.has(date));
  const skippedUnrecordedSundays = input.sundays.filter((date) => !input.recordedSundays.has(date));

  if (recorded.length < input.requiredConsecutive) {
    return { qualifiedMemberIds: [], skippedUnrecordedSundays, insufficientData: true };
  }

  const window = recorded.slice(0, input.requiredConsecutive);
  const qualifiedMemberIds = input.memberIds.filter((memberId) =>
    window.every((date) => !(input.presentByDate.get(date)?.has(memberId) ?? false)),
  );

  return { qualifiedMemberIds, skippedUnrecordedSundays, insufficientData: false };
}

export function isWithinConsecutiveRange(value: number): boolean {
  return Number.isInteger(value) && value >= 2 && value <= 12;
}
