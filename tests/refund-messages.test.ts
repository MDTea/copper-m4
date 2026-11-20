import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  customerMessage,
  similarlyPriced,
} from "@/lib/copper/refunds/messages";
import {
  addFeedback,
  decideRefund,
  getConsoleState,
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

const request = (orderId: string) => {
  const r = submitRefund(orderId, "reason");
  if (!r.ok) throw new Error(r.error);
  return r.request;
};

describe("customer messages", () => {
  it("uses the management wording and never mentions the limit", () => {
    const msg = customerMessage(request("CSL-1006"));
    expect(msg).toMatch(
      /^Our management reviewed your refund request and approved it\./,
    );
    expect(msg).toContain("Have a great rest of your day!");
    expect(msg.toLowerCase()).not.toMatch(/limit|automatic|auto-|threshold/);
  });

  it("offers options within $50 of the refunded amount, not the item itself", () => {
    const names = similarlyPriced(79, "Copper Notes (Patina Teal)").map(
      (s) => s.name,
    );
    expect(names).toContain("Copper Plus (annual)");
    expect(names).not.toContain("Copper Notes");
    expect(names).not.toContain("Copper Home");
    expect(customerMessage(request("CSL-1006"))).toContain(
      "similarly priced options",
    );
  });

  it("asks for optional feedback whatever the outcome", () => {
    const refunded = customerMessage(request("CSL-1006"));
    const pending = request("CSL-1004");
    const waiting = customerMessage(pending);
    const rejected = customerMessage(
      decideRefund(pending.id, "reject").requests.find(
        (r) => r.id === pending.id,
      )!,
    );
    for (const msg of [refunded, waiting, rejected]) {
      expect(msg).toContain("additional feedback");
      expect(msg).toContain("optional");
    }
    expect(rejected).toContain("decided not to approve");
    expect(rejected).not.toContain("similarly priced");
  });
});

describe("Refund agent output", () => {
  it("returns the code-built message, not the model's words", async () => {
    callText.mockImplementation(async (_info, options) => {
      await options.tools.file_refund_request.execute({
        orderId: "CSL-1006",
        reason: "wrong color",
      });
      return { text: "Auto-limit approved it automatically!" };
    });
    const { runRefundAgent } = await import("@/lib/copper/refunds/agent");
    const result = await runRefundAgent("CSL-1006", "wrong color");
    expect(result.report).toContain("Our management reviewed");
    expect(result.report.toLowerCase()).not.toContain("auto");
  });
});

describe("feedback", () => {
  it("is saved for the console", () => {
    addFeedback("csl-1006", " Great service ");
    const [f] = getConsoleState().feedback;
    expect(f.orderId).toBe("CSL-1006");
    expect(f.text).toBe("Great service");
  });
});
