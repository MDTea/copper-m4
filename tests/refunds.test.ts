import { beforeEach, describe, expect, it } from "vitest";
import {
  decideRefund,
  getConsoleState,
  resetDemo,
  setLimit,
  submitRefund,
} from "@/lib/copper/refunds/store";

beforeEach(() => {
  resetDemo();
  setLimit(100);
});

describe("refund rules (made by code)", () => {
  it("refunds at or under the limit automatically", () => {
    const r = submitRefund("CSL-1002", "broken");
    expect(r.ok && r.request.status).toBe("refunded");
    expect(r.ok && r.request.decidedBy).toBe("auto-limit");
  });

  it("holds a refund over the limit until a person approves it", () => {
    const r = submitRefund("CSL-1001", "changed my mind");
    expect(r.ok && r.request.status).toBe("pending");
    const id = r.ok ? r.request.id : "";
    const state = decideRefund(id, "approve");
    expect(state.requests[0].status).toBe("refunded");
    expect(state.orders.find((o) => o.id === "CSL-1001")?.status).toBe(
      "refunded",
    );
  });

  it("keeps the money when a person rejects", () => {
    const r = submitRefund("CSL-1004", "no reason");
    const state = decideRefund(r.ok ? r.request.id : "", "reject");
    expect(state.requests[0].status).toBe("rejected");
    expect(state.orders.find((o) => o.id === "CSL-1004")?.status).toBe("paid");
  });

  it("follows a changed limit and refuses repeat or unknown orders", () => {
    setLimit(200);
    const r = submitRefund("CSL-1001", "x");
    expect(r.ok && r.request.status).toBe("refunded");
    expect(submitRefund("CSL-1001", "x").ok).toBe(false);
    expect(submitRefund("CSL-9999", "x").ok).toBe(false);
    expect(getConsoleState().limitUsd).toBe(200);
  });
});
