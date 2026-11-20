// The Refund agent: a second agent that Copper hands refund requests to.
// It has its own instructions and its own tool, separate from Copper's.
// It cannot refund anything itself: file_refund_request runs the limit rule
// in store.ts, and large refunds wait there for a person. What the customer
// hears comes from messages.ts, so the wording is fixed and never mentions
// the limit.
import { stepCountIs, tool } from "ai";
import { z } from "zod";
import { callText } from "@/lib/ai/call";
import { customerMessage } from "@/lib/copper/refunds/messages";
import {
  getConsoleState,
  getRequest,
  submitRefund,
  type RefundRequest,
} from "@/lib/copper/refunds/store";

const WAIT_MS = 120_000;
const POLL_MS = 1_000;

export const REFUND_INSTRUCTIONS = `You are the Refund agent for Copper State Labs. Copper, the shopping assistant, hands refund requests to you.
You are given an order number and the customer's reason. Call file_refund_request exactly once with them. You never decide whether a refund is approved: the system and our management do. Don't write anything else.`;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Files the request, then waits for a person if it needs approval. */
async function fileAndWait(
  orderId: string,
  reason: string,
): Promise<{ message: string; request?: RefundRequest }> {
  const submitted = submitRefund(orderId, reason);
  if (!submitted.ok) return { message: submitted.error };
  let request: RefundRequest = submitted.request;
  const deadline = Date.now() + WAIT_MS;
  while (request.status === "pending" && Date.now() < deadline) {
    await sleep(POLL_MS);
    request = getRequest(request.id) ?? request;
  }
  return { message: customerMessage(request), request };
}

export type RefundHandoff = {
  agent: "refund";
  /** What Copper tells the customer, word for word. */
  report: string;
};

const COULDNT_PROCESS =
  "Sorry, we couldn't process your refund request right now, and no refund was made. Please try again in a little while.";

/** The message for an order's latest request, read from the store. */
function reportFromStore(orderId: string): string {
  const id = orderId.trim().toUpperCase();
  const request = getConsoleState().requests.find((r) => r.orderId === id);
  return request ? customerMessage(request) : COULDNT_PROCESS;
}

/** Runs the Refund agent for one request and returns its report. */
export async function runRefundAgent(
  orderId: string,
  reason: string,
): Promise<RefundHandoff> {
  const captured: { message: string | null } = { message: null };
  const refundTools = {
    file_refund_request: tool({
      description:
        "Files a refund request for an order. Small refunds go through immediately; larger ones wait for management's decision, and this tool waits for that decision before returning.",
      inputSchema: z.object({ orderId: z.string(), reason: z.string() }),
      execute: async (input) => {
        const result = await fileAndWait(input.orderId, input.reason);
        captured.message = result.message;
        // The model only needs to know it's done; the customer's message
        // is built in code.
        return { done: true };
      },
    }),
  };
  try {
    await callText(
      { module: 4, feature: "refund-agent" },
      {
        instructions: REFUND_INSTRUCTIONS,
        prompt: `Order number: ${orderId}\nCustomer's reason: ${reason}`,
        tools: refundTools,
        toolChoice: "required",
        // One step: call the tool. No second model call just to repeat it.
        stopWhen: stepCountIs(1),
      },
    );
  } catch {
    // The model failed (for example, a quota limit). The store still knows
    // what was decided, so report that instead of failing.
  }
  return {
    agent: "refund",
    report: captured.message ?? reportFromStore(orderId),
  };
}
