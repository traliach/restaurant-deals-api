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

router.put("/deals/:id", async (req, res) => {
  try {
    const userId = res.locals.auth?.userId as string | undefined;
    if (!userId) {
      return res.status(401).json({ ok: false, error: "unauthenticated" });
    }

    const owner = await UserModel.findById(userId);
    if (!owner || owner.role !== "owner" || !owner.restaurantId) {
      return res.status(403).json({ ok: false, error: "owner profile incomplete" });
    }

    const deal = await DealModel.findById(req.params.id);
    if (!deal || deal.restaurantId !== owner.restaurantId) {
      return res.status(404).json({ ok: false, error: "deal not found" });
    }

    if (deal.status !== "DRAFT" && deal.status !== "REJECTED") {
      return res.status(409).json({ ok: false, error: "illegal transition" });
    }

    const updates = req.body as {
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

    if (updates.restaurantName !== undefined) deal.restaurantName = updates.restaurantName;
    if (updates.title !== undefined) deal.title = updates.title;
    if (updates.description !== undefined) deal.description = updates.description;
    if (updates.dealType !== undefined) deal.dealType = updates.dealType;
    if (updates.discountType !== undefined) deal.discountType = updates.discountType;
    if (updates.value !== undefined) deal.value = updates.value;
    if (updates.price !== undefined) deal.price = updates.price;
    if (updates.imageUrl !== undefined) deal.imageUrl = updates.imageUrl;
    if (updates.tags !== undefined) deal.tags = updates.tags;
    if (updates.startAt !== undefined) deal.startAt = updates.startAt ? new Date(updates.startAt) : undefined;
    if (updates.endAt !== undefined) deal.endAt = updates.endAt ? new Date(updates.endAt) : undefined;

    await deal.save();
    return res.json({ ok: true, data: deal });
  } catch {
    return res.status(500).json({ ok: false, error: "server error" });
  }
});

router.delete("/deals/:id", async (req, res) => {
  try {
    const userId = res.locals.auth?.userId as string | undefined;
    if (!userId) {
      return res.status(401).json({ ok: false, error: "unauthenticated" });
    }

    const owner = await UserModel.findById(userId);
    if (!owner || owner.role !== "owner" || !owner.restaurantId) {
      return res.status(403).json({ ok: false, error: "owner profile incomplete" });
    }

    const deal = await DealModel.findById(req.params.id);
    if (!deal || deal.restaurantId !== owner.restaurantId) {
      return res.status(404).json({ ok: false, error: "deal not found" });
    }

    if (deal.status !== "DRAFT") {
      return res.status(409).json({ ok: false, error: "illegal transition" });
    }

    await DealModel.deleteOne({ _id: deal._id });
    return res.json({ ok: true, data: { deleted: true } });
  } catch {
    return res.status(500).json({ ok: false, error: "server error" });
  }
});

router.post("/deals/:id/submit", async (req, res) => {
  try {
    const userId = res.locals.auth?.userId as string | undefined;
    if (!userId) {
      return res.status(401).json({ ok: false, error: "unauthenticated" });
    }

    const owner = await UserModel.findById(userId);
    if (!owner || owner.role !== "owner" || !owner.restaurantId) {
      return res.status(403).json({ ok: false, error: "owner profile incomplete" });
    }

    const deal = await DealModel.findById(req.params.id);
    if (!deal || deal.restaurantId !== owner.restaurantId) {
      return res.status(404).json({ ok: false, error: "deal not found" });
    }

    if (deal.status !== "DRAFT" && deal.status !== "REJECTED") {
      return res.status(409).json({ ok: false, error: "illegal transition" });
    }

    deal.status = "SUBMITTED";
    deal.rejectionReason = undefined;
    await deal.save();

    return res.json({ ok: true, data: deal });
  } catch {
    return res.status(500).json({ ok: false, error: "server error" });
  }
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
