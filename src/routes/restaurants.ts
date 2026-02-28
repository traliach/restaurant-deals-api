import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth";
import { requireRole } from "../middleware/requireRole";
import { RestaurantModel } from "../models/Restaurant";
import { UserModel } from "../models/User";

const router = Router();

// Public: look up a restaurant by its string id.
router.get("/:restaurantId", async (req, res) => {
  try {
    const restaurant = await RestaurantModel.findOne({
      restaurantId: req.params.restaurantId,
    });
    if (!restaurant) {
      return res.status(404).json({ ok: false, error: "restaurant not found" });
    }
    return res.json({ ok: true, data: restaurant });
  } catch {
    return res.status(500).json({ ok: false, error: "server error" });
  }
});

// Owner: get their own restaurant profile.
router.get(
  "/owner/me",
  requireAuth,
  requireRole(["owner"]),
  async (req, res) => {
    try {
      const userId = res.locals.auth?.userId as string | undefined;
      const owner = await UserModel.findById(userId);
      if (!owner?.restaurantId) {
        return res.status(404).json({ ok: false, error: "no restaurant on profile" });
      }
      const restaurant = await RestaurantModel.findOne({
        restaurantId: owner.restaurantId,
      });
      if (!restaurant) {
        return res.status(404).json({ ok: false, error: "restaurant not found" });
      }
      return res.json({ ok: true, data: restaurant });
    } catch {
      return res.status(500).json({ ok: false, error: "server error" });
    }
  }
);

// Owner: create restaurant profile (one per owner).
router.post(
  "/owner",
  requireAuth,
  requireRole(["owner"]),
  async (req, res) => {
    try {
      const userId = res.locals.auth?.userId as string | undefined;
      const owner = await UserModel.findById(userId);
      if (!owner?.restaurantId) {
        return res.status(403).json({ ok: false, error: "owner profile incomplete" });
      }

      const existing = await RestaurantModel.findOne({
        restaurantId: owner.restaurantId,
      });
      if (existing) {
        return res.status(409).json({ ok: false, error: "restaurant already exists" });
      }

      const { name, description, address, phone, imageUrl, foursquareId } =
        req.body as {
          name?: string;
          description?: string;
          address?: string;
          phone?: string;
          imageUrl?: string;
          foursquareId?: string;
        };

      if (!name) {
        return res.status(400).json({ ok: false, error: "name is required" });
      }

      const restaurant = await RestaurantModel.create({
        restaurantId: owner.restaurantId,
        name,
        ownerId: owner._id,
        description,
        address,
        phone,
        imageUrl,
        foursquareId,
      });

      return res.status(201).json({ ok: true, data: restaurant });
    } catch {
      return res.status(500).json({ ok: false, error: "server error" });
    }
  }
);

// Owner: update their restaurant profile.
router.put(
  "/owner",
  requireAuth,
  requireRole(["owner"]),
  async (req, res) => {
    try {
      const userId = res.locals.auth?.userId as string | undefined;
      const owner = await UserModel.findById(userId);
      if (!owner?.restaurantId) {
        return res.status(403).json({ ok: false, error: "owner profile incomplete" });
      }

      const restaurant = await RestaurantModel.findOne({
        restaurantId: owner.restaurantId,
      });
      if (!restaurant) {
        return res.status(404).json({ ok: false, error: "restaurant not found" });
      }

      const { name, description, address, phone, imageUrl, foursquareId } =
        req.body as {
          name?: string;
          description?: string;
          address?: string;
          phone?: string;
          imageUrl?: string;
          foursquareId?: string;
        };

      if (name !== undefined) restaurant.name = name;
      if (description !== undefined) restaurant.description = description;
      if (address !== undefined) restaurant.address = address;
      if (phone !== undefined) restaurant.phone = phone;
      if (imageUrl !== undefined) restaurant.imageUrl = imageUrl;
      if (foursquareId !== undefined) restaurant.foursquareId = foursquareId;

      await restaurant.save();
      return res.json({ ok: true, data: restaurant });
    } catch {
      return res.status(500).json({ ok: false, error: "server error" });
    }
  }
);

export default router;
