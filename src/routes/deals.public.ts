import { Router } from "express";
import { Deal, DealModel } from "../models/Deal";

const router = Router();

// Published deals only.
router.get("/", async (req, res) => {
  try {
    // Paginate results.
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 10));
    const skip = (page - 1) * limit;

    // Optional search/filter/sort.
    const filter: {
      status: Deal["status"];
      dealType?: Deal["dealType"];
      restaurantCity?: string;
      $or?: { title?: RegExp; description?: RegExp; restaurantName?: RegExp }[];
      price?: { $gte?: number; $lte?: number };
      value?: { $gte?: number; $lte?: number };
    } = { status: "PUBLISHED" };
    const { dealType, city, q, minPrice, maxPrice, minValue, maxValue, sort } = req.query;

    if (typeof city === "string" && city.trim()) {
      filter.restaurantCity = city.trim();
    }

    if (
      typeof dealType === "string" &&
      ["Lunch", "Carryout", "Delivery", "Other"].includes(dealType)
    ) {
      filter.dealType = dealType as Deal["dealType"];
    }
    if (typeof q === "string" && q.trim()) {
      const search = new RegExp(q.trim(), "i");
      filter.$or = [{ title: search }, { description: search }, { restaurantName: search }];
    }
    if (minPrice || maxPrice) {
      filter.price = {};
      if (minPrice) filter.price.$gte = Number(minPrice);
      if (maxPrice) filter.price.$lte = Number(maxPrice);
    }
    if (minValue || maxValue) {
      filter.value = {};
      if (minValue) filter.value.$gte = Number(minValue);
      if (maxValue) filter.value.$lte = Number(maxValue);
    }

    // Object format is safer than array-of-tuples for compound sorts in Mongoose.
    const sortQuery =
      String(sort) === "value"
        ? { value: -1 as const, createdAt: -1 as const }
        : { createdAt: -1 as const };

    const [items, total] = await Promise.all([
      DealModel.find(filter).sort(sortQuery).skip(skip).limit(limit),
      DealModel.countDocuments(filter),
    ]);

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
  } catch {
    return res.status(500).json({ ok: false, error: "server error" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const deal = await DealModel.findOne({ _id: req.params.id, status: "PUBLISHED" });
    if (!deal) {
      return res.status(404).json({ ok: false, error: "deal not found" });
    }

    return res.json({ ok: true, data: deal });
  } catch {
    return res.status(404).json({ ok: false, error: "deal not found" });
  }
});

export default router;
