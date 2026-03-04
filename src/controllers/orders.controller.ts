/**
 * orders.controller.ts
 *
 * Handles everything related to orders:
 *  - createOrder   : customer places an order after checkout
 *  - listOrders    : customer views their own order history
 *  - getOrder      : customer views one specific order
 *  - listOwnerOrders       : owner sees all incoming orders for their restaurant(s)
 *  - updateOwnerOrderStatus: owner advances an order through the status pipeline
 */

import { Request, Response } from "express";
import { DealModel } from "../models/Deal";
import { OrderModel } from "../models/Order";
import { NotificationModel } from "../models/Notification";
import { RestaurantModel } from "../models/Restaurant";
import { UserModel } from "../models/User";

// ─── Customer: place a new order ─────────────────────────────────────────────

export async function createOrder(req: Request, res: Response) {
  try {
    // Pull the logged-in customer's ID from the auth middleware result
    const userId = res.locals.auth?.userId as string | undefined;
    if (!userId) {
      console.log("[createOrder] Rejected — no auth token");
      return res.status(401).json({ ok: false, error: "unauthenticated" });
    }

    // Expect the request body to contain an array of items (dealId + qty)
    // and optionally a Stripe payment intent ID to confirm payment happened
    const { items, stripePaymentIntentId } = req.body as {
      items?: { dealId: string; qty: number }[];
      stripePaymentIntentId?: string;
    };

    if (!items || items.length === 0) {
      console.log("[createOrder] Rejected — no items in body");
      return res.status(400).json({ ok: false, error: "items required" });
    }

    console.log(`[createOrder] userId=${userId} itemCount=${items.length}`);

    // For each item the customer wants to buy, look up the deal in the database.
    // This "resolves" the cart into real data (title, price, restaurant) so we
    // have an accurate snapshot at the moment of purchase — even if the deal
    // changes or expires later.
    let total = 0;
    const resolvedItems = [];

    for (const item of items) {
      if (!item.dealId || !item.qty || item.qty < 1) {
        console.log(`[createOrder] Invalid item: ${JSON.stringify(item)}`);
        return res.status(400).json({ ok: false, error: "invalid item" });
      }

      const deal = await DealModel.findById(item.dealId);

      // Only PUBLISHED deals can be ordered — reject anything else
      if (!deal || deal.status !== "PUBLISHED") {
        console.log(`[createOrder] Deal unavailable: dealId=${item.dealId} status=${deal?.status}`);
        return res.status(400).json({ ok: false, error: `deal ${item.dealId} not available` });
      }

      const price = deal.price ?? 0;
      total += price * item.qty;

      console.log(`[createOrder]   item: "${deal.title}" qty=${item.qty} price=${price} subtotal=${price * item.qty}`);

      // Store a full snapshot of the deal at purchase time (dealAtPurchase).
      // This protects the customer: if a deal is later edited or deleted,
      // their order receipt still shows what they actually bought.
      resolvedItems.push({
        dealId: deal._id,
        title: deal.title,
        restaurantId: deal.restaurantId,
        restaurantName: deal.restaurantName,
        price,
        qty: item.qty,
        dealAtPurchase: deal.toObject(),
      });
    }

    console.log(`[createOrder] Total calculated: $${total.toFixed(2)}`);

    // Save the order to the database with status "Placed"
    const order = await OrderModel.create({
      userId,
      items: resolvedItems,
      total,
      status: "Placed",
      stripePaymentIntentId: stripePaymentIntentId ?? undefined,
      // Only mark paidAt if Stripe confirmed the payment
      paidAt: stripePaymentIntentId ? new Date() : undefined,
    });

    console.log(`[createOrder] Order created: orderId=${order._id} total=$${total.toFixed(2)}`);

    // ── Notify restaurant owners ──────────────────────────────────────────────
    // Get the unique set of restaurantIds from all ordered items.
    // (A cart can contain items from multiple restaurants.)
    const restaurantIds = [...new Set(resolvedItems.map((i) => i.restaurantId))];
    console.log(`[createOrder] Looking up owners for restaurants: ${restaurantIds.join(", ")}`);

    // Find the Restaurant documents to get their owner user IDs
    const restaurants = await RestaurantModel.find(
      { restaurantId: { $in: restaurantIds } },
      "ownerId restaurantId"
    );

    // Deduplicate owner IDs in case one owner has multiple restaurants in the cart
    const ownerIds = [...new Set(restaurants.map((r) => r.ownerId.toString()))];
    console.log(`[createOrder] Notifying ${ownerIds.length} owner(s): ${ownerIds.join(", ")}`);

    if (ownerIds.length > 0) {
      // Build a human-readable summary of what was ordered
      const itemSummary = resolvedItems.map((i) => `${i.title} ×${i.qty}`).join(", ");

      // Create one notification document per owner
      await NotificationModel.insertMany(
        ownerIds.map((ownerId) => ({
          userId: ownerId,
          type: "order_placed",
          message: `New order placed: ${itemSummary} — $${total.toFixed(2)}`,
          orderId: order._id,
        }))
      );
      console.log(`[createOrder] Notifications sent to owners`);
    } else {
      console.log(`[createOrder] No matching restaurant owners found — order placed without notification`);
    }

    return res.status(201).json({ ok: true, data: order });
  } catch (err) {
    console.error("[createOrder] Unexpected error:", err);
    return res.status(500).json({ ok: false, error: "server error" });
  }
}

// ─── Customer: list their own orders ─────────────────────────────────────────

export async function listOrders(req: Request, res: Response) {
  try {
    const userId = res.locals.auth?.userId as string | undefined;
    if (!userId) {
      console.log("[listOrders] Rejected — no auth token");
      return res.status(401).json({ ok: false, error: "unauthenticated" });
    }

    // Find all orders belonging to this customer, newest first
    const orders = await OrderModel.find({ userId }).sort({ createdAt: -1 });
    console.log(`[listOrders] userId=${userId} found=${orders.length} orders`);

    return res.json({ ok: true, data: orders });
  } catch (err) {
    console.error("[listOrders] Unexpected error:", err);
    return res.status(500).json({ ok: false, error: "server error" });
  }
}

// ─── Customer: get a single order by ID ──────────────────────────────────────

export async function getOrder(req: Request, res: Response) {
  try {
    const userId = res.locals.auth?.userId as string | undefined;
    if (!userId) {
      console.log("[getOrder] Rejected — no auth token");
      return res.status(401).json({ ok: false, error: "unauthenticated" });
    }

    // Find by both _id and userId so a customer can't view someone else's order
    const order = await OrderModel.findOne({ _id: req.params.id, userId });

    if (!order) {
      console.log(`[getOrder] Not found: orderId=${req.params.id} userId=${userId}`);
      return res.status(404).json({ ok: false, error: "order not found" });
    }

    console.log(`[getOrder] orderId=${order._id} status=${order.status}`);
    return res.json({ ok: true, data: order });
  } catch (err) {
    console.error("[getOrder] Unexpected error:", err);
    return res.status(500).json({ ok: false, error: "server error" });
  }
}

// ─── Owner: list all incoming orders for their restaurant(s) ─────────────────

export async function listOwnerOrders(req: Request, res: Response) {
  try {
    const userId = res.locals.auth?.userId as string | undefined;
    if (!userId) {
      console.log("[listOwnerOrders] Rejected — no auth token");
      return res.status(401).json({ ok: false, error: "unauthenticated" });
    }

    // Load the owner's user document to get their identity
    const owner = await UserModel.findById(userId);
    if (!owner) {
      console.log(`[listOwnerOrders] Owner not found: userId=${userId}`);
      return res.status(403).json({ ok: false, error: "owner profile incomplete" });
    }

    console.log(`[listOwnerOrders] owner=${owner.email}`);

    // Step 1 — collect all restaurant IDs this owner controls.
    // We combine two sources:
    //   a) RestaurantModel lookup by ownerId (covers seed restaurants like "newark-owner-1")
    //   b) owner.restaurantId directly (covers portal-created deals like "newark-owner")
    const ownedRestaurants = await RestaurantModel.find({ ownerId: owner._id }, "restaurantId");
    const restaurantIds = new Set(ownedRestaurants.map((r) => r.restaurantId));
    if (owner.restaurantId) restaurantIds.add(owner.restaurantId);

    console.log(`[listOwnerOrders] restaurantIds: ${[...restaurantIds].join(", ")}`);

    // Step 2 — find all deals that belong to any of those restaurants
    const ownerDeals = await DealModel.find(
      { restaurantId: { $in: [...restaurantIds] } },
      "_id"
    );
    const dealIds = ownerDeals.map((d) => d._id);
    const dealIdStrings = new Set(dealIds.map(String));

    console.log(`[listOwnerOrders] matching deals: ${dealIds.length}`);

    // Step 3 — find any order that contains at least one of those deals
    const orders = await OrderModel.find(
      { "items.dealId": { $in: dealIds } }
    ).sort({ createdAt: -1 });

    console.log(`[listOwnerOrders] raw orders matched: ${orders.length}`);

    // Step 4 — scope each order to only THIS owner's items.
    // A customer can mix items from multiple restaurants in one cart.
    // Without this filter, the owner would see other restaurants' items
    // and an inflated total. We strip them out here.
    const scoped = orders.map((o) => {
      const myItems = o.items.filter((item) =>
        dealIdStrings.has(item.dealId.toString())
      );
      const myTotal = myItems.reduce((sum, item) => sum + item.price * item.qty, 0);

      console.log(`[listOwnerOrders]   orderId=${o._id} status=${o.status} myItems=${myItems.length} myTotal=$${myTotal.toFixed(2)}`);

      return { ...o.toObject(), items: myItems, total: myTotal };
    });

    return res.json({ ok: true, data: scoped });
  } catch (err) {
    console.error("[listOwnerOrders] Unexpected error:", err);
    return res.status(500).json({ ok: false, error: "server error" });
  }
}

// ─── Owner: advance an order to the next status ──────────────────────────────

export async function updateOwnerOrderStatus(req: Request, res: Response) {
  try {
    const userId = res.locals.auth?.userId as string | undefined;
    if (!userId) {
      console.log("[updateOwnerOrderStatus] Rejected — no auth token");
      return res.status(401).json({ ok: false, error: "unauthenticated" });
    }

    const owner = await UserModel.findById(userId);
    if (!owner) {
      console.log(`[updateOwnerOrderStatus] Owner not found: userId=${userId}`);
      return res.status(403).json({ ok: false, error: "owner profile incomplete" });
    }

    // Only these four statuses are valid, and they must go in order
    const { status } = req.body as { status?: string };
    const ORDER_STATUSES = ["Placed", "Preparing", "Ready", "Completed"];

    if (!status || !ORDER_STATUSES.includes(status)) {
      console.log(`[updateOwnerOrderStatus] Invalid status: "${status}"`);
      return res.status(400).json({ ok: false, error: "invalid status" });
    }

    // Collect all restaurant IDs this owner controls (same logic as listOwnerOrders)
    const ownedRestaurants = await RestaurantModel.find({ ownerId: owner._id }, "restaurantId");
    const restaurantIds = new Set(ownedRestaurants.map((r) => r.restaurantId));
    if (owner.restaurantId) restaurantIds.add(owner.restaurantId);

    const ownerDeals = await DealModel.find(
      { restaurantId: { $in: [...restaurantIds] } },
      "_id"
    );
    const dealIds = ownerDeals.map((d) => d._id);

    // Make sure this order actually belongs to one of the owner's deals
    const order = await OrderModel.findOne({
      _id: req.params.id,
      "items.dealId": { $in: dealIds },
    });

    if (!order) {
      console.log(`[updateOwnerOrderStatus] Order not found or not owned: orderId=${req.params.id}`);
      return res.status(404).json({ ok: false, error: "order not found" });
    }

    // Enforce sequential transitions only: Placed→Preparing→Ready→Completed
    // Skipping steps or going backwards returns a 409 Conflict
    const currentIdx = ORDER_STATUSES.indexOf(order.status);
    const nextIdx = ORDER_STATUSES.indexOf(status);

    if (nextIdx !== currentIdx + 1) {
      console.log(`[updateOwnerOrderStatus] Illegal transition: ${order.status} → ${status}`);
      return res.status(409).json({ ok: false, error: "illegal transition" });
    }

    console.log(`[updateOwnerOrderStatus] orderId=${order._id} ${order.status} → ${status}`);

    order.status = status as "Placed" | "Preparing" | "Ready" | "Completed";
    await order.save();

    // Notify the customer that their order status has changed
    await NotificationModel.create({
      userId: order.userId,
      type: "order_status",
      message: `Your order status updated to: ${status}`,
      orderId: order._id,
    });

    console.log(`[updateOwnerOrderStatus] Customer notified: userId=${order.userId}`);

    return res.json({ ok: true, data: order });
  } catch (err) {
    console.error("[updateOwnerOrderStatus] Unexpected error:", err);
    return res.status(500).json({ ok: false, error: "server error" });
  }
}
