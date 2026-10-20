# Bible School: complete guide

For church admins, teachers and students. Technical details (database, security, tests) are in
[bible-school.md](./bible-school.md). The same guide is inside the dashboard: **Bible School → Guide**.

## 1. How it fits together

Everything is built from five levels, top to bottom:

```
Bible School            your church's school (one per church)
└── Program             a group of courses; students JOIN and PAY here
    └── Course          one subject in the program
        └── Module      a chapter or week of the course
            └── Lesson  a reading, video, audio, document or link
```

Example: *Bible School → Discipleship Year (program, ₹999) → Foundations of Faith (course) → Week 1: Who is
God? (module) → Lesson 1, a 12-minute video.*

Rules that follow from this:

- **Enrollment and payment are at program level.** A student joins one program, pays once for it, and is
  enrolled in every course of it. They never pick or pay for courses one by one.
- A course that belongs to a program cannot be joined on its own. A course in **no** program can still be
  joined on its own, for free (useful for a single class).
- Courses added to a program later are given automatically to everyone already enrolled in it.
- A **course** is finished when every required published lesson is complete. A **program** is finished when
  its required courses are finished.

## 2. Before you start (platform owner, once)

1. Apply the Supabase migrations `0190` to `0203` in `supabase/migrations/`, then deploy the web app, then
   release the mobile app.
2. **Super Admin → Feature Flags**: move **Bible School** from *Testing* to *Beta* or *Live*.
3. **Super Admin → the church → Bible School card**: turn it **On** for the church (the church asks with
   "Contact us to enable"; agree the setup and billing first).
4. Supabase **Storage → Settings**: set the upload limit to at least your biggest video (500 MB maximum).
5. For the class reminder run `supabase/setup/lms-class-reminders-cron.sql` once (with your site address
   and `CRON_SECRET`). Without it students still get new, moved and cancelled class notifications.
6. The church needs the **Finance** plan to charge program fees (like paid events).

## 3. Build the school (church admin, web)

Open **Dashboard → Bible School**. The tabs are: Overview, Programs, Courses, Enrollments, Live classes,
Applications, Guide, Settings.

### 3.1 Settings (the Bible School level)
1. **Settings**: school name, default language.
2. **Allow members to ask to join**: off means only admins can enroll people.
3. **Enrollment requests wait for an administrator**: on = requests are *pending* until you approve; off =
   approved straight away.

### 3.2 Create a program
1. **Programs → New program**: name, description, what students will learn.
2. **Program fee in ₹**: blank for free. Fees are charged once, for the whole program.
3. **Seats**: blank for no limit. Seats count approved and active enrollments.
4. **Who can join**: *Church members only*, or *Open to the public* (shown on your public Bible School page).
5. Save, add courses (3.3), then **Publish**. An unpublished program takes no enrollments.

### 3.3 Create courses and add them to the program
1. **Courses → New course**: title, code (unique in your church), description, level, language, delivery
   mode, estimated hours; optional cover, dates, seat limit, prerequisite courses.
2. The course starts as a draft. Publish it when its curriculum is ready.
3. Open the program (**Programs**), press **Courses**, and tick its courses in the order students should take
   them. Save.

### 3.4 Build the curriculum (module and lesson level)
Open the course, **Curriculum**.
1. **Add a module** (a chapter or week).
2. **Add lessons** to it. Types: reading, video, audio, document, resource, link.
   - *Reading*: type in the editor (headings, lists, links).
   - *Video* / *Audio*: upload a file. There is no link option, so they always play inside the app and their
     progress is tracked. The length is read from the file for you.
   - *Document* / *Resource*: upload a file (PDF, Word, PowerPoint, Excel up to 25 MB) or give a link.
   - *Link*: a web page (YouTube and Vimeo open outside the app).
3. Per lesson set: **required** (counts towards finishing the course), **free preview** (anyone in the
   church may open it before joining), and optionally the **earlier lesson it needs**.
4. Reorder with the arrows. **Publish** each module and lesson, then publish the course.

Uploads: MP4 video up to 500 MB, MP3 or M4A audio up to 100 MB, documents up to 25 MB. Use H.264 MP4 at
720p or lower. Save the lesson first, then upload; wait for the confirmation before leaving the page.

### 3.5 Teachers
Course → **Instructors**: add team members or members. An instructor with a linked team login edits only
their own courses. Without a linked login they appear as the teacher but cannot edit from the web.

## 4. Enroll people (program level)

### 4.1 People ask to join (app or web portal)
- A **free program**: the student presses *Join this program*. It is approved automatically or waits for you,
  depending on Settings. Approve or reject under **Programs → Enrollments** (open the program).
- A **program with a fee**: the student presses *Pay ₹X and join*, pays online, and is enrolled the moment
  the payment is confirmed. No approval step.

### 4.2 You enroll someone
**Programs → Enrollments** (on the program) → search the member → *Approved now* or *Pending* → **Enroll**.
You can also **Approve**, **Reject** or **Withdraw** people there.

### 4.3 What happens to courses
- Approving or enrolling a person in a program gives them an enrollment in each published course of it.
- Withdrawing them from the program withdraws those course enrollments. Their progress is kept.
- Course seat limits and enrollment dates do not apply to program students; the program's own seats do.

### 4.4 Statuses
*Pending* → *Approved* → *Active* (first lesson opened) → *Completed*. Also *Rejected* and *Withdrawn*.

## 5. Payments and payouts (program fees)

1. Program fees go through KingdomFlow's secure payment account (Razorpay), like paid events.
2. A 2.5% service fee applies. Collected fees appear in **Payouts → Course fees**.
3. **Payouts**: save your payout details once and press *Request payout*. We pay and record it.
4. Refunds are by hand: contact us with the payment details. If a payment is taken but the person cannot
   be enrolled (for example the program just filled up), the payment is kept and flagged for our team to
   settle.

## 6. People from outside the church

1. Set the program to **Open to the public** and publish it.
2. Share your Bible School page (**Applications** shows the link): `yourdomain/bible-school/<church slug>`.
   To share one program, press **Copy share link** or **Share on WhatsApp** on it under **Programs** (public, published programs only). The link opens your page with that program shown first and pre-selected in the form: `yourdomain/bible-school/<church slug>?program=<id>`.
3. A visitor picks a program and applies with name, mobile number, optional email and message.
4. **Free program**: you review under **Applications** and approve or reject.
   **Program with a fee**: they pay first and are approved and enrolled automatically.
5. Approving creates a *student*. They sign in with their mobile number, on the web at
   `/bible-school/learn` or in the app, and see only the Bible School.
6. A mobile number belongs to one church. A number that is already a member, a student, waiting, or in
   another church is refused with a clear reason.
7. Students are not counted as church members: they are left out of the member list, limits, reports,
   messaging and fees. **Remove** in Applications ends their access and keeps their progress.

## 7. Live classes
1. Course → **Live classes** → schedule: title, start, length (15 to 480 minutes), video or audio. Length
   cannot exceed your plan's K-Connect limit.
2. Enrolled students are notified and reminded about 10 minutes before.
3. At class time press **Start class**. Students can join from 15 minutes before; joining marks them present.
4. Afterwards set attendance (present, absent, excused) and add a recording link.
5. Editing the time notifies students again; cancelling removes the room and notifies them.

## 7b. Quizzes, grading and certificates

### Quizzes
1. In a module add a lesson of type **Quiz**, save it, then press **Questions** on it.
2. Set the **pass mark** (percent), the **attempts allowed** (blank = no limit) and whether students see the right answers once an attempt is marked.
3. Add questions. Kinds: *one correct answer*, *more than one correct answer* (the student must pick exactly the right set), *true or false*, and *written answer* (you mark it). Each has points and an optional explanation.
4. Save, then **Publish** the lesson. A quiz cannot be published without questions.
5. A quiz lesson is completed only by **passing** it. A required quiz therefore counts towards finishing the course. Students cannot tick it off by hand.
6. Once a student has taken the quiz, its questions are locked (the settings can still change), so existing results stay valid.

### Assignments
1. In a module add a lesson of type **Assignment**, save it, then press **Instructions** on it.
2. Write what students should hand in, set what it is **marked out of**, an optional **due date**, and whether they can hand in **typed text**, **a file** (PDF, Word, PowerPoint, Excel, text, pictures or a zip, up to 25 MB), or both.
3. Save, then **Publish** the lesson. It cannot be published without instructions.
4. Handing in **completes the lesson**, so a required assignment counts towards finishing the course without waiting for you to mark it.
5. A hand-in after the due date is accepted and shown as **Late**. Until you mark it the student can replace their hand-in; after you mark it, they can't.
6. Hand-ins appear under **Grading → Assignments waiting to be marked**: read the text, open the file, give a mark from 0 to the maximum, add feedback and save. The student gets a notification and sees the mark and feedback on the lesson. The latest marked work stays below, where you can change a mark.
7. Instructors see and mark only the courses they teach. Students' files are private: only the student and the teachers of that course can open them.

### Grading
- Choice questions are marked by the system the moment the student submits.
- A quiz with a **written answer** waits: it shows under **Grading → Waiting to be marked**. Give marks (0 up to the question's points) and optional feedback; the result, pass or fail, and completion follow when you save.
- **Grading → Gradebook**: pick a course to see each student's best result on every quiz and their average and grade (A 90+, B 80+, C 70+, D 60+).
- Instructors see and mark only the courses they teach.

### Certificates
- A certificate is given **automatically** when a student finishes a course, and another when they finish a whole program. The result on it is the average of their best quiz results (blank for a course with no quizzes).
- **Settings → Certificates**: turn them on or off, and set who signs them.
- **Certificates** tab: every certificate with a PDF link, a check link and **Revoke**.
- Each has a 12-character code. Anyone can check it at `/verify/certificate/CODE`, which shows only the name, what it is for, the date and the result, and says so if it was withdrawn.
- Students find their certificates under **Certificates** in the app and on the web portal, and can download the PDF.
- Courses finished before this feature existed were given certificates when it was switched on.

## 8. Student guide

### Sign in
Mobile number and a texted code, in the app (members: Space → Bible School; outside students open straight
into it) or on the web at `/bible-school/learn`.

### Join a program
1. **Programs** shows what is open: price, seats left, courses and lessons.
2. Open one and press **Join this program** (free) or **Pay ₹X and join**. After paying in the browser, return
   to the app; the program opens up.
3. Single courses (in no program) are listed under *Single courses*.

### Learn
1. **My courses** shows your programs and courses with progress.
2. Open a course for its modules and lessons. A lesson locked behind an earlier one opens when that one is done.
3. Video: play/pause, 10-second skips, speed, full screen, and it resumes where you stopped.
4. Audio and reading lessons work the same way. Documents open from a private link.
5. Keep private notes and bookmarks. Previous and Next move between lessons.

### Assignments
Open an assignment lesson, read what to hand in and when it is due. Type your answer, attach a file, or both (as allowed), and press **Hand in**. The lesson is complete at once. You can change your hand-in until your teacher marks it; then your mark and feedback appear on the same screen and you get a notification. A hand-in after the due date still counts but is marked late.

### Quizzes
Open a quiz lesson and press **Start the quiz**. Choice questions are marked at once and you see which were right (if your teacher allows it). A written answer waits for your teacher. Pass the pass mark to complete the lesson; if you fall short you can try again until your attempts run out.

### Certificates
When you finish a course (or a whole program) you get a certificate: open the **Certificates** tab in the app or the web portal to download it.

### Finish
- Video and audio lessons complete by themselves at about 90% watched (skipping ahead does not count).
- Other lessons: press **Mark as complete**.
- A course is complete when its required lessons are; a program is complete when its required courses are.

### Live classes
The **Live classes** tab: *Join the class* when it opens, *Watch the recording* afterwards.

## 9. Quick reference

| I want to... | Go to |
| --- | --- |
| Set school rules | Bible School → Settings |
| Create a program, set its fee, seats and visibility | Programs |
| Add courses to a program | Programs → Courses |
| See or change who is in a program | Programs → Enrollments |
| Build modules and lessons | Courses → course → Curriculum |
| Review outside applicants | Applications |
| Schedule a class, take attendance | Live classes / course → Live classes |
| Collect program fees | Payouts → Course fees |
| Learn how it all fits | Bible School → Guide |

## 10. Troubleshooting

| Problem | Cause and fix |
| --- | --- |
| Menu or app card missing | Feature is in *Testing*, the plan switches it off, or the church has not been switched on in Super Admin. |
| Students cannot see a program | It is unpublished, church-only (for outsiders), or full. |
| "This course is part of the program..." | The course belongs to a program: join the program instead. |
| Cannot publish a lesson | It has no file, text or link yet. |
| Video upload fails | Over the limit, not MP4, or Supabase's upload limit is smaller than the file. |
| Video will not complete | It needs about 90% *watched*; skipping ahead adds nothing. |
| "This program is full" | Seats are used by approved and active students. Raise the limit or wait for completions. |
| Paid but not enrolled | The payment is kept and flagged for our team; contact us with the payment details. |
| Applicant refused | The number is already a member, a student, waiting, or in another church, or is not 10 digits. |
| Student cannot join a class | Not enrolled, or the Join button has not opened yet (15 minutes before the start). |
| No class reminder | The reminder job in section 2, step 5 was not set up. |

## 11. Not available yet

Automatic refunds, exams with time limits or question banks, reports, and plan limits for the Bible School.
