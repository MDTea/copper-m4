// What the customer is told about their refund, written in code so the wording
// is always the same and never mentions how the decision was made (the
// auto-refund limit stays internal).
import { getPlans, getProducts } from "@/lib/copper/catalog";
import type { RefundRequest } from "@/lib/copper/refunds/store";

const SIGN_OFF = "Have a great rest of your day!";
const SUGGESTION_RANGE_USD = 50;

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

function offerSimilar(request: RefundRequest): string {
  const options = similarlyPriced(request.amountUsd, request.item);
  if (options.length === 0) return "";
  const list = options
    .map((o) => `${o.name} at ${usd(o.priceUsd)}${o.per ? `/${o.per}` : ""}`)
    .join(", ");
  return `Would you like to take a look at some similarly priced options? Within $${SUGGESTION_RANGE_USD} of your refund, we have: ${list}.`;
}

const FEEDBACK_ASK =
  "Would you like to send us any additional feedback? It's completely optional, so just say no thanks if you'd rather skip it.";

/** The full message for a refund request, whatever happened to it. */
export function customerMessage(request: RefundRequest): string {
  const follow = (parts: string[]) => parts.filter(Boolean).join(" ");
  if (request.status === "refunded")
    return `Our management reviewed your refund request and approved it. Your refund of ${usd(request.amountUsd)} for order ${request.orderId} has been issued. ${SIGN_OFF}\n\n${follow([offerSimilar(request), FEEDBACK_ASK])}`;
  if (request.status === "rejected")
    return `Our management reviewed your refund request and decided not to approve it, so no refund will be issued for order ${request.orderId}. ${SIGN_OFF}\n\n${FEEDBACK_ASK}`;
  return `Our management is still reviewing your refund request for order ${request.orderId}, and no refund has been issued yet. Please check back soon. ${SIGN_OFF}\n\n${FEEDBACK_ASK}`;
}
