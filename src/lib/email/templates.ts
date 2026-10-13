// Ready-made email templates every church can start from. {{church_name}} is filled in with the
// church's own name when a template is used; anything in [square brackets] is a blank for the
// sender to fill in. Only tags the email sanitizer allows are used.
export interface BuiltInEmailTemplate {
  key: string;
  name: string;
  description: string;
  subject: string;
  html: string;
}

export const BUILT_IN_EMAIL_TEMPLATES: BuiltInEmailTemplate[] = [
  {
    key: "service-reminder",
    name: "Sunday service reminder",
    description: "Remind everyone of this week's service.",
    subject: "See you this Sunday at {{church_name}}",
    html: "<p>Dear friends,</p><p>This is a warm reminder that our service at <strong>{{church_name}}</strong> is this <strong>[Sunday]</strong> at <strong>[time]</strong>, at [place].</p><p>Come with family and friends. We look forward to worshipping together.</p><p>God bless you,<br>{{church_name}}</p>",
  },
  {
    key: "event-invitation",
    name: "Event invitation",
    description: "Invite the congregation to a special event.",
    subject: "You're invited: [event name]",
    html: "<h2>[Event name]</h2><p>You are warmly invited to <strong>[event name]</strong> at {{church_name}}.</p><ul><li><strong>When:</strong> [date and time]</li><li><strong>Where:</strong> [place]</li></ul><p>[A line or two about what will happen, and who it is for.]</p><p>Please let us know if you can join us. We would love to see you there.</p><p>{{church_name}}</p>",
  },
  {
    key: "welcome-visitor",
    name: "Welcome a first-time visitor",
    description: "Thank someone for visiting and invite them back.",
    subject: "Thank you for visiting {{church_name}}",
    html: "<p>Dear [name],</p><p>Thank you for worshipping with us at <strong>{{church_name}}</strong>. It was a joy to have you with us.</p><p>Our services are every [day] at [time]. If there is anything we can pray about with you, or any way we can help, just reply to this email.</p><p>We hope to see you again soon.</p><p>Warm regards,<br>{{church_name}}</p>",
  },
  {
    key: "newsletter",
    name: "Monthly newsletter",
    description: "News, dates and a word from the pastor.",
    subject: "{{church_name}} news for [month]",
    html: "<h2>A word from our pastor</h2><p>[A short message of encouragement.]</p><h2>What's coming up</h2><ul><li>[Date]: [event]</li><li>[Date]: [event]</li><li>[Date]: [event]</li></ul><h2>Praises and prayer</h2><p>[Share a testimony, or a prayer need for the church.]</p><p>Thank you for being part of {{church_name}}.</p>",
  },
  {
    key: "thank-you-giving",
    name: "Thank you for giving",
    description: "Thank the church for their offerings and support.",
    subject: "Thank you for your generosity",
    html: "<p>Dear church family,</p><p>On behalf of everyone at <strong>{{church_name}}</strong>, thank you for your faithful giving. Because of you we are able to [what the giving supported].</p><p>\"God loves a cheerful giver.\" (2 Corinthians 9:7)</p><p>With gratitude,<br>{{church_name}}</p>",
  },
  {
    key: "prayer-meeting",
    name: "Prayer meeting",
    description: "Call the church to pray together.",
    subject: "Join us in prayer: [day]",
    html: "<p>Dear friends,</p><p>You are invited to our prayer meeting on <strong>[day, date]</strong> at <strong>[time]</strong>, at [place or online link].</p><p>We will be praying for [the church, families, the city, specific needs]. If you have a prayer request, reply to this email and we will pray with you.</p><p>\"Where two or three gather in my name, there am I with them.\" (Matthew 18:20)</p><p>{{church_name}}</p>",
  },
  {
    key: "volunteer-call",
    name: "Call for volunteers",
    description: "Ask members to serve in a ministry or event.",
    subject: "We need your help: [what]",
    html: "<p>Dear friends,</p><p>We are looking for volunteers to help with <strong>[what]</strong> on <strong>[date]</strong>.</p><p>Roles include: [ushers, sound, children's ministry, hospitality].</p><p>If you would like to serve, simply reply to this email with your name and the role you prefer. Every hand makes a difference.</p><p>Thank you,<br>{{church_name}}</p>",
  },
  {
    key: "announcement",
    name: "General announcement",
    description: "A short, plain announcement.",
    subject: "[Announcement]",
    html: "<p>Dear church family,</p><p>[Write your announcement here.]</p><p>If you have any questions, please reply to this email.</p><p>God bless you,<br>{{church_name}}</p>",
  },
];

export function fillChurchName(text: string, churchName: string): string {
  return text.replace(/\{\{\s*church_name\s*\}\}/g, churchName);
}

export const MAX_EMAIL_TEMPLATES = 50;
export const MAX_TEMPLATE_HTML_BYTES = 200_000;
