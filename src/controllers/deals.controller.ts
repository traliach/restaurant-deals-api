/**
 * deals.controller.ts
 *
 * Handles all deal-related routes split into two groups:
 *
 * PUBLIC (no login required):
 *  - listPublicDeals : paginated, filterable feed of published deals
 *  - getPublicDeal   : single deal detail page
 *
 * OWNER (requires login + role="owner"):
 *  - listOwnerDeals  : all deals the owner created (draft, submitted, published, rejected)
 *  - createOwnerDeal : create a new deal draft
 *  - updateOwnerDeal : edit a draft or rejected deal
 *  - deleteOwnerDeal : delete a draft or rejected deal
 *  - submitOwnerDeal : submit a deal for admin review
 *
 * Status flow: DRAFT → SUBMITTED → PUBLISHED or REJECTED
 * Only PUBLISHED deals appear in the public feed and can be ordered.
 */

import { NextFunction, Request, Response } from "express";
import { DealModel } from "../models/Deal";
import { NotificationModel } from "../models/Notification";
import { RestaurantModel } from "../models/Restaurant";
import { UserModel } from "../models/User";

// ─── Public ───────────────────────────────────────────────────────────────────

export async function listPublicDeals(req: Request, res: Response, next: NextFunction) {
  try {
    // Pagination: default page=1, limit=10, max limit=50
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 10));
    const skip = (page - 1) * limit;

    // Start with only published deals
    const filter: Record<string, unknown> = { status: "PUBLISHED" };

    // Deals that have an expiry date must not be in the past
    const expiryFilter = {
      $or: [
        { endAt: { $exists: false } },
        { endAt: null },
        { endAt: { $gte: new Date() } },
      ],
    };

    // Pull optional query params for filtering
    const { dealType, city, source, q, minPrice, maxPrice, minValue, maxValue, sort, cuisineType, dietaryTags } =
      req.query;

    if (typeof city === "string" && city.trim()) filter.restaurantCity = city.trim();
    if (typeof source === "string" && ["seed", "yelp"].includes(source)) filter.restaurantSource = source;
    if (typeof dealType === "string" && ["Lunch", "Carryout", "Delivery", "Other"].includes(dealType))
      filter.dealType = dealType;
    if (typeof cuisineType === "string" && cuisineType.trim()) filter.cuisineType = cuisineType.trim();
    if (typeof dietaryTags === "string" && dietaryTags.trim())
      filter.dietaryTags = { $all: dietaryTags.split(",").map((t) => t.trim()).filter(Boolean) };

    // Simple text search across key deal fields (student-level, minimal logic)
    if (typeof q === "string" && q.trim()) {
      const qValue = q.trim();
      const search = new RegExp(qValue, "i");
      const searchOr: Record<string, unknown>[] = [
        { title: search },
        { description: search },
        { restaurantName: search },
        { cuisineType: search },
        { dealType: search },
        { tags: search },
      ];

      filter.$and = [expiryFilter, { $or: searchOr }];
    } else {
      Object.assign(filter, expiryFilter);
    }

    // Price and value range filters
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

    // Sort by discount value or by newest
    const sortQuery: Record<string, 1 | -1> =
      String(sort) === "value" ? { value: -1, createdAt: -1 } : { createdAt: -1 };

    // Run both queries in parallel with Promise.all for better performance
    const [items, total] = await Promise.all([
      DealModel.find(filter).sort(sortQuery).skip(skip).limit(limit),
      DealModel.countDocuments(filter),
    ]);

    console.log(`[listPublicDeals] page=${page} limit=${limit} total=${total} returned=${items.length} filters=${JSON.stringify({ city, source, dealType, q })}`);

    return res.json({
      ok: true,
      data: {
        items,
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    });
  } catch (err) {
    console.error("[listPublicDeals] Unexpected error:", err);
    return next(err);
  }
}

export async function getPublicDeal(req: Request, res: Response, next: NextFunction) {
  try {
    // Only return the deal if it is published — never expose drafts to the public
    const deal = await DealModel.findOne({ _id: req.params.id, status: "PUBLISHED" });

    if (!deal) {
      console.log(`[getPublicDeal] Not found or not published: dealId=${req.params.id}`);
      return res.status(404).json({ ok: false, error: "deal not found" });
    }

    console.log(`[getPublicDeal] dealId=${deal._id} title="${deal.title}"`);
    return res.json({ ok: true, data: deal });
  } catch (err) {
    console.error("[getPublicDeal] Unexpected error:", err);
    return next(err);
  }
}

// ─── Owner ────────────────────────────────────────────────────────────────────

export async function listOwnerDeals(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = res.locals.auth?.userId as string | undefined;
    if (!userId) return res.status(401).json({ ok: false, error: "unauthenticated" });

    const owner = await UserModel.findById(userId);
    if (!owner || owner.role !== "owner") {
      console.log(`[listOwnerDeals] Rejected — not an owner: userId=${userId}`);
      return res.status(403).json({ ok: false, error: "owner profile incomplete" });
    }

    // Filter by createdByUserId so the owner sees ALL their deals —
    // both seed deals (linked by ownerId at seed time) and portal-created deals
    const statusFilter = req.query.status;
    const filter: { createdByUserId: string; status?: string } = {
      createdByUserId: owner._id.toString(),
    };
    if (
      typeof statusFilter === "string" &&
      ["DRAFT", "SUBMITTED", "PUBLISHED", "REJECTED"].includes(statusFilter)
    ) {
      filter.status = statusFilter;
    }

    const items = await DealModel.find(filter).sort({ createdAt: -1 });
    console.log(`[listOwnerDeals] owner=${owner.email} found=${items.length} deals`);

    return res.json({ ok: true, data: items });
  } catch (err) {
    console.error("[listOwnerDeals] Unexpected error:", err);
    return next(err);
  }
}

export async function createOwnerDeal(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = res.locals.auth?.userId as string | undefined;
    if (!userId) return res.status(401).json({ ok: false, error: "unauthenticated" });

    const owner = await UserModel.findById(userId);
    if (!owner || owner.role !== "owner" || !owner.restaurantId) {
      console.log(`[createOwnerDeal] Rejected — incomplete owner profile: userId=${userId}`);
      return res.status(403).json({ ok: false, error: "owner profile incomplete" });
    }

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

    if (!restaurantName || !title || !description || !dealType || !discountType) {
      console.log(`[createOwnerDeal] Rejected — missing required fields`);
      return res.status(400).json({ ok: false, error: "missing required fields" });
    }

    // Look up the restaurant to auto-fill city, address, and cuisine if available
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
      status: "DRAFT",          // all new deals start as drafts
      createdByUserId: owner._id,
    });

    console.log(`[createOwnerDeal] Draft created: dealId=${created._id} title="${title}" owner=${owner.email}`);
    return res.status(201).json({ ok: true, data: created });
  } catch (err) {
    console.error("[createOwnerDeal] Unexpected error:", err);
    return next(err);
  }
}

export async function updateOwnerDeal(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = res.locals.auth?.userId as string | undefined;
    if (!userId) return res.status(401).json({ ok: false, error: "unauthenticated" });

    const owner = await UserModel.findById(userId);
    if (!owner || owner.role !== "owner") {
      return res.status(403).json({ ok: false, error: "owner profile incomplete" });
    }

    const deal = await DealModel.findById(req.params.id);

    // Verify the deal exists AND was created by this owner
    if (!deal || deal.createdByUserId.toString() !== owner._id.toString()) {
      console.log(`[updateOwnerDeal] Not found or not owned: dealId=${req.params.id} owner=${owner.email}`);
      return res.status(404).json({ ok: false, error: "deal not found" });
    }

    // Can only edit deals that are in DRAFT or REJECTED status
    // (SUBMITTED and PUBLISHED deals are locked to prevent sneaky edits)
    if (deal.status !== "DRAFT" && deal.status !== "REJECTED") {
      console.log(`[updateOwnerDeal] Illegal edit on status="${deal.status}"`);
      return res.status(409).json({ ok: false, error: "illegal transition" });
    }

    const updates = req.body as Record<string, unknown>;
    const d = deal as unknown as Record<string, unknown>;

    const fields = [
      "restaurantName", "title", "description", "dealType", "discountType",
      "value", "price", "imageUrl", "tags", "cuisineType", "dietaryTags",
    ];
    for (const f of fields) {
      if (updates[f] !== undefined) d[f] = updates[f];
    }
    if (updates.startAt !== undefined)
      deal.startAt = updates.startAt ? new Date(updates.startAt as string) : undefined;
    if (updates.endAt !== undefined)
      deal.endAt = updates.endAt ? new Date(updates.endAt as string) : undefined;

    await deal.save();
    console.log(`[updateOwnerDeal] Updated: dealId=${deal._id} title="${deal.title}"`);
    return res.json({ ok: true, data: deal });
  } catch (err) {
    console.error("[updateOwnerDeal] Unexpected error:", err);
    return next(err);
  }
}

export async function deleteOwnerDeal(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = res.locals.auth?.userId as string | undefined;
    if (!userId) return res.status(401).json({ ok: false, error: "unauthenticated" });

    const owner = await UserModel.findById(userId);
    if (!owner || owner.role !== "owner") {
      return res.status(403).json({ ok: false, error: "owner profile incomplete" });
    }

    const deal = await DealModel.findById(req.params.id);

    if (!deal || deal.createdByUserId.toString() !== owner._id.toString()) {
      console.log(`[deleteOwnerDeal] Not found or not owned: dealId=${req.params.id}`);
      return res.status(404).json({ ok: false, error: "deal not found" });
    }

    // Only DRAFT and REJECTED deals can be deleted.
    // SUBMITTED/PUBLISHED are retained for review and audit records.
    if (deal.status !== "DRAFT" && deal.status !== "REJECTED") {
      console.log(`[deleteOwnerDeal] Cannot delete deal with status="${deal.status}"`);
      return res.status(409).json({ ok: false, error: "illegal transition" });
    }

    await DealModel.deleteOne({ _id: deal._id });
    console.log(`[deleteOwnerDeal] Deleted: dealId=${deal._id} title="${deal.title}"`);
    return res.json({ ok: true, data: { deleted: true } });
  } catch (err) {
    console.error("[deleteOwnerDeal] Unexpected error:", err);
    return next(err);
  }
}

export async function submitOwnerDeal(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = res.locals.auth?.userId as string | undefined;
    if (!userId) return res.status(401).json({ ok: false, error: "unauthenticated" });

    const owner = await UserModel.findById(userId);
    if (!owner || owner.role !== "owner") {
      return res.status(403).json({ ok: false, error: "owner profile incomplete" });
    }

    const deal = await DealModel.findById(req.params.id);

    if (!deal || deal.createdByUserId.toString() !== owner._id.toString()) {
      console.log(`[submitOwnerDeal] Not found or not owned: dealId=${req.params.id}`);
      return res.status(404).json({ ok: false, error: "deal not found" });
    }

    // Can only submit from DRAFT or REJECTED (allows re-submitting after a rejection)
    if (deal.status !== "DRAFT" && deal.status !== "REJECTED") {
      console.log(`[submitOwnerDeal] Cannot submit from status="${deal.status}"`);
      return res.status(409).json({ ok: false, error: "illegal transition" });
    }

    deal.status = "SUBMITTED";
    deal.rejectionReason = undefined; // clear any previous rejection reason
    await deal.save();

    console.log(`[submitOwnerDeal] Submitted for review: dealId=${deal._id} title="${deal.title}"`);

    // Notify every admin so they can review the new submission
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
      console.log(`[submitOwnerDeal] ${admins.length} admin(s) notified`);
    }

    return res.json({ ok: true, data: deal });
  } catch (err) {
    console.error("[submitOwnerDeal] Unexpected error:", err);
    return next(err);
  }
}
