import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { LMS_BASE_PATH } from "@/lib/lms/constants";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Guide | Bible School | KingdomFlow",
};

// How the Bible School fits together and how to run it, written for the church team. The same
// structure drives everything: Bible School, then Programs, then Courses, then Modules, then Lessons.
const LEVELS = [
  {
    name: "Bible School",
    text: "Your church's school. One per church: its name, rules for joining, and a public page for people outside the church.",
    where: "Settings",
    href: "/settings",
  },
  {
    name: "Program",
    text: "A group of courses that people join, and pay for, as one (for example Discipleship Year). Enrollment and payment happen here.",
    where: "Programs",
    href: "/programs",
  },
  {
    name: "Course",
    text: "One subject inside a program, with its teachers, dates and live classes. A person is enrolled in a course because they joined its program.",
    where: "Courses",
    href: "/courses",
  },
  {
    name: "Module",
    text: "A chapter or week inside a course. It keeps the lessons in order.",
    where: "Course → Curriculum",
    href: "/courses",
  },
  {
    name: "Lesson",
    text: "A single reading, video, audio, document or link. Lessons are what students open, watch and complete.",
    where: "Course → Curriculum",
    href: "/courses",
  },
];

const STEPS = [
  {
    title: "1. Set up the school",
    body: [
      "Open Settings: the school name, the default language, whether members may ask to join, and whether requests wait for an administrator.",
      "The module must be switched on for your church. If you see a locked page, use Contact us to enable.",
    ],
  },
  {
    title: "2. Create a program",
    body: [
      "Programs → New program. Give it a name, a short description and what students will learn.",
      "Set the program fee in rupees (blank for free), the number of seats (blank for no limit), and who can join: church members only, or open to the public.",
      "Publish it when its courses are ready. A program that is not published takes no enrollments.",
    ],
  },
  {
    title: "3. Add courses to the program",
    body: [
      "Create each course under Courses (title, level, language, dates, optional seat limit). Then open the program, press Courses, and tick the courses in the order students should take them.",
      "A course that belongs to a program is joined through the program. A course in no program can still be joined on its own, for free.",
      "Courses added later are given automatically to everyone already in the program.",
    ],
  },
  {
    title: "4. Build the curriculum",
    body: [
      "Open the course, Curriculum. Add modules, then lessons in each. Choose the type: reading, video, audio, document, resource or link.",
      "Upload video and audio (MP4 up to 500 MB, MP3 or M4A up to 100 MB). The length is read from the file for you. Documents take a file up to 25 MB or a link.",
      "Mark a lesson required if it counts towards finishing the course, free preview if anyone in the church may open it first, and optionally the earlier lesson it needs.",
      "Publish each module and lesson, then publish the course.",
    ],
  },
  {
    title: "5. Enroll people",
    body: [
      "Members and students join a program themselves in the app or on the web portal. Free programs are approved by you or automatic, depending on Settings. Programs with a fee are paid online and the person is enrolled as soon as the payment is confirmed.",
      "To enroll someone yourself: Programs → Enrollments on the program → search the member → Enroll. You can also approve, reject or withdraw people there.",
      "Enrolling or approving someone in a program enrolls them in every course of it. Withdrawing them takes those course enrollments away and keeps their progress.",
    ],
  },
  {
    title: "6. People from outside the church",
    body: [
      "Set a program to Open to the public. Share your Bible School page (shown under Applications) on WhatsApp or social media.",
      "A visitor chooses a program and applies. For a free program you review the application under Applications and approve it. For a program with a fee they pay first and are enrolled automatically.",
      "They sign in with their mobile number, on the web or in the app, and see only the Bible School.",
    ],
  },
  {
    title: "7. Payments and payouts",
    body: [
      "Program fees are collected on KingdomFlow's secure payment account. A 2.5% service fee applies.",
      "Open Payouts, check Course fees, and request a payout. Your payout details are saved there once. We pay out and record it.",
      "Refunds are handled by hand: contact us with the payment details.",
    ],
  },
  {
    title: "8. Live classes",
    body: [
      "On a course, Live classes → schedule a class: title, start, length (video or audio). Enrolled students are notified and reminded.",
      "Students join from 15 minutes before the start. Joining marks them present; you can change anyone's mark afterwards.",
      "Add a recording link after the class so students can watch it later.",
    ],
  },
  {
    title: "9. Follow progress",
    body: [
      "A course is finished when every required published lesson is complete. A video or audio lesson completes by itself at about 90% watched. A program is finished when its required courses are finished.",
      "Programs → Enrollments shows each student's courses done. Enrollments shows course progress.",
    ],
  },
  {
    title: "10. Quizzes, grading and certificates",
    body: [
      "Add a lesson of type Quiz, save it, then press Questions to write it: one correct answer, several correct answers, true or false, or a written answer you mark yourself. Set the pass mark and how many attempts students get.",
      "Passing the quiz is what completes its lesson, so a required quiz counts towards finishing the course. Once students have taken a quiz its questions are locked.",
      "Written answers appear under Grading → Waiting to be marked. The Gradebook shows each student's best result on every quiz and their average.",
      "A certificate is given automatically when a student finishes a course, and another for a whole program. Set who signs them in Settings. The Certificates tab lists them, with a PDF, a public check link (anyone can check a code) and Revoke.",
    ],
  },
];

export default function GuidePage() {
  return (
    <div className="space-y-8">
      <div>
        <h2 className="font-heading text-2xl font-bold">
          How the Bible School works
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Everything is organised in five levels. You build from the top down;
          students join at the Program level.
        </p>
      </div>

      <ol className="space-y-2">
        {LEVELS.map((level, index) => (
          <li key={level.name} style={{ marginLeft: index * 16 }}>
            <Card>
              <CardContent className="flex flex-wrap items-center gap-3 py-3">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{level.name}</p>
                  <p className="text-sm text-muted-foreground">{level.text}</p>
                </div>
                <Link
                  href={`${LMS_BASE_PATH}${level.href}`}
                  className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                >
                  {level.where}
                  <ChevronRight className="size-4" />
                </Link>
              </CardContent>
            </Card>
          </li>
        ))}
      </ol>

      <Card>
        <CardContent className="space-y-2 text-sm">
          <p className="font-medium">Example</p>
          <p className="text-muted-foreground">
            Bible School → <strong>Discipleship Year</strong> (program, ₹999) →
            <strong> Foundations of Faith</strong> and{" "}
            <strong>Prayer and Worship</strong> (courses) → Week 1: Who is God?
            (module) → Lesson 1, a 12 minute video. A student pays ₹999 once for
            the program and is enrolled in both courses.
          </p>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <h2 className="font-heading text-xl font-bold">Step by step</h2>
        {STEPS.map((step) => (
          <Card key={step.title}>
            <CardContent className="space-y-2">
              <p className="font-medium">{step.title}</p>
              <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                {step.body.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="space-y-1 text-sm">
          <p className="font-medium">Where students learn</p>
          <p className="text-muted-foreground">
            In the KingdomFlow app (Space → Bible School for members; outside
            students go straight to it), or on the web at{" "}
            <code className="rounded bg-muted px-1">/bible-school/learn</code>.
            Both use a mobile number and a texted code.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
