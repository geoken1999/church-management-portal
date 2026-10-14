import { describe, expect, it } from "vitest";
import { amountInWords, financialYear, formatInvoiceNumber } from "@/lib/invoices/numbers";

describe("invoice numbers", () => {
  it("follow the April to March financial year", () => {
    expect(financialYear(new Date("2026-10-14T06:00:00Z"))).toBe("26-27");
    expect(financialYear(new Date("2027-03-31T10:00:00Z"))).toBe("26-27");
    expect(financialYear(new Date("2027-04-01T00:00:00Z"))).toBe("27-28");
    // 31 March late evening in India is already 1 April in UTC+5:30 only after midnight.
    expect(financialYear(new Date("2027-03-31T19:00:00Z"))).toBe("27-28");
  });
  it("are padded and in order", () => {
    expect(formatInvoiceNumber("KF", "26-27", 1)).toBe("KF/26-27/000001");
    expect(formatInvoiceNumber("KF", "26-27", 123456)).toBe("KF/26-27/123456");
  });
});

describe("amountInWords", () => {
  it("writes rupees and paise the Indian way", () => {
    expect(amountInWords(1768.82)).toBe("Rupees One Thousand Seven Hundred Sixty Eight and Eighty Two Paise Only");
    expect(amountInWords(470.82)).toBe("Rupees Four Hundred Seventy and Eighty Two Paise Only");
    expect(amountInWords(5898.82)).toBe("Rupees Five Thousand Eight Hundred Ninety Eight and Eighty Two Paise Only");
  });
  it("uses lakh and crore, and handles round and zero amounts", () => {
    expect(amountInWords(125000)).toBe("Rupees One Lakh Twenty Five Thousand Only");
    expect(amountInWords(12345678)).toBe("Rupees One Crore Twenty Three Lakh Forty Five Thousand Six Hundred Seventy Eight Only");
    expect(amountInWords(0)).toBe("Rupees Zero Only");
    expect(amountInWords(11)).toBe("Rupees Eleven Only");
  });
});
