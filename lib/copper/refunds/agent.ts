// The Refund agent: a second agent that Copper hands refund requests to.
// It has its own instructions and its own tools, separate from Copper's.
// It can look up an order and file a refund request, but it cannot refund
// anything itself: file_refund_request runs the limit rule in store.ts, and
// large refunds wait there for a person.
import { stepCountIs, tool } from "ai";
import { z } from "zod";
import { callText } from "@/lib/ai/call";
import {
  getConsoleState,
  getRequest,
  submitRefund,
  type RefundRequest,
} from "@/lib/copper/refunds/store";

const WAIT_MS = 120_000;
const POLL_MS = 1_000;

export const REFUND_INSTRUCTIONS = `You are the Refund agent for Copper State Labs. Copper, the shopping assistant, hands refund requests to you.
You are given an order number and the customer's reason.
1. Call file_refund_request once to file the refund. It checks that the order exists and isn't already refunded. You never decide whether a refund is approved: the system and the support team do.
2. Report the outcome in one or two plain sentences, using only what the tool returned: refunded (with the amount), or declined by the support team. If the order isn't found or was already refunded, say so.
Never invent order details or promise a refund the tool didn't confirm.`;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Files the request, then waits for a person if it is over the limit. */
async function fileAndWait(orderId: string, reason: string) {
  const submitted = submitRefund(orderId, reason);
  if (!submitted.ok)
    return { status: "error" as const, message: submitted.error };
  let request: RefundRequest = submitted.request;
  const deadline = Date.now() + WAIT_MS;
  while (request.status === "pending" && Date.now() < deadline) {
    await sleep(POLL_MS);
    request = getRequest(request.id) ?? request;
  }
  return {
    status: request.status,
    requestId: request.id,
    orderId: request.orderId,
    amountUsd: request.amountUsd,
    decidedBy: request.decidedBy,
    message:
      request.status === "refunded"
        ? `Refunded $${request.amountUsd.toFixed(2)} to the customer.`
        : request.status === "rejected"
          ? "The support team reviewed this request and declined it. No money was refunded."
          : "Still waiting for the support team to review this request. No money has moved yet.",
  };
}

const refundTools = {
  file_refund_request: tool({
    description:
      "Files a refund request for an order. Small refunds go through immediately; large ones wait for a person's approval, and this tool waits for that decision before returning.",
    inputSchema: z.object({ orderId: z.string(), reason: z.string() }),
    execute: async ({ orderId, reason }) => fileAndWait(orderId, reason),
  }),
};

export type RefundHandoff = { agent: "refund"; report: string };

/**
 * What happened to this order's refund, in plain words, read from the store.
 * Used when the model fails after the refund was already decided, so the
 * customer still hears the real outcome.
 */
function reportFromStore(orderId: string): string {
  const id = orderId.trim().toUpperCase();
  const request = getConsoleState().requests.find((r) => r.orderId === id);
  if (!request)
    return "The Refund agent couldn't process this request right now. No refund was made. Please try again.";
  if (request.status === "refunded")
    return `The refund for order ${request.orderId} has been processed in the amount of $${request.amountUsd.toFixed(2)}.`;
  if (request.status === "rejected")
    return `The support team reviewed the refund for order ${request.orderId} and declined it. No money was refunded.`;
  return `The refund for order ${request.orderId} is waiting for the support team to review it. No money has moved yet.`;
}

/** Runs the Refund agent for one request and returns its report. */
export async function runRefundAgent(
  orderId: string,
  reason: string,
): Promise<RefundHandoff> {
  try {
    const result = await callText(
      { module: 4, feature: "refund-agent" },
      {
        instructions: REFUND_INSTRUCTIONS,
        prompt: `Order number: ${orderId}\nCustomer's reason: ${reason}`,
        tools: refundTools,
        stopWhen: stepCountIs(3),
      },
    );
    return {
      agent: "refund",
      report: result.text.trim() || reportFromStore(orderId),
    };
  } catch {
    // The model failed (for example, a quota limit). The store still knows
    // what was decided, so report that instead of failing.
    return { agent: "refund", report: reportFromStore(orderId) };
  }
}
