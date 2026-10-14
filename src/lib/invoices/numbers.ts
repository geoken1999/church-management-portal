// Invoice numbers and the amount in words. Pure.

// India's financial year runs April to March. 2026-10-14 belongs to "26-27".
export function financialYear(date: Date, timeZone = "Asia/Kolkata"): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit" }).formatToParts(date);
  const year = Number(parts.find((p) => p.type === "year")?.value);
  const month = Number(parts.find((p) => p.type === "month")?.value);
  const start = month >= 4 ? year : year - 1;
  return `${String(start).slice(-2)}-${String(start + 1).slice(-2)}`;
}

export function formatInvoiceNumber(prefix: string, fy: string, sequence: number): string {
  return `${prefix}/${fy}/${String(sequence).padStart(6, "0")}`;
}

const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function below1000(n: number): string {
  const parts: string[] = [];
  if (n >= 100) {
    parts.push(`${ONES[Math.floor(n / 100)]} Hundred`);
    n %= 100;
  }
  if (n >= 20) {
    parts.push(TENS[Math.floor(n / 10)] + (n % 10 ? ` ${ONES[n % 10]}` : ""));
  } else if (n > 0) {
    parts.push(ONES[n]);
  }
  return parts.join(" ");
}

// "Rupees One Thousand Seven Hundred Sixty Eight and Eighty Two Paise Only", in the Indian system (lakh, crore).
export function amountInWords(amount: number): string {
  const totalPaise = Math.round(amount * 100);
  let rupees = Math.floor(totalPaise / 100);
  const paise = totalPaise % 100;
  const words: string[] = [];
  const crore = Math.floor(rupees / 10_000_000);
  rupees %= 10_000_000;
  const lakh = Math.floor(rupees / 100_000);
  rupees %= 100_000;
  const thousand = Math.floor(rupees / 1000);
  rupees %= 1000;
  if (crore) words.push(`${below1000(crore)} Crore`);
  if (lakh) words.push(`${below1000(lakh)} Lakh`);
  if (thousand) words.push(`${below1000(thousand)} Thousand`);
  if (rupees) words.push(below1000(rupees));
  const rupeeText = words.length ? words.join(" ") : "Zero";
  return `Rupees ${rupeeText}${paise ? ` and ${below1000(paise)} Paise` : ""} Only`;
}
