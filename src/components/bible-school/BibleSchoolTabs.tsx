"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LMS_BASE_PATH } from "@/lib/lms/constants";

const TABS = [
  { href: LMS_BASE_PATH, label: "Overview", exact: true, adminOnly: false },
  {
    href: `${LMS_BASE_PATH}/programs`,
    label: "Programs",
    exact: false,
    adminOnly: true,
  },
  {
    href: `${LMS_BASE_PATH}/courses`,
    label: "Courses",
    exact: false,
    adminOnly: false,
  },
  {
    href: `${LMS_BASE_PATH}/enrollments`,
    label: "Enrollments",
    exact: false,
    adminOnly: false,
  },
  {
    href: `${LMS_BASE_PATH}/live-classes`,
    label: "Live classes",
    exact: false,
    adminOnly: false,
  },
  {
    href: `${LMS_BASE_PATH}/applications`,
    label: "Applications",
    exact: false,
    adminOnly: true,
  },
  {
    href: `${LMS_BASE_PATH}/guide`,
    label: "Guide",
    exact: false,
    adminOnly: false,
  },
  {
    href: `${LMS_BASE_PATH}/settings`,
    label: "Settings",
    exact: false,
    adminOnly: true,
  },
];

// The Bible School sections. Programs and Settings are for people who manage the whole school;
// an instructor sees the courses they teach and those courses' enrollments.
export function BibleSchoolTabs({
  canManageSchool,
}: {
  canManageSchool: boolean;
}) {
  const pathname = usePathname();
  return (
    <div className="flex gap-1 overflow-x-auto border-b border-border">
      {TABS.filter((tab) => canManageSchool || !tab.adminOnly).map((tab) => {
        const active = tab.exact
          ? pathname === tab.href
          : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`-mb-px whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
              active
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
