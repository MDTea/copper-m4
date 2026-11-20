// What the customer is told about their refund, written in code so the wording
// is always the same and never mentions how the decision was made (the
// auto-refund limit stays internal).
//
// The first message ends by inviting feedback. What Copper says next is fixed
// too (see GOODBYE and THANKS): if the customer says no, Copper signs off;
// if they send feedback, Copper thanks them. The customer can also ignore it.
import { getPlans, getProducts } from "@/lib/copper/catalog";
import type { RefundRequest } from "@/lib/copper/refunds/store";

const SUGGESTION_RANGE_USD = 50;

/** Said when the customer declines to send feedback. */
export const GOODBYE = "Have a great rest of your day!";

/** Said after the customer sends feedback. */
export const THANKS =
  "Thank you for providing us feedback! Your input will be seen by management and can help us serve our customers better. Have a great rest of your day!";

const FEEDBACK_INVITE = "We would also appreciate your feedback.";

const usd = (n: number) => `$${n.toFixed(2)}`;

export type Suggestion = { name: string; priceUsd: number; per?: string };

/**
 * Products and plans priced within $50 of the refunded amount, skipping the
 * thing the customer just got refunded for.
 */
export function similarlyPriced(
  amountUsd: number,
  orderItem: string,
): Suggestion[] {
  const item = orderItem.toLowerCase();
  const near = (price: number) =>
    price > 0 && Math.abs(price - amountUsd) <= SUGGESTION_RANGE_USD;
  const products: Suggestion[] = getProducts()
    .filter((p) => !item.includes(p.name.toLowerCase()) && near(p.priceUsd))
    .map((p) => ({ name: p.name, priceUsd: p.priceUsd }));
  const plans: Suggestion[] = getPlans()
    .filter((p) => !item.includes(p.name.toLowerCase()))
    .flatMap((p) => [
      { name: `${p.name} (monthly)`, priceUsd: p.monthlyUsd, per: "month" },
      { name: `${p.name} (annual)`, priceUsd: p.annualUsd, per: "year" },
    ])
    .filter((s) => near(s.priceUsd));
  return [...products, ...plans];
}

/** "subscription" for a Copper Plus order, otherwise "product". */
function kindOf(orderItem: string): "product" | "subscription" {
  return orderItem.toLowerCase().includes("copper plus")
    ? "subscription"
    : "product";
}

/** The one product the order was for, if it was for exactly one. */
function productOf(orderItem: string): string | null {
  const item = orderItem.toLowerCase();
  const found = getProducts().filter((p) =>
    item.includes(p.name.toLowerCase()),
  );
  return found.length === 1 ? found[0].name : null;
}

/** "Feel free to browse items such as:" and a bulleted list, or "". */
function browseSection(request: RefundRequest): string {
  const lines = similarlyPriced(request.amountUsd, request.item).map(
    (o) => `${o.name} at ${usd(o.priceUsd)}${o.per ? `/${o.per}` : ""}`,
  );
  const product = productOf(request.item);
  if (product) lines.push(`A different ${product} item`);
  if (lines.length === 0) return "";
  return `Feel free to browse items such as:\n\n${lines.map((l) => `* ${l}`).join("\n")}`;
}

/** The full message for a refund request, whatever happened to it. */
export function customerMessage(request: RefundRequest): string {
  const join = (parts: string[]) => parts.filter(Boolean).join("\n\n");
  if (request.status === "refunded")
    return join([
      `Our management system reviewed your refund request and approved it. Your refund of ${usd(request.amountUsd)} for order ${request.orderId} has been issued. We are sorry to hear that you didn't have a positive experience with this ${kindOf(request.item)}.`,
      browseSection(request),
      FEEDBACK_INVITE,
    ]);
  if (request.status === "rejected")
    return join([
      `Our management system reviewed your refund request and decided not to approve it, so no refund will be issued for order ${request.orderId}.`,
      FEEDBACK_INVITE,
    ]);
  return join([
    `Our management system is still reviewing your refund request for order ${request.orderId}, and no refund has been issued yet. Please check back soon.`,
    FEEDBACK_INVITE,
  ]);
}
