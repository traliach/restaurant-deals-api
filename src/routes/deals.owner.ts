import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth";
import { requireRole } from "../middleware/requireRole";
import {
  createOwnerDeal,
  deleteOwnerDeal,
  listOwnerDeals,
  submitOwnerDeal,
  updateOwnerDeal,
} from "../controllers/deals.controller";

const router = Router();

router.use(requireAuth, requireRole(["owner"]));

router.get("/deals", listOwnerDeals);
router.post("/deals", createOwnerDeal);
router.put("/deals/:id", updateOwnerDeal);
router.delete("/deals/:id", deleteOwnerDeal);
router.post("/deals/:id/submit", submitOwnerDeal);

export default router;
