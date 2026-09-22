import type { TabKey } from "@/lib/permissions/tabs";

export type ReportId = "members" | "attendance" | "events" | "offerings" | "donations";

export type ReportFilterType = "dateRange" | "branch" | "select";

export interface ReportFilterOption {
  value: string;
  label: string;
}

export interface ReportFilterField {
  key: string;
  label: string;
  type: ReportFilterType;
  options?: ReportFilterOption[];
}

export interface ReportColumn {
  key: string;
  label: string;
  align?: "right";
}

export interface ReportDefinition {
  id: ReportId;
  label: string;
  description: string;
  // Which tab's read permission gates this report — a report surfaces
  // data owned by another module, so it's re-checked against that
  // module's tab permission rather than a blanket "reports" grant. Having
  // read access to Reports only decides whether the page itself is
  // visible; it doesn't widen what data can be pulled through it.
  tab: TabKey;
  filters: ReportFilterField[];
  columns: ReportColumn[];
}

export const REPORT_DEFINITIONS: ReportDefinition[] = [
  {
    id: "members",
    label: "Members",
    description: "Congregation roster, filterable by branch and status.",
    tab: "members",
    filters: [
      { key: "branchId", label: "Branch", type: "branch" },
      {
        key: "status",
        label: "Status",
        type: "select",
        options: [
          { value: "active", label: "Active" },
          { value: "left", label: "Left" },
          { value: "pending", label: "Pending" },
        ],
      },
      { key: "dateRange", label: "Joined", type: "dateRange" },
    ],
    columns: [
      { key: "firstName", label: "First Name" },
      { key: "lastName", label: "Last Name" },
      { key: "email", label: "Email" },
      { key: "phone", label: "Phone" },
      { key: "status", label: "Status" },
      { key: "branch", label: "Branch" },
      { key: "dateOfBirth", label: "Date of Birth" },
      { key: "joined", label: "Joined" },
    ],
  },
  {
    id: "attendance",
    label: "Attendance",
    description: "Attendance sessions with present counts, filterable by branch and date.",
    tab: "attendance",
    filters: [
      { key: "branchId", label: "Branch", type: "branch" },
      { key: "dateRange", label: "Date", type: "dateRange" },
    ],
    columns: [
      { key: "date", label: "Date" },
      { key: "title", label: "Title" },
      { key: "branch", label: "Branch" },
      { key: "event", label: "Event" },
      { key: "presentCount", label: "Present", align: "right" },
      { key: "headcount", label: "Headcount", align: "right" },
    ],
  },
  {
    id: "events",
    label: "Events",
    description: "Calendar events, filterable by branch and date.",
    tab: "events",
    filters: [
      { key: "branchId", label: "Branch", type: "branch" },
      { key: "dateRange", label: "Date", type: "dateRange" },
    ],
    columns: [
      { key: "title", label: "Title" },
      { key: "date", label: "Date" },
      { key: "branch", label: "Branch" },
      { key: "mode", label: "Mode" },
      { key: "recurrence", label: "Recurrence" },
    ],
  },
  {
    id: "offerings",
    label: "Offerings",
    description: "Offerings collected, filterable by branch and date.",
    tab: "offerings",
    filters: [
      { key: "branchId", label: "Branch", type: "branch" },
      { key: "dateRange", label: "Date", type: "dateRange" },
    ],
    columns: [
      { key: "date", label: "Date" },
      { key: "category", label: "Category" },
      { key: "amount", label: "Amount", align: "right" },
      { key: "branch", label: "Branch" },
      { key: "notes", label: "Notes" },
    ],
  },
  {
    id: "donations",
    label: "Donations",
    description: "Donations received, filterable by method and date.",
    tab: "donations",
    filters: [
      {
        key: "method",
        label: "Method",
        type: "select",
        options: [
          { value: "cash", label: "Cash" },
          { value: "check", label: "Check" },
          { value: "bank_transfer", label: "Bank Transfer" },
          { value: "online", label: "Online" },
          { value: "other", label: "Other" },
        ],
      },
      { key: "dateRange", label: "Date", type: "dateRange" },
    ],
    columns: [
      { key: "date", label: "Date" },
      { key: "donor", label: "Donor" },
      { key: "amount", label: "Amount", align: "right" },
      { key: "method", label: "Method" },
      { key: "fundraiser", label: "Fundraiser" },
      { key: "notes", label: "Notes" },
    ],
  },
];

export function getReportDefinition(id: string): ReportDefinition | undefined {
  return REPORT_DEFINITIONS.find((definition) => definition.id === id);
}

export interface ReportFilters {
  branchId?: string;
  status?: string;
  method?: string;
  from?: string;
  to?: string;
}
