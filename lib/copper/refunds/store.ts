// Orders and refund requests for the Refund Console (Module 4).
// The auto-refund rule lives HERE, in plain code: a request at or under the
// limit is refunded at once; a larger one waits for a person to Approve or
// Reject it. The model never makes that decision.
// Kept in server memory (no database yet), so it resets when the server restarts.

export type Order = {
  id: string;
  customer: string;
  item: string;
  amountUsd: number;
  status: "paid" | "refunded";
};

export type RefundStatus = "pending" | "refunded" | "rejected";

export type RefundRequest = {
  id: string;
  orderId: string;
  customer: string;
  item: string;
  amountUsd: number;
  reason: string;
  status: RefundStatus;
  /** Who decided: the code's limit rule, or a person in the console. */
  decidedBy: "auto-limit" | "person" | null;
  createdAt: string;
};

export type Feedback = {
  id: string;
  orderId: string;
  text: string;
  createdAt: string;
};

export type ConsoleState = {
  limitUsd: number;
  orders: Order[];
  requests: RefundRequest[];
  feedback: Feedback[];
};

const DEFAULT_LIMIT_USD = 100;

const SEED_ORDERS: Order[] = [
  {
    id: "CSL-1001",
    customer: "Dana Ortiz",
    item: "Copper Home (Night Sky)",
    amountUsd: 149,
    status: "paid",
  },
  {
    id: "CSL-1002",
    customer: "Sam Whitaker",
    item: "Copper Notes (Brushed Copper)",
    amountUsd: 79,
    status: "paid",
  },
  {
    id: "CSL-1003",
    customer: "Priya Nair",
    item: "Copper Plus, 1 month",
    amountUsd: 12.99,
    status: "paid",
  },
  {
    id: "CSL-1004",
    customer: "Luis Herrera",
    item: "Copper Home (Polished Copper)",
    amountUsd: 149,
    status: "paid",
  },
  {
    id: "CSL-1005",
    customer: "Mia Chen",
    item: "Copper Home + Copper Notes bundle",
    amountUsd: 228,
    status: "paid",
  },
  {
    id: "CSL-1006",
    customer: "Jordan Blake",
    item: "Copper Notes (Patina Teal)",
    amountUsd: 79,
    status: "paid",
  },
  {
    id: "CSL-1007",
    customer: "Ava Brooks",
    item: "Copper Home (Patina Teal)",
    amountUsd: 149,
    status: "paid",
  },
  {
    id: "CSL-1008",
    customer: "Noah Kim",
    item: "Copper Plus, 1 year",
    amountUsd: 119,
    status: "paid",
  },
];

const g = globalThis as unknown as { __copperRefunds?: ConsoleState };

function fresh(): ConsoleState {
  return {
    limitUsd: DEFAULT_LIMIT_USD,
    orders: structuredClone(SEED_ORDERS),
    requests: [],
    feedback: [],
  };
}

function state(): ConsoleState {
  return (g.__copperRefunds ??= fresh());
}

export function getConsoleState(): ConsoleState {
  return structuredClone(state());
}

export function findOrder(orderId: string): Order | undefined {
  const id = orderId.trim().toUpperCase();
  const order = state().orders.find((o) => o.id === id);
  return order && structuredClone(order);
}

export function setLimit(limitUsd: number): ConsoleState {
  if (Number.isFinite(limitUsd) && limitUsd >= 0)
    state().limitUsd = Math.round(limitUsd * 100) / 100;
  return getConsoleState();
}

export function resetDemo(): ConsoleState {
  const limit = state().limitUsd;
  g.__copperRefunds = { ...fresh(), limitUsd: limit };
  return getConsoleState();
}

export type SubmitResult =
  { ok: true; request: RefundRequest } | { ok: false; error: string };

/** The code rule: at or under the limit refunds now, over it waits. */
export function submitRefund(orderId: string, reason: string): SubmitResult {
  const s = state();
  const order = s.orders.find((o) => o.id === orderId.trim().toUpperCase());
  if (!order) return { ok: false, error: `No order ${orderId} was found.` };
  if (order.status === "refunded")
    return { ok: false, error: `Order ${order.id} was already refunded.` };
  const open = s.requests.find(
    (r) => r.orderId === order.id && r.status === "pending",
  );
  if (open) return { ok: true, request: structuredClone(open) };

  const auto = order.amountUsd <= s.limitUsd;
  const request: RefundRequest = {
    id: `RF-${s.requests.length + 1}`,
    orderId: order.id,
    customer: order.customer,
    item: order.item,
    amountUsd: order.amountUsd,
    reason: reason.trim() || "No reason given",
    status: auto ? "refunded" : "pending",
    decidedBy: auto ? "auto-limit" : null,
    createdAt: new Date().toISOString(),
  };
  if (auto) order.status = "refunded";
  s.requests.unshift(request);
  return { ok: true, request: structuredClone(request) };
}

export function getRequest(id: string): RefundRequest | undefined {
  const r = state().requests.find((x) => x.id === id);
  return r && structuredClone(r);
}

/** A person's decision in the console. */
export function decideRefund(
  id: string,
  decision: "approve" | "reject",
): ConsoleState {
  const s = state();
  const request = s.requests.find((r) => r.id === id);
  if (request && request.status === "pending") {
    request.decidedBy = "person";
    if (decision === "approve") {
      request.status = "refunded";
      const order = s.orders.find((o) => o.id === request.orderId);
      if (order) order.status = "refunded";
    } else request.status = "rejected";
  }
  return getConsoleState();
}

/** Optional feedback a customer chose to send after their refund request. */
export function addFeedback(orderId: string, text: string): Feedback {
  const s = state();
  const entry: Feedback = {
    id: `FB-${s.feedback.length + 1}`,
    orderId: orderId.trim().toUpperCase(),
    text: text.trim(),
    createdAt: new Date().toISOString(),
  };
  s.feedback.unshift(entry);
  return structuredClone(entry);
}
