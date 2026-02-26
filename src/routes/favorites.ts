import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth";

const router = Router();

router.use(requireAuth);

router.get("/", (_req, res) => {
  return res.status(501).json({ ok: false, error: "Not implemented" });
});

router.post("/:dealId", (_req, res) => {
  return res.status(501).json({ ok: false, error: "Not implemented" });
});

router.delete("/:dealId", (_req, res) => {
  return res.status(501).json({ ok: false, error: "Not implemented" });
});

export default router;
