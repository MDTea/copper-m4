"use server";

import {
  decideRefund,
  getConsoleState,
  resetDemo,
  setLimit,
  type ConsoleState,
} from "@/lib/copper/refunds/store";

export async function loadConsole(): Promise<ConsoleState> {
  return getConsoleState();
}

export async function changeLimit(limitUsd: number): Promise<ConsoleState> {
  return setLimit(limitUsd);
}

export async function decide(
  id: string,
  decision: "approve" | "reject",
): Promise<ConsoleState> {
  return decideRefund(id, decision);
}

export async function resetConsole(): Promise<ConsoleState> {
  return resetDemo();
}
