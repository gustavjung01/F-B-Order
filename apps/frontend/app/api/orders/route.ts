import { getCustomerOrderHistory } from "@/lib/customer-order-history-proxy";
import { proxyCreateOrder } from "@/lib/create-order-proxy";

export const dynamic = "force-dynamic";
export const GET = getCustomerOrderHistory;
export const POST = proxyCreateOrder;
