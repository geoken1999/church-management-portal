# Bible School (LMS) for KingdomFlow

A native KingdomFlow module for running a Bible school: programs, courses, curriculum, instructors,
students and enrollments. Built in phases; this document covers the architecture audit and **Phase 1
(foundation)**. Later phases are listed at the end.

## 1. Architecture audit

What the repository already provides, and how the module uses it.

| Area | What exists | How the LMS uses it |
| --- | --- | --- |
| Framework | Next.js 16 App Router, TypeScript, Tailwind v4, shadcn-style `components/ui`, Vitest | Same conventions; pages under `src/app/dashboard/bible-school`, logic under `src/lib/lms` |
| Tenancy | `organizations`, `organization_members` (owner / admin / member), `branches`; helpers `is_org_member`, `is_org_admin`, `is_linked_member` | Every LMS row has `organization_id`; RLS uses the same helpers |
| Module permissions | `TAB_KEYS` (`src/lib/permissions/tabs.ts`), per-login `tab_permissions` (read/write/delete), `checkTabAccess()` on every server action, platform feature flags (new modules start in *testing*), plan switches (`getOrgFeatureState`) | New tab key **`bibleschool`**; all actions go through `checkTabAccess` via `src/lib/lms/authz.ts` |
| Students | `members` (`auth_user_id` links a member who signs in with their phone) | Students and instructors **are members** (`member_id`); no second person table |
| Writes | Server actions with the service-role client after a permission check; RLS is read-side defence in depth | Same pattern |
| Files | Supabase Storage; quota via `checkStorageQuota` | Course covers in public bucket `lms-course-covers`; private lesson files and submissions arrive in later phases |
| Rich text | Tiptap (email composer) + `sanitize-html` | Lesson text uses Tiptap; `src/lib/lms/sanitize.ts` sanitizes on the server |
| Notifications | `sendPushToUsers`, `createNotification`, email/SMS/WhatsApp clients | Not used in phase 1; enrollment and class notifications are phase 3 |
| Calls | K-Connect (`kmeet`, `kaudio`) | Live classes will reuse K-Connect (phase 3) |
| Billing / entitlements | Plans (`PLANS`), custom plan overrides (`custom_plan_limits.tabOverrides`), onboarding module catalogue (built from `TAB_KEYS`) | The module appears automatically in the onboarding module catalogue and the Feature Flags page; plan limits come in phase 5 |
| Audit | `logPlatformEvent` (platform-wide) | New per-church `lms_audit_events` for sensitive LMS actions |
| i18n | Dictionaries in en / hi / ta | Nav label added in all three |

### Conflicts and decisions

- **Branch scoping.** The platform has no per-login branch restriction (`organization_members` has no branch).
  `branch_id` is stored on programs and courses for filtering and reporting, but permissions are church-wide.
- **Student sign-in.** Members use the mobile app (phone sign-in); the web dashboard is for staff logins.
  The student portal therefore ships in the mobile app (phase 2). Phase 1 includes the data model, the read-side
  RLS for students, and admin-side enrollment.
- **Instructors.** An instructor is a member. To edit curriculum from the dashboard they also need a team login with
  read access on the Bible School tab, linked on the course's Instructors tab (`lms_course_instructors.auth_user_id`).
- **Transactions.** supabase-js has none, so capacity checks, enrollment decisions and reordering are Postgres
  functions called by the server (`lms_create_enrollment`, `lms_decide_enrollment`, `lms_move_module`, `lms_move_lesson`).

## 2. Phase 1 scope

Foundation: navigation and permissions, settings, programs, courses, curriculum (modules and lessons),
instructors, enrollments (admin direct enrollment, approve / reject / activate / withdraw), overview counts.

### Routes

| Route | Who | What |
| --- | --- | --- |
| `/dashboard/bible-school` | Anyone with Bible School read | Overview (real counts; an instructor sees only their courses) |
| `/dashboard/bible-school/programs` | Write | Programs and their courses |
| `/dashboard/bible-school/courses` | Read (instructors: only their courses) | Search, filter, paginate; create (write) |
| `/dashboard/bible-school/courses/[id]` | Write, or an instructor of that course | Tabs: Curriculum, Details (write), Instructors, Enrollments |
| `/dashboard/bible-school/enrollments` | Read (instructors: only their courses) | Filter and paginate; enroll and decide (write) |
| `/dashboard/bible-school/settings` | Write | School name, default language, enrollment policy |

### Permissions

Mapped onto the existing tab permissions; no separate role engine.

| Action | Needs |
| --- | --- |
| View the module | Bible School **read** (and the module not hidden by feature flag / plan) |
| Settings, programs, create / edit / publish / archive courses, instructors, prerequisites, enrollments | **write** |
| Delete programs and courses | **delete** (and only drafts / unenrolled) |
| Edit a course's curriculum | **write**, or **read** plus being an assigned instructor of that course |

Owners and admins have everything. New modules start in *testing*: only the platform test users see Bible School
until a platform admin moves it to Beta or Live (Super Admin → Feature Flags).

### Database (migration `0190_lms_foundation.sql`, additive)

`lms_settings`, `lms_programs`, `lms_courses`, `lms_program_courses`, `lms_course_prerequisites`,
`lms_course_instructors`, `lms_modules`, `lms_lessons`, `lms_enrollments`, `lms_audit_events`; helper functions
`lms_my_member_ids`, `lms_has_course_access`; transactional functions listed above; storage bucket `lms-course-covers`.

Invariants enforced in the database: one open enrollment per student and course (partial unique index); course codes
unique per church; capacity checked under a row lock; enrollment window and "published" checked when enrolling;
published curriculum items are archived, not deleted.

**RLS.** Staff can read their church's rows; owners and admins can write directly; the audit trail is admin-read-only.
Students (members signed in with their phone) can read published courses of their own church (unlisted ones only when
enrolled), their own enrollments, and published modules and lessons of courses they are enrolled in (plus free previews).
They have no write policy anywhere. The four transactional functions are revoked from `public`, `anon` and `authenticated`.

### Environment

No new environment variables. Apply `supabase/migrations/0190_lms_foundation.sql` in Supabase, then move the module out of
*testing* in Super Admin → Feature Flags when ready.

## 3. Phase 2: the learning experience (migration `0191_lms_learning.sql`)

Students use the **mobile app** (Space tab, "Bible School" card). The card appears only when Bible School is
switched on for the church (Beta or Live in Super Admin → Feature Flags, and not switched off by the plan) and the
church has a published course visible to the member.

### What a student can do

- Browse the catalogue (published courses of their church; unlisted ones only once joined), see seats left,
  dates and unmet prerequisites.
- Ask to join a course. The church's rules apply on the server: self-enrollment allowed, enrollment open,
  seats left, prerequisites completed. The result is *pending* (waits for an administrator) or *approved*,
  per the school setting "Enrollment requests wait for an administrator".
- Open the outline and lessons (reading, video, audio, document, resource, external link). Direct media links
  (mp4, m3u8, mp3, m4a ...) play inside the app; other links (YouTube etc.) open outside it. Uploaded files are private.
- Mark lessons complete (and undo), keep a private note, bookmark, resume where they stopped, and move to the
  previous / next unlocked lesson.
- See progress: required lessons done out of required lessons.

### Rules (explicit)

- **Completion.** A course is complete when every *required* lesson that is published, in a published module of a
  published course, is completed. Optional lessons never block it. A course with no required lessons is never
  completed by this rule. Completing is one-way: lessons added later do not reopen a finished course.
- **Access.** A lesson opens for an *approved, active or completed* enrollment, or as a free preview for any member
  of the church. A lesson with an earlier-lesson prerequisite stays locked until that lesson is completed.
- **Starting.** Approved enrollments become *active* the first time a lesson is opened.
- **History.** A lesson that students have opened cannot be deleted (database `restrict`); archive it instead.

### How it is secured

- Every student call is a Postgres function (`lms_catalog`, `lms_my_courses`, `lms_course_outline`,
  `lms_request_enrollment`, `lms_get_lesson`, `lms_complete_lesson`, `lms_save_note`, `lms_lesson_file_access`)
  that works out the member from `auth.uid()`. None takes a member id; none is callable without signing in.
- Progress writes are idempotent and serialised per enrollment (row lock), so two devices or a double tap cannot
  double count or complete a course twice.
- Lesson files are in the private bucket `lms-lesson-files`. The app calls `GET /api/mobile/lms/lesson-file?lessonId=`
  with its session; the route asks the database whether the member may open the lesson (using the member's own
  token) and only then returns a 5-minute signed link. The storage path is never sent to the app.
- Notes are readable only by their author (not even staff). Progress is readable by the student and church staff.
- Reading text is sanitized on the server (allow-list) and drawn by the app from the same small tag set.

### Administrators

- Attach a private file to a lesson (PDF, Word, PowerPoint, Excel, MP3, M4A, MP4; up to 25 MB; counts against storage).
- A course's Enrollments tab and the Enrollments page show each student's progress (required lessons done).

### Videos and audio inside the app (migration `0192_lms_video_progress.sql`)

- **Uploading.** In a video, audio, document or resource lesson, save the lesson, then upload a file: MP4 video up to
  500 MB, MP3 / M4A audio up to 100 MB, PDF / Word / PowerPoint / Excel up to 25 MB. The file goes from the browser
  straight to the private bucket with a one-time upload link the server issued for a path it chose; the server then checks
  the object exists and is within its limit before attaching it. Video and audio lessons are **upload-only** (no link field), so they always play inside the app and their progress is tracked; document and resource lessons take a link or a file; external lessons take a link. A video or audio lesson that already carried a link keeps working until a file replaces it. A lesson cannot be published until it has a file or link.
- **Playing.** The member app streams the file from storage with a 5-minute signed link (the platform seeks and buffers
  as it plays; it does not download the whole file first). Controls: play / pause, back / forward 10 s, speed (0.75x to 2x),
  seek bar, and resume where the member stopped.
- **Tracking.** The app reports its position about every 15 s, on pause, and when the member leaves the lesson
  (`lms_save_playback`). The server counts *watched* seconds: forward movement of the position, never more than the real
  time that passed at up to double speed, so skipping ahead or replaying a section adds nothing. At 90% watched the
  lesson completes by itself (the same function as "Mark as complete", so course completion follows the normal rule).
  Links to YouTube or Vimeo cannot be tracked; they only support "Mark as complete".
- **Limits you should know.** Supabase has a project-wide upload limit (Dashboard → Storage → Settings) that must be at
  least as large as your biggest video. Files are stored and served as uploaded: there is no transcoding or adaptive
  bitrate, so upload H.264 MP4 at 720p or lower. For large audiences or HLS, move video to a streaming host later.
  Playback bandwidth is storage egress and counts against the Supabase plan.

### Phase 2 acceptance checklist (staging, as a member signed in on the app)

1. Bible School at *Testing*: the card is hidden. Move it to Beta: the card appears for a church with a published course.
2. Join a course (pending / approved per the setting); a full or closed course says so; unmet prerequisites block it.
3. Open lessons, mark done, kill and reopen the app on another phone: progress is the same.
4. Finish all required lessons: the course shows Completed; add a new required lesson: it stays Completed.
5. Open a file lesson: the file opens; the same link requested after unenrolling is refused.
5a. Upload a 100 MB MP4 to a video lesson from the dashboard; play it in the app, close it halfway, reopen: it resumes; watch to 90%: the lesson completes by itself.
6. A member of another church sees nothing; a non-enrolled member cannot open a non-preview lesson.

## 3b. Phase 3, part 1: live classes (migration `0193_lms_live_classes.sql`)

Live classes are held in **K-Connect** rooms (video or audio), reusing the existing meeting, call screen, waiting room
and plan limits. Nothing about calls was duplicated.

- **Scheduling.** On a course's **Live classes** tab (or by an assigned instructor): title, optional description, start
  (in the church's time zone), length (15 to 480 minutes), video or audio. Creating a class creates its K-Connect
  meeting (admission off by default) and tells the course's enrolled students by push (and in their app inbox).
  The page `/dashboard/bible-school/live-classes` lists every class across courses.
- **Plan limit.** K-Connect ends a call at the plan's limit (Starter 20 min, Growth 40, Pro none; audio +10). A class
  longer than that is refused when scheduling, so a class is never cut off silently.
- **Changes.** Editing the time resets the reminder and notifies students; cancelling removes the room and notifies them.
- **Joining (students, app).** Bible School → **Live classes** tab. The Join button opens 15 minutes before the start
  and closes at the end. Joining checks the student is enrolled, records them as **present**, and opens the K-Connect
  call screen. Attendance means "opened the class from the app"; it is not proof they stayed.
- **Hosting (teachers, web).** **Start class** opens the K-Connect room. Moderator rights (admit, mute, end) need write
  access on K-Connect (owners and admins have it); an instructor without it joins as a participant.
- **Attendance.** Per class: present / absent / excused counts, and a roster where a teacher can set anyone's mark.
- **Recording.** Added afterwards as an https link; students see "Watch the recording" once the class has ended.
  KingdomFlow does not record calls itself.
- **Reminder.** About 10 minutes before the start (5 to 10, depending on the job's 5-minute tick). It needs a one-time
  setup: run `supabase/setup/lms-class-reminders-cron.sql` in the Supabase SQL editor (with your site address and
  `CRON_SECRET`). It uses Supabase's scheduler, so it works on any Vercel plan. Without it, students still get the
  "new class", "moved" and "cancelled" notifications, just not the reminder.
- **Security.** `lms_my_sessions` and `lms_join_session` take no member id (the member is `auth.uid()`), are closed to
  anonymous callers, and students have no write access to any live class table.

## 3c. People from outside the church (migration `0194_lms_students.sql`)

- Open a program to everyone by setting its visibility to **Open to the public** (a course outside any program can be opened the same way). It then appears on `/bible-school/<church slug>`, where anyone can apply (name, phone, optional email and message). Applications are rate limited and have a honeypot field.
- The team reviews applications in **Bible School → Applications** (admins only) and approves or rejects them. Approving runs `lms_approve_application`, which creates a member with status `student` (or reuses an existing one), enrols them, and emails them if an address was given.
- A student signs in to the mobile app with their phone number and sees **only** the Bible School (public courses, their lessons, live classes). Church-only courses are hidden from them.
- Students are not counted as members: they are left out of the members list, member limit, reports, Aura and platform counts, fees and messaging. They can join live classes they are enrolled in.
- One phone number belongs to one church. A number already used by an active, pending or student record cannot apply again.
- Removing a student sets their status to `left`; their progress is kept.
- Students can learn on the web as well as in the app: see section 3d.
- Paid courses: see section 3d.

## 3d. Program-level enrollment and payment, and the web portal (migrations `0197` and `0198`)

**Hierarchy.** Bible School, Program, Course, Module, Lesson. Students enroll in, and pay for, a **program**
(table `lms_program_enrollments`); that gives them one `lms_enrollments` row (source `program`, linked by
`program_enrollment_id`) in every published course of the program. Course completion rules are unchanged.
A program is completed when every required published course in it is completed (computed in `lms_my_programs`).

**Programs** gained `price_amount` (1 to 100000), `capacity` (seats, approved and active enrollments) and
`visibility` (`organization` or `public`). Seats and the enrollment window of single courses do not apply to
program students (`lms_program_sync_courses` inserts directly). Courses added to a program later are synced to
the people already enrolled (`setProgramCoursesAction`). A course in a published program cannot be joined
alone (`lms_request_enrollment` raises "part of the program"); a course in no program still can, free.
The course-level fee column (`lms_courses.price_amount`, migration 0197) is unused by the screens; a course
with a fee is still refused by `lms_request_enrollment`.

**Functions** (all `security definer`, member from `auth.uid()` for the student ones): `lms_program_catalog`,
`lms_program_courses_list`, `lms_my_programs`, `lms_request_program`, `lms_course_program`,
`lms_program_visible`; server-only: `lms_enroll_program`, `lms_decide_program_enrollment`,
`lms_program_sync_courses`, and `lms_approve_application(p_org, p_application, p_course, p_actor, p_program)`.
Students from outside see only public programs; church members see public and church-only ones.

**Payment.**
- Fees need the church's Finance plan and are collected on KingdomFlow's shared PayU account. The church is
  paid out from Payouts (stream "Course fees": `course_payouts`, `course_payout_requests`, one balance per
  church, 2.5% service fee), recorded in Super Admin like membership fees.
- Flow: `createProgramOrder` writes `lms_payment_orders` (program_id), the person opens
  `/bible-school/checkout/<order>` which posts to PayU, and `/api/payu/bible-school/return` verifies PayU's
  hash and calls `finalizeProgramPayment`: the order is claimed once ("created" to "paid"), then the person is
  enrolled (`lms_enroll_program` with source `payment`, or `lms_approve_application` with the program for
  an outsider's application).
- Outsiders: applying for a program with a fee creates the application "waiting for payment" and goes to
  checkout; paying approves and enrolls them. An application waiting for payment cannot be approved by hand.
- A full program is refused before payment. If enrollment fails after money was taken, the order stays paid
  and an error is logged to platform events for the team to settle by hand. There is no automatic refund.
- The app and the portal call `POST /api/mobile/bible-school/checkout` with `{ programId }`; the payer is
  worked out from the session.

**Admin screens.** Programs (fee, seats, visibility, courses), Programs → Enrollments
(`/dashboard/bible-school/programs/<id>`: enroll, approve, reject, withdraw), Applications (approve into a
program), Guide (`/dashboard/bible-school/guide`, the in-product documentation).

**Web student portal.** `/bible-school/learn`: sign in with a mobile number and a texted code. Programs
(join or pay), My courses, course outline, lessons (reading, video and audio with resume and tracked watch
time, documents), notes and bookmarks, mark complete, and live classes (opens the K-Connect room). It uses the
same database functions and rules as the app, with the student's own session. A phone-only sign-in is sent
back to the portal from the team dashboard, onboarding and the staff login pages (proxy).

## 3e. Quizzes, grading and certificates (migration `0202_lms_quizzes_certificates.sql`)

- **Model.** A quiz is a lesson of type `quiz` with a settings row (`lms_quizzes`: pass percent, attempts, show answers, instructions), questions (`lms_quiz_questions`: single, multiple, true_false, short; options with a `correct` flag) and attempts (`lms_quiz_attempts`: answers, per-question marks, scores, status `submitted` while a written answer waits, `graded` when final).
- **Answers stay on the server.** Students have no policy on the questions table. `lms_get_quiz` returns questions without the `correct` flags; `lms_submit_quiz` marks choice questions in SQL (a multiple choice must be exactly right) and returns the attempt. Right answers and explanations come back only when `show_answers` is set and the attempt is `graded` (`lms_attempt_json`).
- **Rules enforced in the database.** Enrolled students of a visible course only, the earlier-lesson prerequisite, one open attempt at a time (the enrollment row is locked), attempt limit, no retake after passing, no attempt while one waits.
- **Completion.** Passing runs the same finishing logic as a manual completion (`lms_finish_lesson_for`), so required quizzes count towards the course. `lms_complete_lesson` refuses a quiz lesson that has not been passed.
- **Grading.** `lms_grade_attempt` (server only) takes marks for the written questions, clamps them to each question's points, recalculates, and completes the lesson if it now passes.
- **Certificates.** A trigger on `lms_enrollments` issues a course certificate when a status becomes `completed`, and a program certificate once every required course of an approved program is completed (which also marks the program enrollment `completed`). `lms_certificates` has a unique 12-character `code`, the student name and title as at issue, the average of best quiz results, and `revoked_at`. `lms_verify_certificate` is callable by anyone and returns only name, title, school, date, result and whether it was revoked. Existing completed enrollments were back-filled.
- **Screens.** Curriculum builder: Questions editor. Grading tab (written answers, gradebook). Certificates tab (list, PDF, check, revoke). Settings: certificates on/off and signer. Public: `/verify/certificate/<code>` and `/api/certificate/<code>` (PDF via jsPDF). Students: quiz inside the lesson and a Certificates tab, in the app and on the web portal.

## 4. Tests

- `src/lib/lms/lms.test.ts`: validation, the enrollment state machine, capacity, enrollment window, who can manage a course.
- `src/lib/lms/migration.test.ts`: structural checks on the migration (RLS on every table, church id on every table,
  students never get write policies, transactional functions locked down, additive only).
- Phase 2: `0191` structure tests (RLS, no student writes, functions closed to anonymous callers, no member-id arguments, progress restrict, private bucket); progress and file-type rules; app tests for progress, course navigation (next / previous / resume), catalogue seats and dates, media link detection and the reading-lesson renderer.
- `src/lib/lms/db.test.ts` runs the migrations in a real Postgres (PGlite, in-process, with a small stand-in for Supabase's `auth.uid()`, roles and buckets) and exercises the student and teacher functions and the row level security as different people: joining, locked lessons, completion, watch-time credit, notes privacy, other-church isolation, seat limits, enrollment windows, reordering, live-class joining and attendance, and the feature switch. Update the stub (`src/lib/lms/test-support/supabase-stub.sql`) if a migration starts to rely on more of Supabase.
- **Not covered by tests**: the server actions against Supabase itself (storage uploads, signed links), the screens, and the mobile app on a device. Running the migrations and the RLS policies against a real database, and clicking through the screens.
  There is no database in the development environment; this must be done on staging before rollout (checklist below).

### Staging checklist (run as each role)

1. As an admin: create a program and a course, add a module and lessons, publish them, publish the course.
2. Assign an instructor with a linked login; sign in as that login: they see only that course's curriculum and roster.
3. Enroll a member; with a seat limit of 1, enrolling a second member is refused. Approve / reject a pending one.
4. As a signed-in member (app login), a direct query for `lms_lessons` returns rows only for courses they are enrolled in.
5. As a login from another church: no row of this church is readable.

## 5. Known limitations

- Course fee refunds are done by hand; there is no automatic refund or partial payment.
- Prerequisites are enforced when a member asks to join; an administrator enrolling directly can override them.
- YouTube / Vimeo links open outside the app; only direct media files and uploaded files play inside it.
- Notifications to students (approval, new lessons) arrive with phase 3.
- Lesson types quiz, assignment and live session are reserved in the database but cannot be created yet.
- Member pickers load up to 2,000 active members and filter in the browser.
- Instructor edit rights need a linked team login; instructors without one cannot edit from the web.
- Plan limits (courses, students, storage) and course fees are not wired in (phase 5).

## 6. Phases

1. **Foundation** (done).
2. **Learning experience** (done): student portal in the mobile app, catalogue, lesson player, progress, completion rules, secure files.
3. Teaching operations: live classes with attendance and notifications (**done**); assignments, submissions, grading (next).
4. Assessments and certification: quizzes and exams, gradebook, PDF certificates and verification.
5. Reporting and commercial readiness: dashboards, plan entitlements, usage limits, audit coverage, performance and accessibility review.

## 7. Behaviours worth knowing

- **Seats.** A course's seat limit counts *approved and active* students. A student who has *completed* the course no longer holds a seat, so a self-paced course keeps taking new students; a pending request never holds a seat.
- **Attendance.** A student is marked present when they open a live class from the app. A teacher can change any mark.
