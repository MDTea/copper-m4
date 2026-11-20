import { beforeEach, describe, expect, it, vi } from "vitest";
import { MODELS } from "@/lib/ai/models";
import { PRICING } from "@/lib/ai/pricing";
import {
  decideRefund,
  resetDemo,
  setLimit,
  submitRefund,
} from "@/lib/copper/refunds/store";

const callText = vi.fn();
vi.mock("@/lib/ai/call", () => ({
  callText: (...a: unknown[]) => callText(...a),
}));

beforeEach(() => {
  resetDemo();
  setLimit(100);
  callText.mockReset();
});

describe("Refund agent when the model fails", () => {
  it("still reports a refund that already went through", async () => {
    submitRefund("CSL-1006", "wrong color");
    callText.mockRejectedValue(new Error("quota exceeded"));
    const { runRefundAgent } = await import("@/lib/copper/refunds/agent");
    const result = await runRefundAgent("CSL-1006", "wrong color");
    expect(result.report).toContain("has been processed");
    expect(result.report).toContain("$79.00");
  });

  it("reports a rejection plainly", async () => {
    const r = submitRefund("CSL-1004", "x");
    decideRefund(r.ok ? r.request.id : "", "reject");
    callText.mockRejectedValue(new Error("quota exceeded"));
    const { runRefundAgent } = await import("@/lib/copper/refunds/agent");
    const result = await runRefundAgent("CSL-1004", "x");
    expect(result.report).toContain("declined");
    expect(result.report).toContain("No money was refunded");
  });

  it("says no refund was made when nothing was filed", async () => {
    callText.mockRejectedValue(new Error("quota exceeded"));
    const { runRefundAgent } = await import("@/lib/copper/refunds/agent");
    const result = await runRefundAgent("CSL-1001", "x");
    expect(result.report).toContain("No refund was made");
  });
});

describe("approved models", () => {
  it("includes Flash-Lite with a price", () => {
    const lite = MODELS.find((m) => m.id === "google/gemini-3.1-flash-lite");
    expect(lite?.googleId).toBe("gemini-3.1-flash-lite");
    expect(PRICING["google/gemini-3.1-flash-lite"].input).toBeGreaterThan(0);
  });
});
