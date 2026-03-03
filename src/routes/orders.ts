import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth";
import { createOrder, getOrder, listOrders } from "../controllers/orders.controller";

const router = Router();

router.use(requireAuth);

router.post("/", createOrder);
router.get("/", listOrders);
router.get("/:id", getOrder);

export default router;
