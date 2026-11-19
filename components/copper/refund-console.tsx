"use client";

// The Refund Console: orders, the auto-refund limit, and the refund requests
// that are waiting for a person to Approve or Reject. It checks the server
// every couple of seconds, so requests from the chat appear on their own.
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import {
  changeLimit,
  decide,
  loadConsole,
  resetConsole,
} from "@/app/support/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ConsoleState } from "@/lib/copper/refunds/store";

const usd = (n: number) => `$${n.toFixed(2)}`;

export function RefundConsole() {
  const [data, setData] = useState<ConsoleState | null>(null);
  const [limit, setLimit] = useState("");
  const editing = useRef(false);
  const [, startTransition] = useTransition();

  const apply = useCallback((next: ConsoleState, syncLimit = false) => {
    setData(next);
    if (syncLimit) setLimit(String(next.limitUsd));
  }, []);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      const next = await loadConsole().catch(() => null);
      if (alive && next) {
        setData(next);
        if (!editing.current) setLimit(String(next.limitUsd));
      }
    };
    void tick();
    const id = setInterval(tick, 2000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  if (!data)
    return <p className="text-muted-foreground text-sm">Loading orders…</p>;

  const pending = data.requests.filter((r) => r.status === "pending");

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Auto-refund limit</CardTitle>
          <CardDescription>
            Refunds up to this amount are paid automatically. Anything larger
            waits for you below.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const value = Number(limit);
              if (!Number.isFinite(value) || value < 0) return;
              startTransition(async () => {
                apply(await changeLimit(value), true);
                editing.current = false;
              });
            }}
          >
            <span className="text-lg font-semibold">$</span>
            <Input
              aria-label="Auto-refund limit in dollars"
              data-testid="limit-input"
              type="number"
              min={0}
              step="0.01"
              className="w-32"
              value={limit}
              onChange={(e) => {
                editing.current = true;
                setLimit(e.target.value);
              }}
            />
            <Button type="submit">Save limit</Button>
            <span className="text-muted-foreground text-sm">
              Current: <strong>{usd(data.limitUsd)}</strong>
            </span>
          </form>
        </CardContent>
      </Card>

      <Card data-testid="waiting-approval">
        <CardHeader>
          <CardTitle>Waiting for approval ({pending.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {pending.length === 0 && (
            <p className="text-muted-foreground text-sm">
              Nothing waiting. Refunds over {usd(data.limitUsd)} show up here.
            </p>
          )}
          {pending.map((r) => (
            <div
              key={r.id}
              data-testid="pending-refund"
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
            >
              <div className="text-sm">
                <p className="font-semibold">
                  {r.orderId} · {usd(r.amountUsd)}
                </p>
                <p>
                  {r.customer}, {r.item}
                </p>
                <p className="text-muted-foreground">Reason: {r.reason}</p>
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={() =>
                    startTransition(async () =>
                      apply(await decide(r.id, "approve")),
                    )
                  }
                >
                  Approve
                </Button>
                <Button
                  variant="outline"
                  onClick={() =>
                    startTransition(async () =>
                      apply(await decide(r.id, "reject")),
                    )
                  }
                >
                  Reject
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Orders</CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              startTransition(async () => apply(await resetConsole()))
            }
          >
            Reset demo
          </Button>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Item</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.orders.map((o) => {
                const req = data.requests.find((r) => r.orderId === o.id);
                const rejected = req?.status === "rejected";
                const waiting = req?.status === "pending";
                return (
                  <TableRow key={o.id}>
                    <TableCell className="font-mono">{o.id}</TableCell>
                    <TableCell>{o.customer}</TableCell>
                    <TableCell>{o.item}</TableCell>
                    <TableCell className="text-right">
                      {usd(o.amountUsd)}
                    </TableCell>
                    <TableCell>
                      {o.status === "refunded" ? (
                        <Badge>
                          Refunded
                          {req?.decidedBy === "auto-limit"
                            ? " (automatic)"
                            : " (approved)"}
                        </Badge>
                      ) : waiting ? (
                        <Badge variant="secondary">Waiting</Badge>
                      ) : rejected ? (
                        <Badge variant="destructive">Rejected</Badge>
                      ) : (
                        <Badge variant="outline">Paid</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
