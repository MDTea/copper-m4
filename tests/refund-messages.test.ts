import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  customerMessage,
  GOODBYE,
  similarlyPriced,
  THANKS,
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
  it("uses the management-system wording and never mentions the limit", () => {
    const msg = customerMessage(request("CSL-1006"));
    expect(msg).toMatch(
      /^Our management system reviewed your refund request and approved it\./,
    );
    expect(msg).toContain(
      "We are sorry to hear that you didn't have a positive experience with this product.",
    );
    expect(msg.toLowerCase()).not.toMatch(/limit|automatic|auto-|threshold/);
    // The sign-off comes later, after the customer answers.
    expect(msg).not.toContain(GOODBYE);
  });

  it("says subscription for a Copper Plus order", () => {
    const msg = customerMessage(request("CSL-1003"));
    expect(msg).toContain("with this subscription.");
  });

  it("lists similar options and a different item of the same product", () => {
    const msg = customerMessage(request("CSL-1006"));
    expect(msg).toContain("Feel free to browse items such as:");
    expect(msg).toContain("* Copper Plus (annual) at $79.00/year");
    expect(msg).toContain("* A different Copper Notes item");
    const names = similarlyPriced(79, "Copper Notes (Patina Teal)").map(
      (x) => x.name,
    );
    expect(names).not.toContain("Copper Notes");
    expect(names).not.toContain("Copper Home");
  });

  it("invites feedback whatever the outcome", () => {
    const refunded = customerMessage(request("CSL-1006"));
    const pending = request("CSL-1004");
    const waiting = customerMessage(pending);
    const rejected = customerMessage(
      decideRefund(pending.id, "reject").requests.find(
        (r) => r.id === pending.id,
      )!,
    );
    for (const msg of [refunded, waiting, rejected])
      expect(
        msg.trim().endsWith("We would also appreciate your feedback."),
      ).toBe(true);
    expect(rejected).toContain("decided not to approve");
    expect(rejected).not.toContain("browse");
  });

  it("has fixed follow-up lines", () => {
    expect(GOODBYE).toBe("Have a great rest of your day!");
    expect(THANKS).toBe(
      "Thank you for providing us feedback! Your input will be seen by management and can help us serve our customers better. Have a great rest of your day!",
    );
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
    expect(result.report).toContain("Our management system reviewed");
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

describe("feedback tool", () => {
  it("saves feedback and returns the thank-you reply", async () => {
    const { copperTools } = await import("@/lib/copper/assistant/tools");
    const out = await copperTools.submit_refund_feedback.execute!(
      { orderId: "CSL-1006", feedback: "Wrong color" },
      { toolCallId: "t", messages: [], context: {} },
    );
    expect(out).toEqual({ saved: true, reply: THANKS });
    expect(getConsoleState().feedback[0].text).toBe("Wrong color");
  });
});
