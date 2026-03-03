import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth";
import { requireRole } from "../middleware/requireRole";
import {
  approveDeal,
  deleteUser,
  getAllDeals,
  getAllUsers,
  getBotInteractions,
  getStats,
  getSubmittedDeals,
  rejectDeal,
} from "../controllers/admin.controller";

const router = Router();

router.use(requireAuth, requireRole(["admin"]));

router.get("/stats", getStats);
router.get("/users", getAllUsers);
router.delete("/users/:id", deleteUser);
router.get("/deals", getAllDeals);
router.get("/deals/submitted", getSubmittedDeals);
router.post("/deals/:id/approve", approveDeal);
router.post("/deals/:id/reject", rejectDeal);
router.get("/bot-interactions", getBotInteractions);

export default router;
