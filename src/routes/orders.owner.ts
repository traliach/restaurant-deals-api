import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth";
import { requireRole } from "../middleware/requireRole";
import { listOwnerOrders, updateOwnerOrderStatus } from "../controllers/orders.controller";

const router = Router();

router.use(requireAuth, requireRole(["owner"]));

router.get("/orders", listOwnerOrders);
router.put("/orders/:id/status", updateOwnerOrderStatus);

export default router;
