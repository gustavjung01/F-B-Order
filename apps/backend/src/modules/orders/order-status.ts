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

const transitionMap: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = Object.freeze({
  pending: Object.freeze(["confirmed", "cancelled", "rejected"]),
  confirmed: Object.freeze(["processing", "cancelled"]),
  processing: Object.freeze(["shipping", "cancelled"]),
  shipping: Object.freeze(["completed"]),
  completed: Object.freeze([]),
  cancelled: Object.freeze([]),
  rejected: Object.freeze([]),
});

export function isOrderStatus(value: unknown): value is OrderStatus {
  return typeof value === "string" && ORDER_STATUSES.includes(value as OrderStatus);
}

export function allowedOrderTransitions(status: OrderStatus): readonly OrderStatus[] {
  return transitionMap[status];
}

export function assertOrderStatusTransition(from: OrderStatus, to: OrderStatus): void {
  if (from === to || !transitionMap[from].includes(to)) {
    throw new OrderEngineError(
      "INVALID_ORDER_STATUS_TRANSITION",
      409,
      `Order status cannot transition from ${from} to ${to}.`,
      { from, to, allowed: transitionMap[from] },
    );
  }
}
