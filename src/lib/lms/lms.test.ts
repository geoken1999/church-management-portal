import { describe, expect, it } from "vitest";
import { LESSON_TYPES } from "@/lib/lms/constants";
import {
  LESSON_FILE_TYPES,
  creditedSeconds,
  lessonFileProblem,
  watchedEnough,
  availableEnrollmentActions,
  canManageCourse,
  courseComplete,
  progressPercent,
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
      validateProgram({
        title: "ab",
        description: "",
        objectives: "",
        price: "",
        capacity: "",
        visibility: "organization",
      }).title,
    ).toBeTruthy();
    expect(
      hasErrors(
        validateProgram({
          title: "Christian Leadership",
          description: "",
          objectives: "",
          price: "",
          capacity: "",
          visibility: "organization",
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
  it("needs an https link for external lessons", () => {
    const external = { ...lesson, contentType: "external" };
    expect(validateLesson(external).mediaUrl).toBeTruthy();
    expect(
      validateLesson({ ...external, mediaUrl: "http://x.com/v" }).mediaUrl,
    ).toBeTruthy();
    expect(
      validateLesson({ ...external, mediaUrl: "javascript:alert(1)" }).mediaUrl,
    ).toBeTruthy();
    expect(
      hasErrors(
        validateLesson({ ...external, mediaUrl: "https://example.com/a" }),
      ),
    ).toBe(false);
  });
  it("makes video and audio upload-only", () => {
    // Nothing yet: the file has to be uploaded.
    expect(
      validateLesson({ ...lesson, contentType: "video" }).mediaUrl,
    ).toMatch(/Upload the video/);
    expect(
      validateLesson({ ...lesson, contentType: "audio" }).mediaUrl,
    ).toMatch(/Upload the audio/);
    // A file is on its way (or already attached).
    expect(
      hasErrors(
        validateLesson({ ...lesson, contentType: "video", hasFile: true }),
      ),
    ).toBe(false);
    expect(
      hasErrors(
        validateLesson({ ...lesson, contentType: "audio", hasFile: true }),
      ),
    ).toBe(false);
  });
  it("lets an older video lesson keep the link it already has", () => {
    expect(
      hasErrors(
        validateLesson({
          ...lesson,
          contentType: "video",
          mediaUrl: "https://youtu.be/abc",
        }),
      ),
    ).toBe(false);
    expect(
      validateLesson({
        ...lesson,
        contentType: "video",
        mediaUrl: "http://x.com/v",
      }).mediaUrl,
    ).toBeTruthy();
  });
  it("tells which lesson types take a link and which take an upload", () => {
    const by = (value: string) => LESSON_TYPES.find((t) => t.value === value)!;
    expect(by("video")).toMatchObject({
      allowsLink: false,
      allowsUpload: true,
    });
    expect(by("audio")).toMatchObject({
      allowsLink: false,
      allowsUpload: true,
    });
    expect(by("document")).toMatchObject({
      allowsLink: true,
      allowsUpload: true,
    });
    expect(by("external")).toMatchObject({
      allowsLink: true,
      allowsUpload: false,
    });
    expect(by("text")).toMatchObject({
      allowsLink: false,
      allowsUpload: false,
    });
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

describe("progress", () => {
  it("is the share of required lessons done", () => {
    expect(progressPercent(0, 10)).toBe(0);
    expect(progressPercent(3, 10)).toBe(30);
    expect(progressPercent(10, 10)).toBe(100);
    expect(progressPercent(12, 10)).toBe(100);
  });
  it("shows no progress for a course with nothing required", () => {
    expect(progressPercent(0, 0)).toBe(0);
  });
  it("completes a course only when every required lesson is done", () => {
    expect(courseComplete(9, 10)).toBe(false);
    expect(courseComplete(10, 10)).toBe(true);
    expect(courseComplete(0, 0)).toBe(false);
  });
  it("accepts only the lesson file types it knows", () => {
    expect(LESSON_FILE_TYPES["application/pdf"]).toBe("pdf");
    expect(LESSON_FILE_TYPES["text/html"]).toBeUndefined();
    expect(LESSON_FILE_TYPES["application/x-msdownload"]).toBeUndefined();
  });
});

describe("a lesson with an uploaded file", () => {
  const lesson = {
    title: "Overview slides",
    contentType: "document",
    body: "",
    mediaUrl: "",
    durationMinutes: "",
  };
  it("needs a link or a file", () => {
    expect(validateLesson(lesson).mediaUrl).toBeTruthy();
    expect(
      validateLesson({ ...lesson, hasFile: true }).mediaUrl,
    ).toBeUndefined();
  });
  it("still rejects a bad link when a file is present", () => {
    expect(
      validateLesson({
        ...lesson,
        hasFile: true,
        mediaUrl: "http://x.com/a.pdf",
      }).mediaUrl,
    ).toBeTruthy();
  });
});

describe("lesson files", () => {
  const MB = 1024 * 1024;
  it("accepts an MP4 video up to 500 MB for a video lesson", () => {
    expect(
      lessonFileProblem({ type: "video/mp4", size: 400 * MB }, "video"),
    ).toBeNull();
    expect(
      lessonFileProblem({ type: "video/mp4", size: 600 * MB }, "video"),
    ).toMatch(/500 MB/);
  });
  it("keeps documents small and audio in between", () => {
    expect(
      lessonFileProblem({ type: "application/pdf", size: 20 * MB }, "document"),
    ).toBeNull();
    expect(
      lessonFileProblem({ type: "application/pdf", size: 30 * MB }, "document"),
    ).toMatch(/25 MB/);
    expect(
      lessonFileProblem({ type: "audio/mpeg", size: 90 * MB }, "audio"),
    ).toBeNull();
    expect(
      lessonFileProblem({ type: "audio/mpeg", size: 120 * MB }, "audio"),
    ).toMatch(/100 MB/);
  });
  it("matches the file to the kind of lesson", () => {
    expect(
      lessonFileProblem({ type: "application/pdf", size: MB }, "video"),
    ).toMatch(/MP4/);
    expect(
      lessonFileProblem({ type: "video/mp4", size: MB }, "document"),
    ).toMatch(/document/);
    expect(lessonFileProblem({ type: "video/mp4", size: MB }, "audio")).toMatch(
      /audio/i,
    );
    expect(
      lessonFileProblem({ type: "video/mp4", size: MB }, "external"),
    ).toBeNull();
  });
  it("refuses types it does not know and empty files", () => {
    expect(
      lessonFileProblem({ type: "video/x-matroska", size: MB }, "video"),
    ).toBeTruthy();
    expect(
      lessonFileProblem({ type: "text/html", size: MB }, "document"),
    ).toBeTruthy();
    expect(lessonFileProblem({ type: "video/mp4", size: 0 }, "video")).toMatch(
      /empty/,
    );
  });
});

describe("watch progress", () => {
  it("credits forward movement, never more than real time at double speed", () => {
    expect(creditedSeconds(0, 15, 15)).toBe(15);
    expect(creditedSeconds(100, 130, 15)).toBe(30);
    expect(creditedSeconds(100, 400, 15)).toBe(32);
  });
  it("credits nothing for going back, standing still or a clock that ran backwards", () => {
    expect(creditedSeconds(100, 90, 15)).toBe(0);
    expect(creditedSeconds(100, 100, 15)).toBe(0);
    expect(creditedSeconds(100, 120, -5)).toBe(2);
  });
  it("completes a lesson once 90% has been watched", () => {
    expect(watchedEnough(539, 600)).toBe(false);
    expect(watchedEnough(540, 600)).toBe(true);
    expect(watchedEnough(0, 0)).toBe(false);
  });
});

describe("program fee, seats and visibility", () => {
  const program = {
    title: "Discipleship Year",
    description: "",
    objectives: "",
    price: "",
    capacity: "",
    visibility: "organization",
  };
  it("accepts a plain free program", () => {
    expect(validateProgram(program)).toEqual({});
  });
  it("fee is optional, positive, and at most two decimals", () => {
    expect(validateProgram({ ...program, price: "999" }).price).toBeUndefined();
    expect(
      validateProgram({ ...program, price: "499.50" }).price,
    ).toBeUndefined();
    for (const bad of ["0", "-5", "abc", "12.345", "100001"])
      expect(validateProgram({ ...program, price: bad }).price).toBeDefined();
  });
  it("seats are a whole number of at least one", () => {
    expect(
      validateProgram({ ...program, capacity: "30" }).capacity,
    ).toBeUndefined();
    for (const bad of ["0", "1.5", "x"])
      expect(
        validateProgram({ ...program, capacity: bad }).capacity,
      ).toBeDefined();
  });
  it("visibility is church-only or public", () => {
    expect(
      validateProgram({ ...program, visibility: "public" }).visibility,
    ).toBeUndefined();
    expect(
      validateProgram({ ...program, visibility: "everyone" }).visibility,
    ).toBeDefined();
  });
});
