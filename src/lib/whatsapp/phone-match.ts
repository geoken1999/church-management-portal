// Two numbers are the same person's when their last 10 digits match. Meta
// sends senders in full (+91 98765 43210); members are often saved without
// the country code, or with a leading 0. Pure, so the rule is testable.

export function nationalTail(phone: string): string {
  return phone.replace(/\D/g, "").slice(-10);
}

export function isSameNumber(a: string, b: string): boolean {
  const tail = nationalTail(a);
  return tail.length === 10 && tail === nationalTail(b);
}
