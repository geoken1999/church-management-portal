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
          "Every organization gets a free 14-day trial with full Starter-plan access, no card required. After that, an owner or admin needs to subscribe from the Billing page to keep using the app.",
          "You'll get a welcome email as soon as your church's account is created, with a few suggested first steps and a link straight back to your dashboard.",
          "A short welcome tour pops up automatically the first time your dashboard loads, pointing out where each area of the app lives. Skip it or click through it — either way it won't show again on its own, but you can replay it anytime from \"Take the tour\" at the bottom of the sidebar's Help section.",
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
        id: "mobile-app",
        title: "Choosing your mobile app features",
        body: [
          "Organization → Mobile App lets an owner or admin pick up to 15 features to make available to your team in the KingdomFlow mobile app — the same set for your whole team, not a per-person choice. The Dashboard is always in the app, and Social Media (Instagram, YouTube, Facebook) and Documentation are web-only, so none of the three is on the list.",
          "Uncheck a feature to free up a slot for a different one once you've picked 15; there's no separate save per feature, just one Save for the whole selection. A few features (Prayer, K-Connect, Ask Aura, AI Rules and Automation) aren't limited by this list — they appear in the app for anyone whose role and plan allow them.",
          "The Mobile App area also holds the Design Studio, Giving and Notifications tabs for the member app — see \"Mobile Apps\" for all of it.",
        ],
      },
      {
        id: "finding-a-tab",
        title: "Finding a tab quickly",
        body: [
          "With this many tabs in the sidebar, use the search box at the top of the nav to filter them by name instead of scrolling through every group — it only searches tabs you already have access to.",
        ],
      },
      {
        id: "language",
        title: "Changing the language",
        body: [
          "Click the language icon next to the notification bell in the dashboard header to switch the app's language — English, Tamil, and Hindi are supported today, with more on the way. Your choice is saved to your profile, so it follows you the next time you sign in on any device.",
          "The same switcher appears on every public link you share — Forms, Event registration, Give, Join, and shared Folders. There, each visitor picks their own language independently, and it's remembered on their browser for the next link they open.",
          "Only the app's own screens (buttons, field labels, messages) are translated. Content your church has written yourself — event titles, custom form questions, your church's name — always appears exactly as you typed it.",
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
        id: "volunteers",
        title: "Volunteers and digital ID cards",
        body: [
          "People → Volunteers lists the members who serve your church (ushers, sound operators, kitchen helpers and so on). Add a volunteer by picking an existing member and entering what they volunteer as. A team, a start date and notes are optional, and you can mark a volunteer inactive when they stop serving.",
          "Each volunteer gets an ID number automatically (VOL-0001, VOL-0002, and so on). A member can be a volunteer only once.",
          "A volunteer who uses the KingdomFlow app sees a Volunteer entry under Explore. It opens a digital ID card with their name, ID number, role, team, church and contact details, and a QR code. Scanning the QR code opens a public page that confirms they are a volunteer of your church and whether they are still active — and shows nothing else about them.",
          "Volunteers follow the same Read, Write and Delete permissions as every other tab, and appear under People in the mobile app if you choose them in Mobile App features.",
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
          "Each plan has a limit on how many logins you can add beyond the owner's own seat: 1 extra admin and 2 extra staff on Starter, 3 admins and 5 staff on Growth, and 10 admins and 20 staff on Pro.",
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
          "Events supports one-off and recurring events (daily/weekly/monthly/yearly), and can be tied to a specific branch and manager.",
          "Every event has a status: Pending, Active, Cancelled, or Completed. The registration link only accepts new registrants while an event is Active — the other three statuses close it regardless of capacity or the closing date/time, and the public page shows a matching message (\"cancelled,\" \"already taken place,\" or \"isn't open yet\").",
          "Meeting type is In person, Online, or In person + Online (hybrid). In person adds a venue (e.g. \"Main Sanctuary, 123 Church St\") and a map link; Online adds a meeting link; hybrid asks for both. Whatever's filled in shows up on the emailed registration pass and reminder — a hybrid event shows both a tappable location pin and a \"Join online\" link, side by side, not one replacing the other.",
          "Click \"Registration\" on any event to turn on a public registration form for it — customize the fields (Name, Email, and Phone by default, editable like a Form's), set an optional capacity and closing time, then share the link or QR code from the Settings tab.",
          "Every registrant is emailed a confirmation pass with a QR code, a calendar (.ics) invite they can add straight to their calendar app, and a short backup code in case a phone won't scan — from the Registrants tab, mark someone checked in or cancel their registration. Use the search box there to find someone by name, email, phone, or confirmation code.",
          "The Name, Email, and Phone fields are permanent — the field editor won't let you remove them, and their \"Required\" toggle and field type are locked on, since registration, the emailed pass, and duplicate-prevention all depend on them staying exactly as they are. Email and Phone are each checked for duplicates per event automatically; any custom field you add can opt into the same check with its own \"No duplicates allowed\" toggle.",
          "In Settings, design the registration pass: upload a banner image (exactly 1200x350px — the field editor tells you if a chosen file doesn't match, and won't upload it), pick a pass color, and add an optional personal message — the confirmation email shows the registrant's name, event details, confirmation code, and QR code as a single ticket-style card. Use \"Preview pass\" to see a sample before you save.",
          "Registration closes itself automatically the moment any one of three things happens: capacity is reached, the closing date/time you set passes, or (for a one-time event) the event is 1 hour away — whichever comes first. There's no need to remember to turn it off. Recurring events aren't auto-closed 1 hour before a specific date, since there's no single event start for that to mean.",
          "Turn on a reminder email in Settings — 24 hours before, 1 hour before, or the morning of — and every registrant gets a nudge with the event details and their confirmation code. For a recurring event, it's sent again before each occurrence, not just once.",
          "Click \"Add to Attendance\" on an event to create (or jump straight to) its Attendance session — for a recurring event this is always today's occurrence. That session's \"Registered attendees\" checklist is exactly the Registrants list, so check-in works the same from either place.",
        ],
      },
      {
        id: "todos",
        title: "To Do (team tasks)",
        body: [
          "A shared task list for your team — assign a to-do to any team member, set a due date, and export it to your calendar.",
        ],
      },
      {
        id: "kconnect",
        title: "K-Connect calls",
        body: [
          "K-Connect has video calls and audio-only calls, switched at the top of one page in the dashboard. You start or schedule either kind there, and you can invite people with a link, including people who aren't members. Video and audio keep separate permissions, so you can let someone host video calls but not audio, or the other way round.",
          "In a call you can mute, turn your camera on and off, chat, and send quick reactions. Hosts (anyone with Write access to that call type) can also mute or remove people, turn someone's camera off, switch \"admit one by one\" on or off, and end the call for everyone. New chat messages show a badge on the chat button while the chat is closed.",
          "When someone is speaking, their call tile gets a border that blinks, so you can see who is talking at a glance. If your device has reduced motion turned on, the border stays steady instead of blinking. Every camera is shown whole inside its tile, never cropped.",
          "With \"admit one by one\" on, people wait until a host lets them in. Hosts see who is waiting at the top of the call, on the web or in the app, and can Admit or Deny.",
          "A call that has had nobody in it for 3 minutes is ended automatically, so unused calls never stay open. Calls scheduled for later are not affected until someone starts them.",
          "Call length depends on your plan. On Starter, video calls end after 20 minutes and audio calls after 30. On Growth, they end after 40 and 50 minutes. On Pro, calls have no time limit.",
          "In the KingdomFlow app, K-Connect calls run entirely inside the app — for your team, for members (a Live calls card can appear on their Home screen), and for guests who open an invite link. See \"Mobile Apps\" for how the app handles calls.",
        ],
      },
      {
        id: "livestream",
        title: "Live stream",
        body: [
          "Live streaming is set up for each church on request. Until it is on for yours, Tools → Live stream shows a Contact us to enable button: an owner or admin presses it and we email you to agree the setup and billing, then turn it on. Once it is on, Tools → Live stream lets your church broadcast a service. Create a stream with a title, then choose how it looks: the layout (grid, spotlight or sidebar), quality (standard, HD or Full HD), wide or tall screen, and a dark or light look. You can also turn on recording, audio-only, live chat, and a notification to your members when you go live.",
          "Open the broadcast room from the stream page, join with your camera and mic (anyone you let into the room is part of the broadcast), then press Go live. Members watch inside the KingdomFlow app, not in a browser, and can chat while they watch. You see how many are watching right now and the peak, and you can reply in the chat from the stream page.",
          "To also stream to YouTube or Facebook, add the stream address and key from that platform when you create the stream. Press End stream when you finish; the stream also ends when the room has been empty for 3 minutes. If you turned recording on, the stream page can fetch the recording afterwards.",
          "To stream from OBS Studio instead of a device camera, open the stream and use the Stream from OBS panel. In OBS 30 or newer, go to Settings → Stream, choose WHIP as the service, paste the Server address, and paste the stream key into Bearer Token. In Settings → Output (Advanced) use x264, CBR at 2500–4000 Kbps, a keyframe interval of 2 seconds, and Tune zerolatency; in Settings → Video choose 1280×720 or 1920×1080 at 30 fps. Add your camera, microphone and slides as sources, press Start Streaming in OBS, wait for the page to say OBS connected, then press Go live. To finish, press End stream, then Stop Streaming in OBS. Keep the key private; Make a new key if it was shared by mistake.",
          "For members to see a Watch card on their Home screen, add the Live stream card in Mobile App → Design Studio. Live stream has its own Read, Write and Delete permission on the Team page.",
        ],
      },
    ],
  },
  {
    id: "mobile-apps",
    title: "Mobile Apps",
    articles: [
      {
        id: "staff-app",
        title: "The KingdomFlow app for your team",
        body: [
          "Owners, admins and team members sign in to the KingdomFlow app with the same email and password they use on the web. The Services tab is organised the same way as the dashboard's menu — Organization, People, Ministry, Tools, AI Tools, Finance, Messaging and Help — and shows the features your church switched on at Organization → Mobile App.",
          "The rules are the same as on the web: a person only sees and changes what their tab permissions allow, the church's plan limits apply, and anything an owner or admin has turned off stays off. Changes made on the web show up in the app on their own, and the other way round.",
          "In the app you can manage Members, Leaders, Youth, Committee, Families, Branches, Ministries, Worship, Media, Events, To Do, the Planner, Prayer requests (view only), Attendance, Forms, Folder documents, Reports (with Excel and PDF export), Accounting (summary, ledger, invoices and expenses), Fund Raisers, Offerings, Donations, Membership fees and Payouts. You can send Email, SMS and WhatsApp campaigns, work with Automation, Ask Aura and AI Rules, manage K-Connect calls, check the website Widget's messages, manage Team logins and permissions, view Billing, edit the Church profile and raise Support tickets.",
          "The bell at the top right opens the notification center — the same notifications as the dashboard bell. Swipe one to remove it, or mark everything read.",
          "Some things stay on the web: connecting Instagram, YouTube and Facebook, the Documentation, creating WhatsApp message templates, follow-up automations, email attachments and rich formatting, printing invoices, changing your church's name and logo, and paying for plans or add-ons.",
        ],
      },
      {
        id: "member-app",
        title: "The KingdomFlow app for members",
        body: [
          "Members sign in to the app with their phone number and a one-time code. The number has to match the one saved on their profile in Members, and the member has to be active.",
          "The Home screen is whatever your church designs in the Design Studio. Members can also see upcoming events (and register for them in one tap, then keep their pass in the app), see their own attendance, send prayer requests, give online, show their membership QR code, and update their details — changes to their details go to your team as a request to approve.",
          "Members who are part of a group (Leaders, Youth, Worship team, Media team or Committee) see that group's announcements, links and — for the Worship and Media teams — shared documents. Pictures and PDFs open right inside the app; other files can be handed to another app.",
          "Members get notifications from the church on their phone, and can switch each kind on or off in Settings. They can also change the app's colour theme.",
        ],
      },
      {
        id: "design-studio",
        title: "Design Studio — design your members' Home screen",
        body: [
          "Organization → Mobile App → Design Studio is where an owner or admin builds the Home screen members see. Add sections, put them in order, hide the ones you don't want yet, and see a preview before you publish. Members see only what you have published; your draft saves as you go.",
          "Sections you can add: a Banner (up to 6 images, with optional links and autoplay), a Welcome message, an Announcement (with an optional image and button), Quick links (membership QR code, My details or any web link), Upcoming events, Videos (YouTube links, shown as a row of thumbnails) and Live calls.",
          "A Live calls section shows a card whenever a K-Connect video or audio call is live at your church, with a Join button that opens the call inside the app. When nothing is live it stays out of the way. Leave it out of your design if you don't want members to see it.",
        ],
      },
      {
        id: "app-notifications",
        title: "Push notifications to your members",
        body: [
          "Organization → Mobile App → Notifications lets an owner or admin send a notification to your whole church, one branch, one group (for example Youth) or a single member. Add a link and a button label (for example \"Join\") and the notification opens that link when tapped. A link to a K-Connect call opens the call inside the app.",
          "Members can switch off each kind of notification (announcements, events, prayer requests, tasks and so on) in the app's Settings, and a member who has switched a kind off isn't sent it.",
          "Your team also gets notifications for things that need them — such as a new prayer request, an event registration or a reply from support — and the same list appears in the notification center, on the web and in the app.",
        ],
      },
      {
        id: "app-giving",
        title: "Giving from the app",
        body: [
          "Organization → Mobile App → Giving sets up how members give from the app, using your church's own payment accounts. Members tap Give in the app and pay on a secure page that opens inside the app; UPI and other payment apps take over when needed and bring the member back.",
          "Gifts appear in your Donations like any other online gift.",
        ],
      },
      {
        id: "app-calls",
        title: "K-Connect calls in the app",
        body: [
          "Starting, scheduling and joining K-Connect calls all happen inside the app, for video and audio. Hosts get the same controls as on the web: admit or deny people who are waiting, switch \"admit one by one\", mute or remove people, and end the call for everyone. Everyone can chat, send reactions, mute and turn their camera on or off, and flip between the front and back camera. The screen stays awake while you're in a call.",
          "A call invite link opens in the app when the app is installed: someone signed in goes straight into the call, and someone who isn't signed in is asked for their name and joins as a guest. If the link opens in the browser instead, tap \"Open in the KingdomFlow app\" on the invite page. (Opening plain web links directly in the app needs a one-time setup by KingdomFlow's team — if it doesn't happen on your phone, the button above always works.)",
          "Screen sharing isn't available in the app yet; join from a computer to share your screen.",
        ],
      },
    ],
  },
  {
    id: "automation",
    title: "Automation",
    articles: [
      {
        id: "automation-overview",
        title: "What automation does and what it costs",
        body: [
          "Automation runs recurring tasks without anyone having to remember them. Find it under Automation in the sidebar, then pick the feature you want to set up.",
          "Starter doesn't include automation. Growth allows 5 active automations at a time, and Pro allows 10. Drafts and paused automations don't count toward the limit — only active ones do.",
        ],
      },
      {
        id: "automation-birthdays",
        title: "Birthday and anniversary wishes",
        body: [
          "Automate Wishes for Members sends birthday and anniversary wishes over WhatsApp, on the day, to each member it applies to. Choose which occasions to send for, the message template, and whether your staff also get a daily digest of who was celebrated.",
        ],
      },
      {
        id: "automation-member-followup",
        title: "Member follow-up: tasks for members who have stopped coming",
        body: [
          "Member follow-up creates a To Do task for a leader when a member has been absent for a set number of Sundays in a row (2 to 12, default 3). Nothing is sent to the member. The task is assigned to the person you choose, and it's due in the number of working days you set.",
          "A Sunday only counts if its register was marked complete. On the attendance session, use Mark register complete once the register is final. Sundays that aren't marked complete are skipped, not counted as absences.",
          "Each member has at most one open task per automation. When that task is completed, the next missed run can create a new one. The assignee is notified without the member's name.",
          "You choose the branches and the weekday the check runs on. Activate it from the automation page, and pause it there at any time.",
        ],
      },
    ],
  },
  {
    id: "tools",
    title: "Tools",
    articles: [
      {
        id: "planner",
        title: "Planner — jot down and track an initiative",
        body: [
          "Planner is for a named initiative — \"Sunday Service,\" \"Building Renovation,\" a fundraising push — that's bigger than a single task. Give it a title, jot freeform notes, and add a checklist of steps as you think of them.",
          "Checking off, adding, or removing a step happens right on the card — no need to open an edit screen for that. Edit the title, notes, status, or target date separately from the pencil icon.",
          "Give any step a start and end time (e.g. 10:00–11:00 for a worship segment, 11:00–12:00 for the sermon) to turn the checklist into a running schedule — steps with a time automatically sort into chronological order, ahead of any plain, untimed steps. Times are optional per step, so a plan can mix a loose checklist with a tight schedule.",
          "This is different from To Do: a To Do is one task assigned to one person with a due date, while a Plan is a shared initiative the whole team can see and add steps to.",
          "Assign a step to one of your Leaders from the dropdown next to it — this draws from Organization → Leaders, not the full congregation, so a step is always handed to someone in a leadership role.",
          "Status moves a plan through Draft, Active, and Completed — filter the list by any of those, or see everything at once under All. While a plan is Active, a PDF icon appears next to Edit — export it as a run sheet to print or hand to your team, with every step's time, text, and assignee.",
        ],
      },
      {
        id: "forms",
        title: "Forms — custom registration forms & surveys",
        body: [
          "Forms is a builder for one-off registration forms or surveys, each with its own shareable public link and response collection — build it, publish it, and anyone with the link can fill it out without logging in.",
          "Add fields one at a time (short text, long text, number, email, phone, date, yes/no, or dropdown), mark any of them required, and reorder them with the arrows.",
          "A form only accepts responses while it's Published — Draft forms aren't live yet, and Closed forms stop accepting new responses without deleting what's already been collected.",
          "Every public page like this one — Forms, Event registration, Give, Join, and a shared Folder — shows your own church logo and name at the top (set it under Profile), with \"Powered by KingdomFlow\" kept as a small attribution at the bottom.",
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
          "If the session is linked to an event that has online registration turned on, a \"Registered attendees\" checklist appears alongside the member roster — check off registrants as they arrive, separately from the member checklist, since a registrant isn't necessarily an existing Member.",
        ],
      },
      {
        id: "reports",
        title: "Reports",
        body: [
          "Reports lets you filter and export the data behind five tabs — Members, Attendance, Events, Offerings, and Donations — without hunting for a separate export button inside each one.",
          "A report is only available if you have read access to its underlying tab — having access to Reports itself doesn't widen what data you can pull through it.",
          "Filter by date range, branch, or a report-specific filter (member status, donation method), click \"Run report\" to see the results on screen, then export to Excel or PDF, or click \"Email report\" to have the Excel file sent straight to your own inbox instead.",
        ],
      },
      {
        id: "monthly-report",
        title: "Monthly and annual church reports",
        body: [
          "Reports → Advanced: church reports makes a summary of how the church did in one finished month or one finished year, from your own records: members, attendance, events, giving, expenses and balance, volunteers and prayer requests. An annual report also shows giving and expenses month by month. Choose which sections to include, and add a note of your own.",
          "A report can be for the whole church or for one branch. A branch report covers that branch's members, attendance, events, offerings, expenses, volunteers and prayer requests. Donations aren't recorded per branch, so a branch report counts offerings only, and says so.",
          "Choose the language, English, Tamil or Hindi. The headings, month names and the AI summary are all written in it.",
          "Turn on Write the summary with AI and a short summary is written at the top of the report, in the tone you pick (warm, formal or brief). The AI is given only the totals, and told to use no number that isn't in them; it never sees names. It uses 1 AI credit, and if your church has none left the report is still made, without the summary.",
          "The report starts with your church's letterhead: your logo, church name, address, phone, email and website. Fill in the details when you make a report; they are remembered for next time. After a report is made you can add photos to it from its page, for example from an event or service (JPEG, PNG or WebP, up to 3 MB each and 12 per report; they count towards your storage).",
          "Start from a template to save time: pick a ready-made one (full report, leadership report, report for members, figures only) or one of your own, which fills in the sections, language, AI summary, tone, note and letterhead. Save the current settings as a template with Save as template.",
          "It shows totals only, never who gave what or who attended. You can include only the sections you have access to, and a report is saved as it was made, so its numbers don't change later. Making a report for a period that already has one replaces its figures but keeps its photos.",
          "An owner or admin can Publish a report to the app. Published reports are listed for members under Explore → Reports (a branch report only to that branch's members), and for the team under Reports in the team app. An unpublished report is seen only by your team. You can print any report, or save it as a PDF, from its page.",
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
          "Accounting is included on every plan — same gate as the rest of Finance.",
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
          "The Finance module is included on every plan.",
        ],
      },
      {
        id: "fundraiser-payment-links",
        title: "Fund Raiser online giving links",
        body: [
          "Any Fund Raiser can turn on an online payment link, letting a donor enter their own amount and pay by card/UPI/etc. through Razorpay — no need to record every gift by hand. If the donor entered an email address, they're automatically emailed a receipt once the payment goes through.",
          "Choose either your own Razorpay account (connected from the Fund Raiser page) or our shared service, which needs no setup on your end. A shared-service donation is charged a 2.5% transaction fee, shown up front on both the giving page and your Fund Raiser dashboard, before it's paid out to you — your own account has no such fee since the money goes straight to you.",
          "For shared-service fundraisers, the wallet balance shown at the top right of the Fund Raiser page is what you've collected (after the fee) and haven't been paid out yet — it drops automatically once we record a payout on our end. Click it to open a payout request, which we process manually — it isn't instant. Each campaign's row also has a \"Show payout history\" link listing every payout you've received for it, with date, amount, and our note.",
        ],
      },
      {
        id: "membership-fees",
        title: "Monthly membership fees",
        body: [
          "Membership fees ask each active member for a fixed monthly amount, by email, with a payment link. Set it up from Donation, then Membership fees: turn it on, enter the monthly amount, and choose the day of the month the requests go out (1 to 28) and how many days later a reminder is sent to anyone still unpaid.",
          "On that day, every active member with an email address on file gets their own payment link. Members pay through Razorpay's secure checkout, and get a receipt by email as soon as the payment goes through. Members without an email address can't be sent a link, and are listed as \"No email on file\" in the report.",
          "Payments go through KingdomFlow's shared Razorpay account, so a 2.5% transaction fee applies, the same as for shared-service Fund Raisers. Members who join after the request day are billed from the following month.",
          "The monthly report shows what was expected, collected and is still outstanding, with each member's status and when their request was sent. Export it to CSV from the same page.",
          "The collected amount, less the fee, is paid out to you on request. Save your UPI or bank details in your organization settings first, then use Request payout on the Membership fees page. Payouts are processed manually on our end, so they aren't instant.",
          "- Payments can only be taken through KingdomFlow's shared account. Payments you collect yourself, such as cash or your own payment link, aren't recorded here.",
        ],
      },
      {
        id: "payouts",
        title: "Payouts — what KingdomFlow owes your church",
        body: [
          "Payouts (under Organization) brings together everything collected for you through KingdomFlow's shared account: Fund Raisers, paid Events and monthly membership fees. Each has its own balance, with the 2.5% fee already taken out.",
          "Owners and admins save where to send the money — a UPI ID or bank account — once, then use Request payout. One request is created for every balance that is owed. A balance that already has a request waiting is skipped until that one is paid.",
          "You see a Payouts page only for the parts you can use: each part follows the permission of its own tab (Fund Raisers, Events, Donation). Payouts are processed manually on our end, so they aren't instant. The same page is in the mobile app, under Finance.",
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
          "Growth and Pro plans can connect their own SMTP server for unmetered email sending — SMS has no equivalent \"bring your own\" option.",
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
          "Social Media is included on every plan. Connecting an account also requires an owner or admin.",
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
        title: "Starter, Growth, Pro, and Custom",
        body: [
          "The plans differ in email/SMS quotas, storage, added team logins, automation, and whether your own SMTP server can be connected. Finance and Social Media are included on every plan — see the Billing page for the full comparison.",
          "Custom is set up for a specific church by KingdomFlow, with limits agreed with you, and is shown on the pricing page as a request-a-quote option.",
          "Every plan is available billed Monthly, or Annually at 17% off (toggle on the Billing page or the pricing page).",
          "Your organization's owner and admins get an email whenever a subscription is activated, renewed, or cancelled, and whenever an add-on pack is purchased — sent to every owner/admin, not just whoever made the change.",
        ],
      },
      {
        id: "trial",
        title: "The 14-day trial",
        body: [
          "New organizations get 14 days of full Starter-plan access with no subscription required — you'll see a countdown banner across the dashboard during this period.",
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
    id: "help",
    title: "Help & Support",
    articles: [
      {
        id: "support-tickets",
        title: "Raising and replying to support tickets",
        body: [
          "Support → \"Raise a ticket\" if you run into a problem or have a question — set a category and urgency so it's easy to triage, and it's visible to your whole team, not just you.",
          "Once raised, the conversation continues right on the ticket: reply to add more detail, and any reply from KingdomFlow support shows up in the same thread — you'll also get a notification (bell icon) and an email to your org's owner/admins when support replies.",
          "You (the ticket's creator) or an org admin can close a ticket once it's resolved, or reopen a closed one — support itself moves a ticket through \"In progress\" and \"Resolved\" as they work on it.",
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
          "- Membership fee payments count only when made through KingdomFlow's shared account. Cash and your own payment links aren't recorded.",
          "- Member follow-up depends on each Sunday's register being marked complete. Unmarked Sundays are skipped, not treated as absences.",
          "- The mobile app doesn't cover Social Media, Documentation, WhatsApp template creation, follow-up automations, email attachments, invoice printing, or changing your church's name and logo — use the web for those.",
          "- Screen sharing can be started from a computer but not from the mobile app.",
          "- Documents shared with groups exist only for the Worship team and Media team today; Leaders, Youth and Committee groups share announcements and links.",
          "- Someone who joins an \"admit one by one\" K-Connect call from the app is admitted within a few seconds of the host's answer, not instantly.",
        ],
      },
    ],
  },
];
