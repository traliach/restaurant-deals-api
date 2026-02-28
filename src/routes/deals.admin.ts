import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth";
import { requireRole } from "../middleware/requireRole";
import { DealModel } from "../models/Deal";
import { NotificationModel } from "../models/Notification";

const router = Router();

router.use(requireAuth, requireRole(["admin"]));

// SUBMITTED queue only.
router.get("/deals/submitted", async (_req, res) => {
  try {
    const items = await DealModel.find({ status: "SUBMITTED" }).sort({ createdAt: -1 });
    return res.json({ ok: true, data: items });
  } catch {
    return res.status(500).json({ ok: false, error: "server error" });
  }
});

// SUBMITTED → PUBLISHED.
router.post("/deals/:id/approve", async (req, res) => {
  try {
    const deal = await DealModel.findById(req.params.id);
    if (!deal) {
      return res.status(404).json({ ok: false, error: "deal not found" });
    }

    if (deal.status !== "SUBMITTED") {
      return res.status(409).json({ ok: false, error: "illegal transition" });
    }

    deal.status = "PUBLISHED";
    deal.rejectionReason = undefined;
    await deal.save();

    // Notify the owner their deal went live.
    await NotificationModel.create({
      userId: deal.createdByUserId,
      type: "deal_approved",
      message: `Your deal "${deal.title}" was approved and is now live.`,
      dealId: deal._id,
    });

    return res.json({ ok: true, data: deal });
  } catch {
    return res.status(500).json({ ok: false, error: "server error" });
  }
});

// SUBMITTED → REJECTED + reason.
router.post("/deals/:id/reject", async (req, res) => {
  try {
    const { reason } = req.body as { reason?: string };
    if (!reason || !reason.trim()) {
      return res.status(400).json({ ok: false, error: "reason is required" });
    }

    const deal = await DealModel.findById(req.params.id);
    if (!deal) {
      return res.status(404).json({ ok: false, error: "deal not found" });
    }

    if (deal.status !== "SUBMITTED") {
      return res.status(409).json({ ok: false, error: "illegal transition" });
    }

    deal.status = "REJECTED";
    deal.rejectionReason = reason.trim();
    await deal.save();

    // Notify the owner their deal was rejected.
    await NotificationModel.create({
      userId: deal.createdByUserId,
      type: "deal_rejected",
      message: `Your deal "${deal.title}" was rejected. Reason: ${reason.trim()}`,
      dealId: deal._id,
    });

    return res.json({ ok: true, data: deal });
  } catch {
    return res.status(500).json({ ok: false, error: "server error" });
  }
});

export default router;
