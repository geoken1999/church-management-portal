import { describe, expect, it } from "vitest";
import {
  availableEnrollmentActions,
  canManageCourse,
  countsTowardCapacity,
  courseIsFull,
  enrollmentWindowProblem,
  lessonDeletable,
  nextEnrollmentStatus,
} from "@/lib/lms/rules";
import {
  hasErrors,
  validateCourse,
  validateLesson,
  validateModule,
  validateProgram,
  validateSettings,
} from "@/lib/lms/validation";

const course = {
  title: "Bible Foundations",
  code: "BF-101",
  description: "",
  objectives: "",
  level: "beginner",
  language: "en",
  deliveryMode: "self_paced",
  visibility: "organization",
  enrollmentOpensAt: "",
  enrollmentClosesAt: "",
  startsOn: "",
  endsOn: "",
  estimatedHours: "",
  capacity: "",
};

describe("enrollment state machine", () => {
  it("moves a request through approval and activation", () => {
    expect(nextEnrollmentStatus("pending", "approve")).toBe("approved");
    expect(nextEnrollmentStatus("approved", "activate")).toBe("active");
    expect(nextEnrollmentStatus("pending", "reject")).toBe("rejected");
  });
  it("refuses changes that do not make sense", () => {
    expect(nextEnrollmentStatus("rejected", "approve")).toBeNull();
    expect(nextEnrollmentStatus("completed", "withdraw")).toBeNull();
    expect(nextEnrollmentStatus("active", "approve")).toBeNull();
    expect(nextEnrollmentStatus("pending", "activate")).toBeNull();
  });
  it("offers only the possible actions", () => {
    expect(availableEnrollmentActions("pending")).toEqual([
      "approve",
      "reject",
      "withdraw",
    ]);
    expect(availableEnrollmentActions("approved")).toEqual([
      "activate",
      "withdraw",
    ]);
    expect(availableEnrollmentActions("completed")).toEqual([]);
  });
  it("counts approved and active students toward capacity", () => {
    expect(countsTowardCapacity("approved")).toBe(true);
    expect(countsTowardCapacity("active")).toBe(true);
    expect(countsTowardCapacity("pending")).toBe(false);
    expect(countsTowardCapacity("withdrawn")).toBe(false);
    expect(courseIsFull(10, 10)).toBe(true);
    expect(courseIsFull(10, 9)).toBe(false);
    expect(courseIsFull(null, 9999)).toBe(false);
  });
});

describe("enrollment window", () => {
  const now = new Date("2026-10-17T10:00:00Z");
  it("is open when no dates are set", () => {
    expect(
      enrollmentWindowProblem(
        { enrollment_opens_at: null, enrollment_closes_at: null },
        now,
      ),
    ).toBeNull();
  });
  it("is closed before it opens and after it closes", () => {
    expect(
      enrollmentWindowProblem(
        {
          enrollment_opens_at: "2026-11-01T00:00:00Z",
          enrollment_closes_at: null,
        },
        now,
      ),
    ).toMatch(/not opened/);
    expect(
      enrollmentWindowProblem(
        {
          enrollment_opens_at: null,
          enrollment_closes_at: "2026-10-01T00:00:00Z",
        },
        now,
      ),
    ).toMatch(/closed/);
  });
});

describe("who can manage a course", () => {
  it("allows admins, writers and the course's own instructors only", () => {
    expect(
      canManageCourse({
        isAdmin: true,
        canWrite: false,
        isAssignedInstructor: false,
      }),
    ).toBe(true);
    expect(
      canManageCourse({
        isAdmin: false,
        canWrite: true,
        isAssignedInstructor: false,
      }),
    ).toBe(true);
    expect(
      canManageCourse({
        isAdmin: false,
        canWrite: false,
        isAssignedInstructor: true,
      }),
    ).toBe(true);
    expect(
      canManageCourse({
        isAdmin: false,
        canWrite: false,
        isAssignedInstructor: false,
      }),
    ).toBe(false);
  });
  it("deletes only draft lessons", () => {
    expect(lessonDeletable("draft")).toBe(true);
    expect(lessonDeletable("published")).toBe(false);
    expect(lessonDeletable("archived")).toBe(false);
  });
});

describe("validateCourse", () => {
  it("accepts a good course", () => {
    expect(hasErrors(validateCourse(course))).toBe(false);
  });
  it("rejects bad titles, codes, levels and numbers", () => {
    const errors = validateCourse({
      ...course,
      title: "ab",
      code: "not valid!",
      level: "expert",
      capacity: "0",
      estimatedHours: "x",
    });
    expect(errors.title).toBeTruthy();
    expect(errors.code).toBeTruthy();
    expect(errors.level).toBeTruthy();
    expect(errors.capacity).toBeTruthy();
    expect(errors.estimatedHours).toBeTruthy();
  });
  it("checks that dates are in order", () => {
    expect(
      validateCourse({
        ...course,
        enrollmentOpensAt: "2026-11-02T10:00",
        enrollmentClosesAt: "2026-11-01T10:00",
      }).enrollmentClosesAt,
    ).toBeTruthy();
    expect(
      validateCourse({
        ...course,
        startsOn: "2026-12-02",
        endsOn: "2026-12-01",
      }).endsOn,
    ).toBeTruthy();
  });
});

describe("validateProgram, validateModule, validateSettings", () => {
  it("needs a real title", () => {
    expect(
      validateProgram({ title: "ab", description: "", objectives: "" }).title,
    ).toBeTruthy();
    expect(
      hasErrors(
        validateProgram({
          title: "Christian Leadership",
          description: "",
          objectives: "",
        }),
      ),
    ).toBe(false);
    expect(validateModule({ title: "", description: "" }).title).toBeTruthy();
    expect(
      validateSettings({
        schoolName: "Grace Bible School",
        tagline: "",
        defaultLanguage: "en",
      }),
    ).toEqual({});
    expect(
      validateSettings({ schoolName: "", tagline: "", defaultLanguage: "x" })
        .defaultLanguage,
    ).toBeTruthy();
  });
});

describe("validateLesson", () => {
  const lesson = {
    title: "Genesis 1",
    contentType: "text",
    body: "<p>Hi</p>",
    mediaUrl: "",
    durationMinutes: "",
  };
  it("needs no link for a reading", () => {
    expect(hasErrors(validateLesson(lesson))).toBe(false);
  });
  it("needs an https link for video, audio and external lessons", () => {
    expect(
      validateLesson({ ...lesson, contentType: "video" }).mediaUrl,
    ).toBeTruthy();
    expect(
      validateLesson({
        ...lesson,
        contentType: "video",
        mediaUrl: "http://x.com/v",
      }).mediaUrl,
    ).toBeTruthy();
    expect(
      validateLesson({
        ...lesson,
        contentType: "video",
        mediaUrl: "javascript:alert(1)",
      }).mediaUrl,
    ).toBeTruthy();
    expect(
      hasErrors(
        validateLesson({
          ...lesson,
          contentType: "video",
          mediaUrl: "https://youtu.be/abc",
        }),
      ),
    ).toBe(false);
  });
  it("does not allow lesson types that come in later phases", () => {
    expect(
      validateLesson({ ...lesson, contentType: "quiz" }).contentType,
    ).toBeTruthy();
  });
  it("checks the duration", () => {
    expect(
      validateLesson({ ...lesson, durationMinutes: "-5" }).durationMinutes,
    ).toBeTruthy();
    expect(
      validateLesson({ ...lesson, durationMinutes: "30" }).durationMinutes,
    ).toBeUndefined();
  });
});
