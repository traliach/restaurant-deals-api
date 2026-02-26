import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth";
import { requireRole } from "../middleware/requireRole";
import { DealModel } from "../models/Deal";

const router = Router();

router.use(requireAuth, requireRole(["admin"]));

router.get("/deals/submitted", async (_req, res) => {
  try {
    const items = await DealModel.find({ status: "SUBMITTED" }).sort({ createdAt: -1 });
    return res.json({ ok: true, data: items });
  } catch {
    return res.status(500).json({ ok: false, error: "server error" });
  }
});

router.post("/deals/:id/approve", (_req, res) => {
  return res.status(501).json({ ok: false, error: "Not implemented" });
});

router.post("/deals/:id/reject", (_req, res) => {
  return res.status(501).json({ ok: false, error: "Not implemented" });
});

export default router;
