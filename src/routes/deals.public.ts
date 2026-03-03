import { Router } from "express";
import { getPublicDeal, listPublicDeals } from "../controllers/deals.controller";

const router = Router();

router.get("/", listPublicDeals);
router.get("/:id", getPublicDeal);

export default router;
