import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth";
import { DealModel } from "../models/Deal";
import { OrderModel } from "../models/Order";

const router = Router();

router.use(requireAuth);

// Customer: create order (checkout).
router.post("/", async (req, res) => {
  try {
    const userId = res.locals.auth?.userId as string | undefined;
    if (!userId) {
      return res.status(401).json({ ok: false, error: "unauthenticated" });
    }

    const { items, stripePaymentIntentId } = req.body as {
      items?: { dealId: string; qty: number }[];
      stripePaymentIntentId?: string;
    };

    if (!items || items.length === 0) {
      return res.status(400).json({ ok: false, error: "items required" });
    }

    // Resolve each deal and build immutable snapshots.
    let total = 0;
    const resolvedItems = [];

    for (const item of items) {
      if (!item.dealId || !item.qty || item.qty < 1) {
        return res.status(400).json({ ok: false, error: "invalid item" });
      }

      const deal = await DealModel.findById(item.dealId);
      if (!deal || deal.status !== "PUBLISHED") {
        return res.status(400).json({
          ok: false,
          error: `deal ${item.dealId} not available`,
        });
      }

      const price = deal.price ?? 0;
      total += price * item.qty;

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

    const order = await OrderModel.create({
      userId,
      items: resolvedItems,
      total,
      status: "Placed",
      stripePaymentIntentId: stripePaymentIntentId ?? undefined,
      paidAt: stripePaymentIntentId ? new Date() : undefined,
    });

    return res.status(201).json({ ok: true, data: order });
  } catch {
    return res.status(500).json({ ok: false, error: "server error" });
  }
});

// Customer: list their own orders.
router.get("/", async (req, res) => {
  try {
    const userId = res.locals.auth?.userId as string | undefined;
    if (!userId) {
      return res.status(401).json({ ok: false, error: "unauthenticated" });
    }

    const orders = await OrderModel.find({ userId }).sort({ createdAt: -1 });
    return res.json({ ok: true, data: orders });
  } catch {
    return res.status(500).json({ ok: false, error: "server error" });
  }
});

// Customer: get single order.
router.get("/:id", async (req, res) => {
  try {
    const userId = res.locals.auth?.userId as string | undefined;
    if (!userId) {
      return res.status(401).json({ ok: false, error: "unauthenticated" });
    }

    const order = await OrderModel.findOne({ _id: req.params.id, userId });
    if (!order) {
      return res.status(404).json({ ok: false, error: "order not found" });
    }
    return res.json({ ok: true, data: order });
  } catch {
    return res.status(500).json({ ok: false, error: "server error" });
  }
});

export default router;
