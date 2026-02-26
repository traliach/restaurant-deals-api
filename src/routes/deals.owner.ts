import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth";
import { requireRole } from "../middleware/requireRole";
import { DealModel } from "../models/Deal";
import { UserModel } from "../models/User";

const router = Router();

router.use(requireAuth, requireRole(["owner"]));

router.post("/deals", async (req, res) => {
  try {
    const userId = res.locals.auth?.userId as string | undefined;
    if (!userId) {
      return res.status(401).json({ ok: false, error: "unauthenticated" });
    }

    const owner = await UserModel.findById(userId);
    if (!owner || owner.role !== "owner" || !owner.restaurantId) {
      return res.status(403).json({ ok: false, error: "owner profile incomplete" });
    }

    const { restaurantName, title, description, dealType, discountType, value, price, imageUrl, tags, startAt, endAt } =
      req.body as {
        restaurantName?: string;
        title?: string;
        description?: string;
        dealType?: "Lunch" | "Carryout" | "Delivery" | "Other";
        discountType?: "percent" | "amount" | "bogo" | "other";
        value?: number;
        price?: number;
        imageUrl?: string;
        tags?: string[];
        startAt?: string;
        endAt?: string;
      };

    if (!restaurantName || !title || !description || !dealType || !discountType) {
      return res.status(400).json({ ok: false, error: "missing required fields" });
    }

    const created = await DealModel.create({
      restaurantId: owner.restaurantId,
      restaurantName,
      title,
      description,
      dealType,
      discountType,
      value,
      price,
      imageUrl,
      tags,
      startAt: startAt ? new Date(startAt) : undefined,
      endAt: endAt ? new Date(endAt) : undefined,
      status: "DRAFT",
      createdByUserId: owner._id,
    });

    return res.status(201).json({ ok: true, data: created });
  } catch {
    return res.status(500).json({ ok: false, error: "server error" });
  }
});

router.put("/deals/:id", (_req, res) => {
  return res.status(501).json({ ok: false, error: "Not implemented" });
});

router.delete("/deals/:id", (_req, res) => {
  return res.status(501).json({ ok: false, error: "Not implemented" });
});

router.post("/deals/:id/submit", (_req, res) => {
  return res.status(501).json({ ok: false, error: "Not implemented" });
});

router.get("/deals", async (req, res) => {
  try {
    const userId = res.locals.auth?.userId as string | undefined;
    if (!userId) {
      return res.status(401).json({ ok: false, error: "unauthenticated" });
    }

    const owner = await UserModel.findById(userId);
    if (!owner || owner.role !== "owner" || !owner.restaurantId) {
      return res.status(403).json({ ok: false, error: "owner profile incomplete" });
    }

    const status = req.query.status;
    const filter: {
      restaurantId: string;
      status?: "DRAFT" | "SUBMITTED" | "PUBLISHED" | "REJECTED";
    } = { restaurantId: owner.restaurantId };

    if (
      typeof status === "string" &&
      ["DRAFT", "SUBMITTED", "PUBLISHED", "REJECTED"].includes(status)
    ) {
      filter.status = status as "DRAFT" | "SUBMITTED" | "PUBLISHED" | "REJECTED";
    }

    const items = await DealModel.find(filter).sort({ createdAt: -1 });
    return res.json({ ok: true, data: items });
  } catch {
    return res.status(500).json({ ok: false, error: "server error" });
  }
});

export default router;
