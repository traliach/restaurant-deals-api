import { Request, Response } from "express";
import { DealModel } from "../models/Deal";
import { OrderModel } from "../models/Order";
import { NotificationModel } from "../models/Notification";
import { RestaurantModel } from "../models/Restaurant";
import { UserModel } from "../models/User";

export async function createOrder(req: Request, res: Response) {
  try {
    const userId = res.locals.auth?.userId as string | undefined;
    if (!userId) return res.status(401).json({ ok: false, error: "unauthenticated" });

    const { items, stripePaymentIntentId } = req.body as {
      items?: { dealId: string; qty: number }[];
      stripePaymentIntentId?: string;
    };

    if (!items || items.length === 0) return res.status(400).json({ ok: false, error: "items required" });

    let total = 0;
    const resolvedItems = [];

    for (const item of items) {
      if (!item.dealId || !item.qty || item.qty < 1)
        return res.status(400).json({ ok: false, error: "invalid item" });

      const deal = await DealModel.findById(item.dealId);
      if (!deal || deal.status !== "PUBLISHED")
        return res.status(400).json({ ok: false, error: `deal ${item.dealId} not available` });

      const price = deal.price ?? 0;
      total += price * item.qty;
      resolvedItems.push({
        dealId: deal._id, title: deal.title,
        restaurantId: deal.restaurantId, restaurantName: deal.restaurantName,
        price, qty: item.qty, dealAtPurchase: deal.toObject(),
      });
    }

    const order = await OrderModel.create({
      userId, items: resolvedItems, total, status: "Placed",
      stripePaymentIntentId: stripePaymentIntentId ?? undefined,
      paidAt: stripePaymentIntentId ? new Date() : undefined,
    });

    return res.status(201).json({ ok: true, data: order });
  } catch {
    return res.status(500).json({ ok: false, error: "server error" });
  }
}

export async function listOrders(req: Request, res: Response) {
  try {
    const userId = res.locals.auth?.userId as string | undefined;
    if (!userId) return res.status(401).json({ ok: false, error: "unauthenticated" });
    const orders = await OrderModel.find({ userId }).sort({ createdAt: -1 });
    return res.json({ ok: true, data: orders });
  } catch {
    return res.status(500).json({ ok: false, error: "server error" });
  }
}

export async function getOrder(req: Request, res: Response) {
  try {
    const userId = res.locals.auth?.userId as string | undefined;
    if (!userId) return res.status(401).json({ ok: false, error: "unauthenticated" });
    const order = await OrderModel.findOne({ _id: req.params.id, userId });
    if (!order) return res.status(404).json({ ok: false, error: "order not found" });
    return res.json({ ok: true, data: order });
  } catch {
    return res.status(500).json({ ok: false, error: "server error" });
  }
}

export async function listOwnerOrders(req: Request, res: Response) {
  try {
    const userId = res.locals.auth?.userId as string | undefined;
    if (!userId) return res.status(401).json({ ok: false, error: "unauthenticated" });

    const owner = await UserModel.findById(userId);
    if (!owner) return res.status(403).json({ ok: false, error: "owner profile incomplete" });

    const restaurants = await RestaurantModel.find({ ownerId: owner._id }, "restaurantId");
    const restaurantIds = restaurants.map((r) => r.restaurantId);

    const orders = await OrderModel.find({ "items.restaurantId": { $in: restaurantIds } }).sort({ createdAt: -1 });
    return res.json({ ok: true, data: orders });
  } catch {
    return res.status(500).json({ ok: false, error: "server error" });
  }
}

export async function updateOwnerOrderStatus(req: Request, res: Response) {
  try {
    const userId = res.locals.auth?.userId as string | undefined;
    if (!userId) return res.status(401).json({ ok: false, error: "unauthenticated" });

    const owner = await UserModel.findById(userId);
    if (!owner) return res.status(403).json({ ok: false, error: "owner profile incomplete" });

    const { status } = req.body as { status?: string };
    const ORDER_STATUSES = ["Placed", "Preparing", "Ready", "Completed"];
    if (!status || !ORDER_STATUSES.includes(status))
      return res.status(400).json({ ok: false, error: "invalid status" });

    const restaurants = await RestaurantModel.find({ ownerId: owner._id }, "restaurantId");
    const restaurantIds = restaurants.map((r) => r.restaurantId);

    const order = await OrderModel.findOne({ _id: req.params.id, "items.restaurantId": { $in: restaurantIds } });
    if (!order) return res.status(404).json({ ok: false, error: "order not found" });

    const currentIdx = ORDER_STATUSES.indexOf(order.status);
    const nextIdx = ORDER_STATUSES.indexOf(status);
    if (nextIdx !== currentIdx + 1) return res.status(409).json({ ok: false, error: "illegal transition" });

    order.status = status as "Placed" | "Preparing" | "Ready" | "Completed";
    await order.save();

    await NotificationModel.create({
      userId: order.userId,
      type: "order_status",
      message: `Your order status updated to: ${status}`,
      orderId: order._id,
    });

    return res.json({ ok: true, data: order });
  } catch {
    return res.status(500).json({ ok: false, error: "server error" });
  }
}
