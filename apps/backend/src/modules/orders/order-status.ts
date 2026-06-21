import { OrderEngineError } from "./order-errors";

export const ORDER_STATUSES = [
  "pending",
  "confirmed",
  "processing",
  "shipping",
  "completed",
  "cancelled",
  "rejected",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

const transitionMap = {
  pending: ["confirmed", "cancelled", "rejected"],
  confirmed: ["processing", "cancelled"],
  processing: ["shipping", "cancelled"],
  shipping: ["completed"],
  completed: [],
  cancelled: [],
  rejected: [],
} as const satisfies Readonly<Record<OrderStatus, readonly OrderStatus[]>>;

export function isOrderStatus(value: unknown): value is OrderStatus {
  return typeof value === "string" && ORDER_STATUSES.includes(value as OrderStatus);
}

export function allowedOrderTransitions(status: OrderStatus): readonly OrderStatus[] {
  return transitionMap[status];
}

export function assertOrderStatusTransition(from: OrderStatus, to: OrderStatus): void {
  const allowed: readonly OrderStatus[] = transitionMap[from];
  if (from === to || !allowed.includes(to)) {
    throw new OrderEngineError(
      "INVALID_ORDER_STATUS_TRANSITION",
      409,
      `Order status cannot transition from ${from} to ${to}.`,
      { from, to, allowed },
    );
  }
}
