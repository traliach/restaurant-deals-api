/**
 * Seed script — creates realistic demo data for Restaurant Deals.
 * Run: npx ts-node src/scripts/seed.ts
 *
 * Creates:
 *  - 1 admin account
 *  - 6 owner accounts (one per city)
 *  - 30 restaurant profiles (5 per city)
 *  - 150 published deals (5 per restaurant, mixed types)
 *
 * Cities: Newark, Jersey City, NYC, Brooklyn, Hoboken, Montclair
 */

import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import dotenv from "dotenv";
import { DealModel } from "../models/Deal";
import { RestaurantModel } from "../models/Restaurant";
import { UserModel } from "../models/User";

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || "";
const JWT_SECRET = process.env.JWT_SECRET || "secret";
const PASSWORD = "Demo123!";

// ─── City data ────────────────────────────────────────────────────────────────

const CITIES = [
  { city: "Newark", state: "NJ" },
  { city: "Jersey City", state: "NJ" },
  { city: "New York", state: "NY" },
  { city: "Brooklyn", state: "NY" },
  { city: "Hoboken", state: "NJ" },
  { city: "Montclair", state: "NJ" },
];

// ─── Restaurant data ──────────────────────────────────────────────────────────

const RESTAURANT_NAMES = [
  ["Ironbound Steakhouse", "Ferry St Tapas", "Seabra's Marisqueira", "Porto's Kitchen", "Brasilia Grill"],
  ["Skinner's Loft", "Light Horse Tavern", "Taqueria Downtown", "Satis Bistro", "Porta Pizza"],
  ["The NoMad Bar", "Balthazar Brasserie", "Superiority Burger", "Ivan Ramen", "Xi'an Famous Foods"],
  ["Lucali Pizza", "Di Fara Pizza", "Roberta's", "Olmsted", "The River Café"],
  ["Antique Bar & Bakery", "Amanda's Restaurant", "Bwe Kafe", "Leo's Grandevous", "Bin 14"],
  ["Pig & Prince", "Raymond's", "Halcyon", "Fascino", "Fresco Il Ristorante"],
];

const ADDRESSES = [
  ["120 Ferry St", "321 Elm Ave", "87 Madison St", "15 Central Ave", "203 Market St"],
  ["40 Hudson St", "199 Marin Blvd", "510 Grand St", "212 Washington St", "4 Erie St"],
  ["10 W 28th St", "80 Spring St", "430 E 9th St", "25 Clinton St", "81 St Marks Pl"],
  ["575 Henry St", "1424 Ave J", "261 Moore St", "659 Washington Ave", "1 Water St"],
  ["711 Washington St", "908 Washington St", "818 Washington St", "200 Washington St", "1104 Washington St"],
  ["57 Walnut St", "717 Bloomfield Ave", "555 Bloomfield Ave", "331 Bloomfield Ave", "189 Walnut St"],
];

// ─── Deal templates ──────────────────────────────────────────────────────────

const DEAL_TEMPLATES = [
  {
    title: "Lunch Special",
    description: "Enjoy our chef's daily lunch selection with a complimentary house salad. Perfect for a midday break.",
    dealType: "Lunch" as const,
    discountType: "percent" as const,
    value: 20,
    price: 14.99,
  },
  {
    title: "Happy Hour Bites",
    description: "Half-price appetizers every weekday from 4–7pm. Great for after-work gatherings.",
    dealType: "Carryout" as const,
    discountType: "amount" as const,
    value: 8,
    price: 22.00,
  },
  {
    title: "Family Dinner Pack",
    description: "Feeds a family of 4. Includes two entrees, sides, and a shared dessert. Order ahead for pickup.",
    dealType: "Carryout" as const,
    discountType: "percent" as const,
    value: 15,
    price: 54.99,
  },
  {
    title: "Buy One Get One",
    description: "Order any entrée and get a second of equal or lesser value free. Dine-in and takeout.",
    dealType: "Delivery" as const,
    discountType: "bogo" as const,
    value: 0,
    price: 18.50,
  },
  {
    title: "Weekend Brunch Deal",
    description: "Bottomless coffee and fresh-squeezed juice included with any brunch plate on Saturdays and Sundays.",
    dealType: "Other" as const,
    discountType: "amount" as const,
    value: 10,
    price: 26.00,
  },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function hashPassword(pw: string) {
  return bcrypt.hash(pw, 10);
}

function makeToken(userId: string, role: string) {
  return jwt.sign({ sub: userId, role }, JWT_SECRET, { expiresIn: "7d" });
}

function picsum(seed: string) {
  return `https://picsum.photos/seed/${encodeURIComponent(seed)}/800/400`;
}

function daysFromNow(n: number) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function seed() {
  await mongoose.connect(MONGO_URI);
  console.log("DB connected");

  // ── Admin ──
  const existingAdmin = await UserModel.findOne({ email: "admin@restaurantdeals.dev" });
  let adminUser = existingAdmin;
  if (!adminUser) {
    adminUser = await UserModel.create({
      email: "admin@restaurantdeals.dev",
      passwordHash: await hashPassword(PASSWORD),
      role: "admin",
    });
    console.log("Created admin: admin@restaurantdeals.dev");
  } else {
    console.log("Admin already exists — skipping");
  }

  const adminToken = makeToken(adminUser._id.toString(), "admin");

  // ── Owners, Restaurants, Deals ──
  let totalRestaurants = 0;
  let totalDeals = 0;

  for (let ci = 0; ci < CITIES.length; ci++) {
    const { city, state } = CITIES[ci];
    const ownerEmail = `owner.${city.toLowerCase().replace(" ", ".")}@restaurantdeals.dev`;
    const restaurantSlug = `${city.toLowerCase().replace(" ", "-")}-owner`;

    let owner = await UserModel.findOne({ email: ownerEmail });
    if (!owner) {
      owner = await UserModel.create({
        email: ownerEmail,
        passwordHash: await hashPassword(PASSWORD),
        role: "owner",
        restaurantId: restaurantSlug,
      });
      console.log(`Created owner: ${ownerEmail}`);
    }

    const names = RESTAURANT_NAMES[ci];
    const addresses = ADDRESSES[ci];

    for (let ri = 0; ri < names.length; ri++) {
      const restId = `${restaurantSlug}-${ri + 1}`;
      const name = names[ri];
      const address = `${addresses[ri]}, ${city}, ${state}`;

      let restaurant = await RestaurantModel.findOne({ restaurantId: restId });
      if (!restaurant) {
        restaurant = await RestaurantModel.create({
          restaurantId: restId,
          name,
          ownerId: owner._id,
          description: `${name} is a beloved local spot in ${city} known for fresh ingredients and welcoming atmosphere.`,
          address,
          city,
          imageUrl: picsum(name),
          phone: `(${201 + ci}) 555-${String(1000 + ri * 111).padStart(4, "0")}`,
        });
        totalRestaurants++;
      }

      // 5 deals per restaurant
      for (let di = 0; di < DEAL_TEMPLATES.length; di++) {
        const tmpl = DEAL_TEMPLATES[di];
        const existing = await DealModel.findOne({
          restaurantId: restId,
          title: tmpl.title,
        });
        if (existing) continue;

        const deal = await DealModel.create({
          restaurantId: restId,
          restaurantName: name,
          restaurantAddress: address,
          restaurantCity: city,
          title: tmpl.title,
          description: tmpl.description,
          dealType: tmpl.dealType,
          discountType: tmpl.discountType,
          value: tmpl.value,
          price: tmpl.price,
          imageUrl: picsum(`${name}-${tmpl.title}`),
          status: "SUBMITTED",
          createdByUserId: owner._id,
          startAt: new Date(),
          endAt: daysFromNow(30),
        });

        // Auto-approve so deals appear in the public feed.
        deal.status = "PUBLISHED";
        await deal.save();
        totalDeals++;
      }
    }
  }

  console.log(`\nSeed complete:`);
  console.log(`  Restaurants created: ${totalRestaurants}`);
  console.log(`  Deals published:     ${totalDeals}`);
  console.log(`\nDemo accounts (password: ${PASSWORD}):`);
  console.log(`  admin@restaurantdeals.dev`);
  CITIES.forEach(({ city }) => {
    console.log(`  owner.${city.toLowerCase().replace(" ", ".")}@restaurantdeals.dev`);
  });

  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
