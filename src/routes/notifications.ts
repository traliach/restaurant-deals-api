import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth";
import { NotificationModel } from "../models/Notification";

const router = Router();

router.use(requireAuth);

// List user notifications, unread first.
router.get("/", async (req, res) => {
  try {
    const userId = res.locals.auth?.userId as string | undefined;
    if (!userId) {
      return res.status(401).json({ ok: false, error: "unauthenticated" });
    }

    const notifications = await NotificationModel.find({ userId })
      .sort({ read: 1, createdAt: -1 })
      .limit(50);

    return res.json({ ok: true, data: notifications });
  } catch {
    return res.status(500).json({ ok: false, error: "server error" });
  }
});

// Mark a single notification as read.
router.patch("/:id/read", async (req, res) => {
  try {
    const userId = res.locals.auth?.userId as string | undefined;
    if (!userId) {
      return res.status(401).json({ ok: false, error: "unauthenticated" });
    }

    const notification = await NotificationModel.findOneAndUpdate(
      { _id: req.params.id, userId },
      { read: true },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({ ok: false, error: "notification not found" });
    }

    return res.json({ ok: true, data: notification });
  } catch {
    return res.status(500).json({ ok: false, error: "server error" });
  }
});

// Mark all as read at once.
router.patch("/read-all", async (req, res) => {
  try {
    const userId = res.locals.auth?.userId as string | undefined;
    if (!userId) {
      return res.status(401).json({ ok: false, error: "unauthenticated" });
    }

    await NotificationModel.updateMany({ userId, read: false }, { read: true });
    return res.json({ ok: true, data: { cleared: true } });
  } catch {
    return res.status(500).json({ ok: false, error: "server error" });
  }
});

export default router;
