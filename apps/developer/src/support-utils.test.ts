import { describe, expect, it } from "vitest";
import { supportPath, ticketQuery } from "./support-utils";
describe("support request boundaries", () => {
  it("encodes tenant identifiers as one path segment", () => {
    expect(supportPath("../other", "/tickets")).toBe(
      "/support/tenants/..%2Fother/tickets",
    );
  });
  it("encodes free text without allowing filters to inject parameters", () => {
    const query = ticketQuery({
      search: "  alpha&status=closed  ",
      status: "open",
      priority: "",
      assignedTo: "",
    });
    const params = new URLSearchParams(query);
    expect(params.get("search")).toBe("alpha&status=closed");
    expect(params.getAll("status")).toEqual(["open"]);
  });
  it("omits blank filters instead of claiming a filter is active", () => {
    expect(
      ticketQuery({ search: " ", status: "", priority: "", assignedTo: "" }),
    ).toBe("");
  });
});
