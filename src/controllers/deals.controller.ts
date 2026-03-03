import { Request, Response } from "express";
import { DealModel } from "../models/Deal";
import { NotificationModel } from "../models/Notification";
import { RestaurantModel } from "../models/Restaurant";
import { UserModel } from "../models/User";

// ─── Public ───────────────────────────────────────────────────────────────────

export async function listPublicDeals(req: Request, res: Response) {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 10));
    const skip = (page - 1) * limit;

    const filter: Record<string, unknown> = { status: "PUBLISHED" };
    const { dealType, city, source, q, minPrice, maxPrice, minValue, maxValue, sort, cuisineType, dietaryTags } =
      req.query;

    const expiryFilter = { $or: [{ endAt: { $exists: false } }, { endAt: null }, { endAt: { $gte: new Date() } }] };

    if (typeof city === "string" && city.trim()) filter.restaurantCity = city.trim();
    if (typeof source === "string" && ["seed", "yelp"].includes(source)) filter.restaurantSource = source;
    if (typeof dealType === "string" && ["Lunch", "Carryout", "Delivery", "Other"].includes(dealType))
      filter.dealType = dealType;
    if (typeof cuisineType === "string" && cuisineType.trim()) filter.cuisineType = cuisineType.trim();
    if (typeof dietaryTags === "string" && dietaryTags.trim())
      filter.dietaryTags = { $all: dietaryTags.split(",").map((t) => t.trim()).filter(Boolean) };

    if (typeof q === "string" && q.trim()) {
      const search = new RegExp(q.trim(), "i");
      filter.$and = [
        expiryFilter,
        { $or: [{ title: search }, { description: search }, { restaurantName: search }] },
      ];
    } else {
      Object.assign(filter, expiryFilter);
    }

    if (minPrice || maxPrice) {
      filter.price = {} as Record<string, number>;
      if (minPrice) (filter.price as Record<string, number>).$gte = Number(minPrice);
      if (maxPrice) (filter.price as Record<string, number>).$lte = Number(maxPrice);
    }
    if (minValue || maxValue) {
      filter.value = {} as Record<string, number>;
      if (minValue) (filter.value as Record<string, number>).$gte = Number(minValue);
      if (maxValue) (filter.value as Record<string, number>).$lte = Number(maxValue);
    }

    const sortQuery: Record<string, 1 | -1> =
      String(sort) === "value" ? { value: -1, createdAt: -1 } : { createdAt: -1 };

    const [items, total] = await Promise.all([
      DealModel.find(filter).sort(sortQuery).skip(skip).limit(limit),
      DealModel.countDocuments(filter),
    ]);

    return res.json({
      ok: true,
      data: { items, page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    });
  } catch {
    return res.status(500).json({ ok: false, error: "server error" });
  }
}

export async function getPublicDeal(req: Request, res: Response) {
  try {
    const deal = await DealModel.findOne({ _id: req.params.id, status: "PUBLISHED" });
    if (!deal) return res.status(404).json({ ok: false, error: "deal not found" });
    return res.json({ ok: true, data: deal });
  } catch {
    return res.status(404).json({ ok: false, error: "deal not found" });
  }
}

// ─── Owner ────────────────────────────────────────────────────────────────────

export async function listOwnerDeals(req: Request, res: Response) {
  try {
    const userId = res.locals.auth?.userId as string | undefined;
    if (!userId) return res.status(401).json({ ok: false, error: "unauthenticated" });

    const owner = await UserModel.findById(userId);
    if (!owner || owner.role !== "owner" || !owner.restaurantId)
      return res.status(403).json({ ok: false, error: "owner profile incomplete" });

    const status = req.query.status;
    const filter: { restaurantId: string; status?: string } = { restaurantId: owner.restaurantId };
    if (typeof status === "string" && ["DRAFT", "SUBMITTED", "PUBLISHED", "REJECTED"].includes(status))
      filter.status = status;

    const items = await DealModel.find(filter).sort({ createdAt: -1 });
    return res.json({ ok: true, data: items });
  } catch {
    return res.status(500).json({ ok: false, error: "server error" });
  }
}

export async function createOwnerDeal(req: Request, res: Response) {
  try {
    const userId = res.locals.auth?.userId as string | undefined;
    if (!userId) return res.status(401).json({ ok: false, error: "unauthenticated" });

    const owner = await UserModel.findById(userId);
    if (!owner || owner.role !== "owner" || !owner.restaurantId)
      return res.status(403).json({ ok: false, error: "owner profile incomplete" });

    const {
      restaurantName, title, description, dealType, discountType,
      value, price, imageUrl, tags, startAt, endAt, cuisineType, dietaryTags,
    } = req.body as {
      restaurantName?: string; title?: string; description?: string;
      dealType?: "Lunch" | "Carryout" | "Delivery" | "Other";
      discountType?: "percent" | "amount" | "bogo" | "other";
      value?: number; price?: number; imageUrl?: string; tags?: string[];
      startAt?: string; endAt?: string; cuisineType?: string; dietaryTags?: string[];
    };

    if (!restaurantName || !title || !description || !dealType || !discountType)
      return res.status(400).json({ ok: false, error: "missing required fields" });

    const restaurant = await RestaurantModel.findOne({ restaurantId: owner.restaurantId });

    const created = await DealModel.create({
      restaurantId: owner.restaurantId,
      restaurantName,
      restaurantAddress: restaurant?.address,
      restaurantCity: restaurant?.city,
      cuisineType: cuisineType ?? restaurant?.cuisineType,
      title, description, dealType, discountType, value, price, imageUrl,
      tags, dietaryTags: dietaryTags ?? [],
      startAt: startAt ? new Date(startAt) : undefined,
      endAt: endAt ? new Date(endAt) : undefined,
      status: "DRAFT",
      createdByUserId: owner._id,
    });

    return res.status(201).json({ ok: true, data: created });
  } catch {
    return res.status(500).json({ ok: false, error: "server error" });
  }
}

export async function updateOwnerDeal(req: Request, res: Response) {
  try {
    const userId = res.locals.auth?.userId as string | undefined;
    if (!userId) return res.status(401).json({ ok: false, error: "unauthenticated" });

    const owner = await UserModel.findById(userId);
    if (!owner || owner.role !== "owner" || !owner.restaurantId)
      return res.status(403).json({ ok: false, error: "owner profile incomplete" });

    const deal = await DealModel.findById(req.params.id);
    if (!deal || deal.restaurantId !== owner.restaurantId)
      return res.status(404).json({ ok: false, error: "deal not found" });

    if (deal.status !== "DRAFT" && deal.status !== "REJECTED")
      return res.status(409).json({ ok: false, error: "illegal transition" });

    const updates = req.body as Record<string, unknown>;
    const d = deal as unknown as Record<string, unknown>;

    const fields = ["restaurantName", "title", "description", "dealType", "discountType",
      "value", "price", "imageUrl", "tags", "cuisineType", "dietaryTags"];
    for (const f of fields) {
      if (updates[f] !== undefined) d[f] = updates[f];
    }
    if (updates.startAt !== undefined) deal.startAt = updates.startAt ? new Date(updates.startAt as string) : undefined;
    if (updates.endAt !== undefined) deal.endAt = updates.endAt ? new Date(updates.endAt as string) : undefined;

    await deal.save();
    return res.json({ ok: true, data: deal });
  } catch {
    return res.status(500).json({ ok: false, error: "server error" });
  }
}

export async function deleteOwnerDeal(req: Request, res: Response) {
  try {
    const userId = res.locals.auth?.userId as string | undefined;
    if (!userId) return res.status(401).json({ ok: false, error: "unauthenticated" });

    const owner = await UserModel.findById(userId);
    if (!owner || owner.role !== "owner" || !owner.restaurantId)
      return res.status(403).json({ ok: false, error: "owner profile incomplete" });

    const deal = await DealModel.findById(req.params.id);
    if (!deal || deal.restaurantId !== owner.restaurantId)
      return res.status(404).json({ ok: false, error: "deal not found" });

    if (deal.status !== "DRAFT") return res.status(409).json({ ok: false, error: "illegal transition" });

    await DealModel.deleteOne({ _id: deal._id });
    return res.json({ ok: true, data: { deleted: true } });
  } catch {
    return res.status(500).json({ ok: false, error: "server error" });
  }
}

export async function submitOwnerDeal(req: Request, res: Response) {
  try {
    const userId = res.locals.auth?.userId as string | undefined;
    if (!userId) return res.status(401).json({ ok: false, error: "unauthenticated" });

    const owner = await UserModel.findById(userId);
    if (!owner || owner.role !== "owner" || !owner.restaurantId)
      return res.status(403).json({ ok: false, error: "owner profile incomplete" });

    const deal = await DealModel.findById(req.params.id);
    if (!deal || deal.restaurantId !== owner.restaurantId)
      return res.status(404).json({ ok: false, error: "deal not found" });

    if (deal.status !== "DRAFT" && deal.status !== "REJECTED")
      return res.status(409).json({ ok: false, error: "illegal transition" });

    deal.status = "SUBMITTED";
    deal.rejectionReason = undefined;
    await deal.save();

    const admins = await UserModel.find({ role: "admin" }, "_id");
    if (admins.length > 0) {
      await NotificationModel.insertMany(
        admins.map((a) => ({
          userId: a._id,
          type: "deal_submitted",
          message: `New deal submitted for review: "${deal.title}" by ${deal.restaurantName}`,
          dealId: deal._id,
        }))
      );
    }

    return res.json({ ok: true, data: deal });
  } catch {
    return res.status(500).json({ ok: false, error: "server error" });
  }
}
