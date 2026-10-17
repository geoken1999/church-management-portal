# Bible School: step-by-step guide

For church admins and teachers (web dashboard) and for students (mobile app).
Technical details (database, security, tests) are in [bible-school.md](./bible-school.md).

## Part 0. Before you start (platform owner, once)

1. Apply the Supabase migrations `0190` to `0194` (`supabase/migrations/`), then deploy the web app, then release the mobile app.
2. In **Super Admin → Feature Flags**, move **Bible School** from *Testing* to *Beta* or *Live*. Until then the menu and app card stay hidden.
3. In Supabase **Storage → Settings**, set the upload limit to at least your biggest video (500 MB is the app's maximum).
4. For the 10-minute class reminder, run `supabase/setup/lms-class-reminders-cron.sql` once in the Supabase SQL editor (with your site address and `CRON_SECRET`). Without it, students still get "new class", "moved" and "cancelled" notifications but no reminder.
5. Check the church's plan allows Bible School. A plan can switch it off.

## Part 1. Set up the school (admin, web)

Open **Dashboard → Bible School**. The overview shows counts of courses, students and enrollments.

### Step 1. Settings
1. Go to **Settings**.
2. Set the school name and default language.
3. Choose the enrollment rules:
   - **Allow members to ask to join**: off means only admins can enrol people.
   - **Enrollment requests wait for an administrator**: on means requests are *pending* until you approve them; off approves them straight away.
4. Save.

### Step 2. Programs (optional)
A program groups courses into a track (for example "Discipleship Year").
1. Go to **Programs → New program**, give it a name and description.
2. Add courses to it later from the program page.

### Step 3. Create a course
1. Go to **Courses → New course**.
2. Fill in title, code (unique in your church), description, level, language, delivery mode, estimated hours.
3. Optional: cover image, seat limit, enrollment open and close dates, start and end dates, prerequisite courses.
4. Set **Visibility**:
   - *Church members*: only your members see it.
   - *Unlisted*: only people who were enrolled or invited see it.
   - *Open to the public*: also shown on your public Bible School page for people outside the church (see Part 3).
5. Save. The course starts as a **draft**; nobody sees it yet.

### Step 4. Build the curriculum
Open the course, then the **Curriculum** tab.
1. **Add a module** (a chapter or week) and give it a title.
2. **Add lessons** inside it. Choose the type:
   - *Reading*: write the text in the editor (headings, lists, links).
   - *Video* or *Audio*: upload a file (see Step 5). There is no link option; these always play inside the app.
   - *Document* or *Resource*: upload a PDF, Word, PowerPoint or Excel file, or give a link.
   - *External link*: a web page (YouTube and Vimeo open outside the app).
3. For each lesson set whether it is **required** (counts toward completion), whether it is a **free preview** (anyone in the church can open it before joining), its duration, and optionally an **earlier lesson it needs** (keeps it locked until that lesson is done).
4. Reorder modules and lessons as needed.
5. **Publish** each module and lesson. A lesson cannot be published until it has its file, text or link.

### Step 5. Upload video, audio and files
1. Save the lesson first, then use **Upload file** in the lesson.
2. Limits: MP4 video up to 500 MB, MP3/M4A audio up to 100 MB, documents up to 25 MB. Use H.264 MP4 at 720p or lower for smooth playback.
3. The file goes straight to private storage. Wait for the "uploaded" message before leaving the page.
4. You can attach a file while creating a lesson; it uploads as soon as the lesson is saved.
5. Replacing a file keeps the lesson and its progress.

### Step 6. Assign teachers
1. Open the course, **Instructors** tab, add team members or members as instructors.
2. An instructor with a linked team login sees and edits only their own courses. Without a linked login they appear as the teacher but cannot edit from the web.

### Step 7. Publish the course
1. Check at least one module and one *required* lesson are published.
2. On **Details**, change the status to **Published**. Members now see it in the app.
3. To retire a course, **Archive** it. Courses and lessons with history are archived, not deleted.

## Part 2. Enrolling church members

### Members ask to join (app)
They see requests in **Enrollments**. Open **Bible School → Enrollments**, filter by *Pending*, then **Approve** or **Reject**. Rules checked automatically: self-enrollment allowed, enrollment window open, seats left, prerequisites finished.

### You enrol them directly
1. Open the course, **Enrollments** tab (or the Enrollments page), **Enroll**.
2. Pick the member. This can override prerequisites.

### Statuses
*Pending* → *Approved* → *Active* (first lesson opened) → *Completed*. An admin can also **Withdraw** someone. Seats count approved and active students; a completed student frees their seat.

## Part 3. People from outside the church

1. Set the course visibility to **Open to the public** and publish it.
2. Share your page: `/bible-school/<your church slug>` (for example on social media or WhatsApp). It lists your public courses.
3. A visitor chooses a course and applies with name, phone, optional email and message.
4. Open **Bible School → Applications** (admins only). Review each one and **Approve** or **Reject**.
   - Approving creates a *student*, enrols them in the course, and emails them if they gave an address.
   - A number already used by a member of this or another church, or already waiting, is refused with a clear reason.
5. The student installs the KingdomFlow app and signs in with their phone number. They see **only** the Bible School.
6. To remove a student, use **Remove** in Applications. Their progress is kept.

Students are not counted as church members: they do not appear in the members list, member limit, reports, messaging or fees. One phone number belongs to exactly one church.

## Part 4. Live classes

1. Open the course, **Live classes** tab (or **Bible School → Live classes** to see all).
2. **Schedule a class**: title, description, start time (your church's time zone), length (15 to 480 minutes), video or audio.
3. The class is created in a K-Connect room and enrolled students get a push notification. Length cannot exceed your plan's K-Connect call limit; you are told when scheduling.
4. About 10 minutes before the start students get a reminder (needs the one-time setup in Part 0).
5. At class time press **Start class** to open the room. Moderator controls need write access to K-Connect.
6. Students see the class under **Bible School → Live classes** in the app; **Join** opens 15 minutes before the start. Joining marks them *present*.
7. After the class, open **Attendance** to change anyone to present, absent or excused.
8. Add the **recording link** (https) afterwards; students then see "Watch the recording".
9. Editing the time notifies students again; cancelling removes the room and notifies them.

## Part 5. Student guide (mobile app)

### Sign in
- *Church members*: sign in with your phone number (OTP), then open **Space → Bible School**.
- *Outside students*: sign in with the phone number you applied with. The app opens straight on the Bible School.

### Find and join a course
1. **All courses** shows what you can join, with seats left, dates and any prerequisites you still need.
2. Tap a course, then **Join**. You are either approved at once or *pending* until the school approves you.

### Learn
1. **My courses** shows your courses and progress.
2. Open a course to see modules and lessons. Locked lessons open when the earlier lesson is done.
3. **Video lessons**: play/pause, back/forward 10 seconds, speed (0.75x to 2x), seek bar, and **full screen** (the video turns sideways; tap for controls). It resumes where you stopped.
4. **Audio lessons**: same controls without full screen.
5. **Reading, documents, links**: read in the app; files open from a private link; web links open in your browser.
6. Keep a private **note** and **bookmark** a lesson (only you can see them).
7. Use **Previous / Next** to move between lessons.

### Completing lessons and courses
- Video and audio lessons **complete by themselves** when you have watched about 90%, or reach the end after watching. Skipping ahead does not count.
- Other lessons: tap **Mark as complete** (tap again to undo).
- A course is **complete** when all required lessons are done. Adding new lessons later does not reopen a finished course.

### Live classes
Open the **Live classes** tab, **Join the class** when it opens, and later **Watch the recording** if the teacher added one. Notifications tell you about new, moved and cancelled classes.

### Language and sign out
Language is under the profile (members) or the **⋮** menu (outside students). Switch between English, Hindi and Tamil.

## Part 6. Quick reference

| Task | Where |
| --- | --- |
| School name, enrollment rules | Bible School → Settings |
| Group courses | Programs |
| Create and publish a course | Courses → course → Curriculum / Details |
| Approve join requests | Enrollments |
| Approve outside applicants | Applications |
| Schedule and take attendance | Course → Live classes |
| Move out of testing | Super Admin → Feature Flags |

## Part 7. Troubleshooting

| Problem | Cause and fix |
| --- | --- |
| Bible School menu or app card missing | Feature is still *Testing*, or the plan switches it off, or the church has no published course visible to the member. |
| Course not visible to members | Course or its modules and lessons are still draft. Publish them. |
| Cannot publish a lesson | It has no file, text or link yet. |
| Video upload fails | File over the limit, not MP4, or the Supabase storage upload limit is smaller than the file. |
| Video does not complete | It must reach about 90% *watched*; skipping ahead adds nothing. Student can also tap **Mark as complete** if allowed. |
| "This course is full" | Seat limit reached by approved and active students. Raise the limit or wait for completions. |
| Student cannot join a class | Not enrolled, or the Join button has not opened yet (15 minutes before start). |
| Class refused when scheduling | Longer than the plan's K-Connect call limit. Shorten it. |
| No class reminder | The cron setup in Part 0 step 4 was not run. |
| Applicant refused | Phone already registered with a church, already waiting, or not a 10-digit number. |
| Student sees church features | They should not; students are blocked from every church screen. Report it. |

## Part 8. Not available yet

Assignments and grading, quizzes and exams, gradebook, certificates, reports, plan limits for Bible School, and paid courses are planned for later phases.
