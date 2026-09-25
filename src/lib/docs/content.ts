export interface DocArticle {
  id: string;
  title: string;
  // Plain paragraphs and "- " bullet lines — kept as simple strings rather
  // than JSX/markdown so this file stays pure data, searchable by a plain
  // substring match with no rendering logic involved.
  body: string[];
}

export interface DocCategory {
  id: string;
  title: string;
  articles: DocArticle[];
}

export const DOC_CATEGORIES: DocCategory[] = [
  {
    id: "getting-started",
    title: "Getting Started",
    articles: [
      {
        id: "onboarding",
        title: "Setting up your church",
        body: [
          "When you first sign up, you'll create an organization for your church — its name, congregation size, number of branches, and country. Country matters: it sets the default phone country code used across Members, Branches, and SMS.",
          "Every organization gets a free 14-day trial with full Basic-plan access, no card required. After that, an owner or admin needs to subscribe from the Billing page to keep using the app.",
        ],
      },
      {
        id: "roles",
        title: "Roles: Owner, Admin, and Member",
        body: [
          "Owner is whoever created the organization — there's exactly one, and it can't be removed.",
          "Admins have the same full access as the owner everywhere in the app, including Billing and Team management.",
          "Members are staff or volunteers issued a login by an owner/admin. Their access to each tab (Members, Finance, Email, etc.) is controlled individually via the permission matrix on the Team page — see \"Team permissions\" below.",
        ],
      },
      {
        id: "branches-setup",
        title: "Branches and multi-campus churches",
        body: [
          "If your church has more than one location, add each as a Branch under Organization → Branches. Each branch can have its own country (for phone number formatting), a manager (picked from your Leaders), and a member count.",
          "Members, Events, and Fund Raisers can all optionally be tied to a specific branch, which is how SMS/Email recipient lists and reports narrow down by location.",
        ],
      },
      {
        id: "finding-a-tab",
        title: "Finding a tab quickly",
        body: [
          "With this many tabs in the sidebar, use the search box at the top of the nav to filter them by name instead of scrolling through every group — it only searches tabs you already have access to.",
        ],
      },
    ],
  },
  {
    id: "people",
    title: "People & Congregation",
    articles: [
      {
        id: "members",
        title: "Managing your congregation (Members)",
        body: [
          "The Members tab is your congregation roster. Add members manually one at a time, or bulk-import via the Excel template (Members → Import).",
          "Each church can also share a public join link (found on the Members page) — anyone who fills it out is added as a \"pending\" member until an admin approves them.",
          "You can add custom fields to the member form (e.g., \"T-shirt size\", \"Ministry interest\") from Members → Customize fields — these appear on both the admin form and the public join form.",
          "Phone numbers are validated and formatted using the member's branch country (or the church's country if they have no branch) — this is what SMS uses to know which country code to dial.",
        ],
      },
      {
        id: "leaders-youth",
        title: "Leaders and Youth",
        body: [
          "Leaders is a subset of your Members roster — designate someone as a Leader to make them selectable as a manager for Branches, Ministries, and Events.",
          "Youth is a separate roster for tracking minors in your congregation, with guardian name/phone fields alongside the usual member info.",
        ],
      },
      {
        id: "families",
        title: "Families — grouping members into households",
        body: [
          "Families groups your congregation into household units. First click \"Create family\" and give it a name (e.g. \"The Smith Family\") and optional notes, then use \"Add member\" on that family to assign existing congregants to it, one at a time, along with their relationship within it (Head of household, Spouse, Child, Guardian, etc.).",
          "A member can only be added to the same family once, but the same congregant could in principle be added to more than one family if needed (e.g. an in-law living between two households).",
        ],
      },
      {
        id: "team-logins",
        title: "Creating logins for staff and volunteers",
        body: [
          "Team → \"Create login\" issues a ready-to-use email and password directly — the person doesn't need to sign up themselves. The password is shown once; copy it and share it with them yourself.",
          "When creating a login, you set their role (Member or Admin) and, for Members, a permission matrix — see \"Team permissions\" below.",
          "Each plan has a limit on how many logins you can add beyond the owner's own seat: 3 on Basic, 10 on Premium, 50 on Pro.",
        ],
      },
      {
        id: "team-permissions",
        title: "Team permissions (Read / Write / Delete)",
        body: [
          "Every tab (Members, Branches, Finance, Email, etc.) can be set to Read, Write, or Delete access individually for each Member-role login, from Team → Permissions.",
          "New logins default to Read-only on every tab — an admin has to explicitly grant Write or Delete. This also applies to any tab added to the app in the future: it starts Read-only for existing members until an admin opens it up.",
          "Owner and Admin roles always have full access everywhere and ignore this matrix entirely.",
        ],
      },
    ],
  },
  {
    id: "ministry",
    title: "Ministry Tools",
    articles: [
      {
        id: "ministries-worship-media",
        title: "Ministries, Worship, and Media",
        body: [
          "Ministries tracks each ministry your church runs — its type, manager, vision/mission, and when it started.",
          "Worship tracks your worship team roster and lets you upload shared documents (chord charts, setlists) with a shareable link.",
          "Media tracks your media/production team, equipment, social accounts your media ministry manages, and shared documents — similar to Worship but for the media side.",
        ],
      },
      {
        id: "events",
        title: "Events calendar",
        body: [
          "Events supports one-off and recurring events (daily/weekly/monthly/yearly), online or in-person with a meeting link, and can be tied to a specific branch and manager.",
        ],
      },
      {
        id: "todos",
        title: "To Do (team tasks)",
        body: [
          "A shared task list for your team — assign a to-do to any team member, set a due date, and export it to your calendar.",
        ],
      },
    ],
  },
  {
    id: "tools",
    title: "Tools",
    articles: [
      {
        id: "forms",
        title: "Forms — custom registration forms & surveys",
        body: [
          "Forms is a builder for one-off registration forms or surveys, each with its own shareable public link and response collection — build it, publish it, and anyone with the link can fill it out without logging in.",
          "Add fields one at a time (short text, long text, number, email, phone, date, yes/no, or dropdown), mark any of them required, and reorder them with the arrows.",
          "A form only accepts responses while it's Published — Draft forms aren't live yet, and Closed forms stop accepting new responses without deleting what's already been collected.",
        ],
      },
      {
        id: "folder",
        title: "Folder — private documents & shareable links",
        body: [
          "Folder is a private, access-controlled document repository — unlike Worship and Media's document links, nothing here is public by default. Only people granted access to the Folder tab (Team → Permissions) can see or download what's uploaded.",
          "Categories group documents together (e.g. \"Board\", \"Youth Ministry\"). Give a category its own shareable link from its badge, and anyone with that link can view and download every document in it without logging in.",
          "Individual documents can also get their own one-off shareable link, turned on from the document's \"Share\" button. Turning a link off revokes it immediately — there's no expiry, so disabling is the only way to revoke a link that's been shared.",
          "Shared links are served from a masked URL that never reveals the underlying storage path, the same approach Worship and Media already use for their document links.",
        ],
      },
      {
        id: "attendance",
        title: "Attendance",
        body: [
          "Attendance records who was present at a service or gathering. A session is scoped to a branch (or \"All branches\") and can optionally be linked to a specific date of a calendar Event — useful since a recurring event like \"Sunday Service\" is one Events row, not one per week, so the session records which occurrence it was for.",
          "Click \"Take attendance\" to start a session, then check off who was present from that branch's active members.",
          "If someone attended who isn't on the default list — a visitor from another branch, for example — use \"Check in someone not listed below\" to search the full member directory and add them to that session.",
          "You can also just record a total headcount instead of, or alongside, checking off individuals — useful for large services where a per-person checklist isn't practical.",
        ],
      },
      {
        id: "reports",
        title: "Reports",
        body: [
          "Reports lets you filter and export the data behind five tabs — Members, Attendance, Events, Offerings, and Donations — without hunting for a separate export button inside each one.",
          "A report is only available if you have read access to its underlying tab — having access to Reports itself doesn't widen what data you can pull through it.",
          "Filter by date range, branch, or a report-specific filter (member status, donation method), click \"Run report\" to see the results on screen, then export to Excel or PDF.",
        ],
      },
      {
        id: "widget",
        title: "Widget — an embeddable form for your website",
        body: [
          "Widget designs a small chat-bubble form you embed on your own church website to capture visitor queries — name, email, phone, and a message by default, though the fields are fully customizable like a form's.",
          "Set a brand color, corner position (bottom-left or bottom-right), and the greeting text on the Design tab, then copy the snippet from the Embed tab and paste it once on your site, right before the closing </body> tag — it works on any website, not just pages hosted by this app.",
          "Every submission shows up in the Submissions tab, where you can mark it read, archive it, or delete it. Disabling the widget (Embed tab) stops it from accepting new messages immediately without you having to remove the embed code from your site.",
          "There's one widget per organization — the field layout and branding are shared across every page it's embedded on, there's no per-page variant.",
        ],
      },
      {
        id: "accounting",
        title: "Accounting — income, expenses, ledger & invoices",
        body: [
          "Accounting tracks income and expenses by category (e.g. \"Tithes\", \"Utilities\"), with a chart comparing income vs. expense bucketed by day, week, or month depending on the date range you pick, and everything filterable by branch.",
          "Ledger gives you a running, printable record of transactions for a period. Invoices let you create a line-itemed invoice for a person or organization and print it directly from the browser — both are meant to be handed to someone, not just viewed on screen.",
          "Accounting is included on the Premium and Pro plans, not Basic — same gate as the rest of Finance.",
        ],
      },
    ],
  },
  {
    id: "finance",
    title: "Finance",
    articles: [
      {
        id: "finance-overview",
        title: "Fund Raiser, Offering, and Donation",
        body: [
          "Fund Raiser tracks campaigns toward a goal amount. The \"raised\" total is calculated automatically from Donations linked to that campaign — there's no separate field to manually type a raised amount.",
          "Offering logs amounts collected during services or events — a simple record: category, amount, date, and optional branch.",
          "Donation logs a gift from a member (picked from your roster) or a free-text donor name for guests. Donations can optionally be linked to a Fund Raiser to count toward its goal.",
          "The Finance module is included on the Premium and Pro plans, not Basic.",
        ],
      },
      {
        id: "fundraiser-payment-links",
        title: "Fund Raiser online giving links",
        body: [
          "Any Fund Raiser can turn on an online payment link, letting a donor enter their own amount and pay by card/UPI/etc. through Razorpay — no need to record every gift by hand.",
          "Choose either your own Razorpay account (connected from the Fund Raiser page) or our shared service, which needs no setup on your end. A shared-service donation is charged a 2.5% transaction fee, shown up front on both the giving page and your Fund Raiser dashboard, before it's paid out to you — your own account has no such fee since the money goes straight to you.",
          "For shared-service fundraisers, the wallet balance shown at the top right of the Fund Raiser page is what you've collected (after the fee) and haven't been paid out yet. Click it to open a payout request, which we process manually — it isn't instant.",
        ],
      },
    ],
  },
  {
    id: "messaging",
    title: "Messaging & Social",
    articles: [
      {
        id: "email-sms",
        title: "Email and SMS campaigns",
        body: [
          "Send bulk email newsletters or SMS announcements to your congregation from the Email and SMS tabs. Both use a shared sending account by default, metered by your plan's monthly quota.",
          "Premium and Pro plans can connect their own SMTP server for unmetered email sending — SMS has no equivalent \"bring your own\" option.",
          "SMS recipients' country codes are resolved from their branch (or the church's country as a fallback) — this only works correctly if that's set.",
        ],
      },
      {
        id: "whatsapp",
        title: "WhatsApp campaigns and chat",
        body: [
          "WhatsApp works like SMS: send a one-off campaign to a chosen set of recipients, either through the shared service (metered by your plan's monthly quota) or your own connected Twilio WhatsApp number, with no quota.",
          "Connecting your own number (Team → WhatsApp → Connect) also unlocks two-way Chat — replies from congregants land in the Chat tab, threaded by phone number, so you can answer queries as they come in. The shared service is broadcast-only; there's no dedicated number for replies to arrive on, so it has no Chat tab.",
        ],
      },
      {
        id: "social-media",
        title: "Social Media (Instagram, YouTube, Facebook)",
        body: [
          "Connect your church's Instagram, YouTube, and Facebook accounts to manage posts, comments, and messages without leaving the dashboard.",
          "YouTube supports connecting more than one channel — use the channel switcher above the YouTube dashboard to add another channel or switch which one is active. Videos, comments, analytics, and live streaming controls all apply to whichever channel is currently active.",
          "Social Media is included on the Pro plan only. Connecting an account also requires an owner or admin.",
        ],
      },
    ],
  },
  {
    id: "billing",
    title: "Billing & Plans",
    articles: [
      {
        id: "plans",
        title: "Basic, Premium, and Pro",
        body: [
          "The three plans differ in email/SMS quotas, storage, added team logins, and whether Finance, Social Media, and your own SMTP are included — see the Billing page for the full comparison.",
          "Every plan is available billed Monthly, or Annually at 10% off (toggle on the Billing page or the pricing page).",
        ],
      },
      {
        id: "trial",
        title: "The 14-day trial",
        body: [
          "New organizations get 14 days of full Basic-plan access with no subscription required — you'll see a countdown banner across the dashboard during this period.",
          "Once the trial ends, the app is locked to a \"subscribe now\" screen until an owner or admin picks a plan. Other team members will see a message asking them to contact an owner/admin.",
        ],
      },
      {
        id: "addon-packs",
        title: "Add-on packs — topping up SMS, Email, WhatsApp, or storage",
        body: [
          "Running low on shared SMS, email, or WhatsApp sends before your next billing cycle — or need more storage — without wanting to upgrade the whole plan? Buy an add-on pack from the Billing page instead. Each pack is a one-time purchase.",
          "SMS, Email, and WhatsApp add-on credits are a running balance that carries over indefinitely — they're only drawn on once you've used up that month's plan quota, and never expire or reset at the start of a new month.",
          "Storage add-on packs permanently raise your storage ceiling — there's nothing to \"use up\" separately, since storage is already a running total rather than something that resets monthly.",
          "Add-on purchases go through the same Razorpay checkout as plan subscriptions, and only an owner or admin can buy one.",
        ],
      },
      {
        id: "cancelling",
        title: "Cancelling a subscription",
        body: [
          "Cancelling from the Billing page takes effect immediately, not at the end of your paid period — there's no partial refund for the unused remainder.",
          "If you cancel after your trial period has already ended, you'll be returned to the \"subscribe now\" screen right away rather than keeping free access.",
          "Switching plans or switching between Monthly/Annual isn't done in place — cancel your current subscription first, then subscribe again on the new plan or interval.",
        ],
      },
    ],
  },
  {
    id: "limitations",
    title: "Known Limitations",
    articles: [
      {
        id: "current-limitations",
        title: "Things to be aware of",
        body: [
          "- No self-serve mid-cycle plan or billing-interval switching — it's cancel-then-resubscribe for now.",
          "- Cancellation is immediate; there's no \"cancel at period end\" option or partial refund.",
          "- Only Donations (not Offerings) can be linked to a Fund Raiser's total.",
          "- Reports currently covers five tabs (Members, Attendance, Events, Offerings, Donations) — not every module has a report yet.",
          "- Attendance's manual \"check in someone not listed\" search only finds active members — congregants marked pending or left can't be checked in directly.",
          "- There's one Widget per organization — the same design and fields are shared across every page/site it's embedded on.",
          "- WhatsApp two-way chat only works for organizations using their own connected Twilio number — the shared service is campaigns only.",
          "- Fund Raiser payout requests (shared-service giving) are processed manually on our end, not instantly.",
          "- Ledger and Invoices are print-only right now — there's no built-in emailing or PDF download, just \"print to PDF\" from the browser's print dialog.",
          "- Trial length is fixed at 14 days and isn't extendable from within the app.",
          "- Support tickets (this Support tab) can currently be raised and viewed, but there's no in-app reply or status-tracking workflow yet — you'll be contacted separately about anything you raise.",
        ],
      },
    ],
  },
];
