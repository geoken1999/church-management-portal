import {
  COURSE_LEVELS,
  DELIVERY_MODES,
  LESSON_TYPES,
  VISIBILITIES,
} from "@/lib/lms/constants";

export type FieldErrors<K extends string> = Partial<Record<K, string>>;

const has = <T extends { value: string }>(list: readonly T[], value: string) =>
  list.some((item) => item.value === value);

export function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function dateOk(value: string): boolean {
  return value === "" || !Number.isNaN(Date.parse(value));
}

// ---- Programs ----

export interface ProgramInput {
  title: string;
  description: string;
  objectives: string;
}

export function validateProgram(
  input: ProgramInput,
): FieldErrors<keyof ProgramInput> {
  const errors: FieldErrors<keyof ProgramInput> = {};
  const title = input.title.trim();
  if (title.length < 3)
    errors.title = "Give the program a name of at least 3 characters.";
  else if (title.length > 120)
    errors.title = "Keep the name under 120 characters.";
  if (input.description.length > 4000)
    errors.description = "Keep the description under 4000 characters.";
  if (input.objectives.length > 4000)
    errors.objectives = "Keep the objectives under 4000 characters.";
  return errors;
}

// ---- Courses ----

export interface CourseInput {
  title: string;
  code: string;
  description: string;
  objectives: string;
  level: string;
  language: string;
  deliveryMode: string;
  visibility: string;
  enrollmentOpensAt: string;
  enrollmentClosesAt: string;
  startsOn: string;
  endsOn: string;
  estimatedHours: string;
  capacity: string;
}

export function validateCourse(
  input: CourseInput,
): FieldErrors<keyof CourseInput> {
  const errors: FieldErrors<keyof CourseInput> = {};
  const title = input.title.trim();
  if (title.length < 3)
    errors.title = "Give the course a title of at least 3 characters.";
  else if (title.length > 120)
    errors.title = "Keep the title under 120 characters.";
  if (input.code.trim() && !/^[A-Za-z0-9-]{2,20}$/.test(input.code.trim()))
    errors.code = "Use 2 to 20 letters, numbers or dashes, like BF-101.";
  if (input.description.length > 4000)
    errors.description = "Keep the description under 4000 characters.";
  if (input.objectives.length > 4000)
    errors.objectives = "Keep the objectives under 4000 characters.";
  if (!has(COURSE_LEVELS, input.level)) errors.level = "Choose a level.";
  const language = input.language.trim();
  if (language.length < 2 || language.length > 30)
    errors.language = "Enter the course language.";
  if (!has(DELIVERY_MODES, input.deliveryMode))
    errors.deliveryMode = "Choose how the course is taught.";
  if (!has(VISIBILITIES, input.visibility))
    errors.visibility = "Choose who can see the course.";

  if (!dateOk(input.enrollmentOpensAt))
    errors.enrollmentOpensAt = "Enter a valid date and time.";
  if (!dateOk(input.enrollmentClosesAt))
    errors.enrollmentClosesAt = "Enter a valid date and time.";
  if (
    !errors.enrollmentOpensAt &&
    !errors.enrollmentClosesAt &&
    input.enrollmentOpensAt &&
    input.enrollmentClosesAt
  ) {
    if (
      Date.parse(input.enrollmentClosesAt) <=
      Date.parse(input.enrollmentOpensAt)
    )
      errors.enrollmentClosesAt = "Enrollment must close after it opens.";
  }
  if (!dateOk(input.startsOn)) errors.startsOn = "Enter a valid date.";
  if (!dateOk(input.endsOn)) errors.endsOn = "Enter a valid date.";
  if (
    !errors.startsOn &&
    !errors.endsOn &&
    input.startsOn &&
    input.endsOn &&
    input.endsOn < input.startsOn
  )
    errors.endsOn = "The course must end on or after its start date.";

  if (input.estimatedHours.trim()) {
    const hours = Number(input.estimatedHours);
    if (!Number.isFinite(hours) || hours < 0 || hours > 10000)
      errors.estimatedHours = "Enter the hours as a number, like 12.";
  }
  if (input.capacity.trim()) {
    const capacity = Number(input.capacity);
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 100000)
      errors.capacity =
        "Enter a whole number of seats, or leave it blank for no limit.";
  }
  return errors;
}

// ---- Curriculum ----

export interface ModuleInput {
  title: string;
  description: string;
}

export function validateModule(
  input: ModuleInput,
): FieldErrors<keyof ModuleInput> {
  const errors: FieldErrors<keyof ModuleInput> = {};
  const title = input.title.trim();
  if (title.length < 2) errors.title = "Give the module a title.";
  else if (title.length > 120)
    errors.title = "Keep the title under 120 characters.";
  if (input.description.length > 2000)
    errors.description = "Keep the description under 2000 characters.";
  return errors;
}

export interface LessonInput {
  title: string;
  contentType: string;
  body: string;
  mediaUrl: string;
  durationMinutes: string;
  /** The lesson already carries an uploaded file, so it needs no link. */
  hasFile?: boolean;
}

export function validateLesson(
  input: LessonInput,
): FieldErrors<keyof LessonInput> {
  const errors: FieldErrors<keyof LessonInput> = {};
  const title = input.title.trim();
  if (title.length < 2) errors.title = "Give the lesson a title.";
  else if (title.length > 160)
    errors.title = "Keep the title under 160 characters.";

  const type = LESSON_TYPES.find((t) => t.value === input.contentType);
  if (!type) {
    errors.contentType = "Choose a lesson type.";
  } else if (type.needsLink) {
    if (!input.mediaUrl.trim()) {
      if (!input.hasFile)
        errors.mediaUrl =
          "Add a link for this lesson, or upload a file after saving it.";
    } else if (!isHttpsUrl(input.mediaUrl.trim()))
      errors.mediaUrl = "The link must start with https://.";
  }
  if (input.body.length > 200000) errors.body = "This lesson is too long.";
  if (input.durationMinutes.trim()) {
    const minutes = Number(input.durationMinutes);
    if (!Number.isInteger(minutes) || minutes < 0 || minutes > 1440)
      errors.durationMinutes = "Enter whole minutes, like 25.";
  }
  return errors;
}

// ---- Settings ----

export interface SettingsInput {
  schoolName: string;
  tagline: string;
  defaultLanguage: string;
}

export function validateSettings(
  input: SettingsInput,
): FieldErrors<keyof SettingsInput> {
  const errors: FieldErrors<keyof SettingsInput> = {};
  if (input.schoolName.length > 120)
    errors.schoolName = "Keep the name under 120 characters.";
  if (input.tagline.length > 200)
    errors.tagline = "Keep the tagline under 200 characters.";
  const language = input.defaultLanguage.trim();
  if (language.length < 2 || language.length > 10)
    errors.defaultLanguage = "Enter a language code like en.";
  return errors;
}

export const hasErrors = (errors: object) =>
  Object.values(errors).some(Boolean);
