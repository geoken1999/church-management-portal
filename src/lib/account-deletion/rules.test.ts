import { describe, it, expect } from "vitest";
import { allowedDecisions, processedBy } from "./rules";

describe("account deletion rules", () => {
  it("church owners are processed by a platform admin, everyone else by their church", () => {
    expect(processedBy("owner")).toBe("platform_admin");
    expect(processedBy("team")).toBe("church_admin");
    expect(processedBy("member")).toBe("church_admin");
  });

  it("only a member's request can also delete the member record", () => {
    expect(allowedDecisions("member")).toContain("delete_account_and_record");
    expect(allowedDecisions("team")).not.toContain("delete_account_and_record");
    expect(allowedDecisions("owner")).not.toContain(
      "delete_account_and_record",
    );
  });

  it("every kind can be declined", () => {
    for (const kind of ["member", "team", "owner"] as const)
      expect(allowedDecisions(kind)).toContain("reject");
  });
});
