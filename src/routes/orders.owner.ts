import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth";
import { requireRole } from "../middleware/requireRole";
import { OrderModel } from "../models/Order";
import { UserModel } from "../models/User";

const router = Router();

router.use(requireAuth, requireRole(["owner"]));

const VALID_STATUSES = ["Placed", "Preparing", "Ready", "Completed"] as const;
type OrderStatus = (typeof VALID_STATUSES)[number];

// Owner: list orders for their restaurant.
router.get("/orders", async (req, res) => {
  try {
    const userId = res.locals.auth?.userId as string | undefined;
    const owner = await UserModel.findById(userId);
    if (!owner?.restaurantId) {
      return res.status(403).json({ ok: false, error: "owner profile incomplete" });
    }

    const orders = await OrderModel.find({
      "items.restaurantId": owner.restaurantId,
    }).sort({ createdAt: -1 });

    return res.json({ ok: true, data: orders });
  } catch {
    return res.status(500).json({ ok: false, error: "server error" });
  }
});

// Owner: update order status (state machine).
router.put("/orders/:id/status", async (req, res) => {
  try {
    const userId = res.locals.auth?.userId as string | undefined;
    const owner = await UserModel.findById(userId);
    if (!owner?.restaurantId) {
      return res.status(403).json({ ok: false, error: "owner profile incomplete" });
    }

    const { status } = req.body as { status?: string };
    if (!status || !VALID_STATUSES.includes(status as OrderStatus)) {
      return res.status(400).json({ ok: false, error: "invalid status" });
    }

    const order = await OrderModel.findOne({
      _id: req.params.id,
      "items.restaurantId": owner.restaurantId,
    });
    if (!order) {
      return res.status(404).json({ ok: false, error: "order not found" });
    }

    // Forward-only transitions.
    const currentIdx = VALID_STATUSES.indexOf(order.status as OrderStatus);
    const nextIdx = VALID_STATUSES.indexOf(status as OrderStatus);
    if (nextIdx <= currentIdx) {
      return res.status(409).json({ ok: false, error: "illegal transition" });
    }

    order.status = status as OrderStatus;
    await order.save();

    return res.json({ ok: true, data: order });
  } catch {
    return res.status(500).json({ ok: false, error: "server error" });
  }
});

export default router;
