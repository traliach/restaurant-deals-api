/**
 * Seed script — creates a compact, more realistic demo dataset.
 * Run: npx ts-node src/scripts/seed.ts
 *
 * Creates:
 *  - 1 admin account
 *  - 3 owner accounts (one per city)
 *  - 9 restaurant profiles (3 per city)
 *  - 2-3 varied deals per restaurant
 *
 * Reruns replace old seed-only data so the demo stays clean.
 */

import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import dotenv from "dotenv";
import { DealModel } from "../models/Deal";
import { FavoriteModel } from "../models/Favorite";
import { NotificationModel } from "../models/Notification";
import { OrderModel } from "../models/Order";
import { RestaurantModel } from "../models/Restaurant";
import { UserModel } from "../models/User";

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || "";
const PASSWORD = "Demo123!";

type CuisineType =
  | "French"
  | "Italian"
  | "Spanish"
  | "American"
  | "Asian"
  | "Mexican"
  | "Mediterranean"
  | "Other";

type DietaryTag =
  | "Vegan"
  | "Vegetarian"
  | "Gluten-Free"
  | "Halal"
  | "Keto"
  | "Dairy-Free";

type SeedRestaurant = {
  name: string;
  address: string;
  cuisineType: CuisineType;
  dietaryTags?: DietaryTag[];
};

type SeedCity = {
  city: string;
  state: string;
  restaurants: SeedRestaurant[];
};

type DealTemplate = {
  slug: string;
  title: (cuisine: CuisineType) => string;
  description: (restaurantName: string, cuisine: CuisineType) => string;
  dealType: "Lunch" | "Carryout" | "Delivery" | "Other";
  discountType: "percent" | "amount" | "bogo" | "other";
  value?: number;
  price: number;
  expiryHours: number;
};

const CITIES: SeedCity[] = [
  {
    city: "Newark",
    state: "NJ",
    restaurants: [
      { name: "Ferry Street Tapas", address: "145 Ferry St", cuisineType: "Spanish", dietaryTags: ["Gluten-Free"] },
      { name: "Brick Oven Pizza Co.", address: "222 Halsey St", cuisineType: "Italian", dietaryTags: ["Vegetarian"] },
      { name: "Garden Bowl Kitchen", address: "19 Central Ave", cuisineType: "Mediterranean", dietaryTags: ["Vegan", "Vegetarian"] },
    ],
  },
  {
    city: "Jersey City",
    state: "NJ",
    restaurants: [
      { name: "Hudson Burger House", address: "88 Newark Ave", cuisineType: "American" },
      { name: "Marina Sushi Bar", address: "210 Marin Blvd", cuisineType: "Asian", dietaryTags: ["Halal"] },
      { name: "Satis Corner Bistro", address: "298 Grove St", cuisineType: "French" },
    ],
  },
  {
    city: "Montclair",
    state: "NJ",
    restaurants: [
      { name: "Raymond's Table", address: "28 Church St", cuisineType: "American" },
      { name: "Pasta Verdi", address: "421 Bloomfield Ave", cuisineType: "Italian" },
      { name: "Taco Verde", address: "613 Valley Rd", cuisineType: "Mexican", dietaryTags: ["Vegetarian"] },
    ],
  },
];

const DEAL_LIBRARY: DealTemplate[] = [
  {
    slug: "lunch-combo",
    title: (cuisine) => `${labelCuisine(cuisine)} Lunch Combo`,
    description: (restaurantName, cuisine) =>
      `A weekday lunch pairing from ${restaurantName} with a popular ${labelCuisine(cuisine).toLowerCase()} entrée and side.`,
    dealType: "Lunch",
    discountType: "percent",
    value: 20,
    price: 15.99,
    expiryHours: 8760,
  },
  {
    slug: "happy-hour",
    title: () => "Happy Hour Small Plates",
    description: (restaurantName) =>
      `Shareable bites and a drink special from ${restaurantName}, perfect for after-work plans.`,
    dealType: "Carryout",
    discountType: "amount",
    value: 8,
    price: 21.0,
    expiryHours: 8760,
  },
  {
    slug: "family-bundle",
    title: () => "Family Dinner Bundle",
    description: (restaurantName) =>
      `A larger-format meal from ${restaurantName} with mains, sides, and enough food for a relaxed family night.`,
    dealType: "Carryout",
    discountType: "percent",
    value: 15,
    price: 42.99,
    expiryHours: 8760,
  },
  {
    slug: "bogo-entree",
    title: () => "Two-for-One Entrees",
    description: (restaurantName) =>
      `Order one featured entrée at ${restaurantName} and get a second one of equal or lesser value free.`,
    dealType: "Delivery",
    discountType: "bogo",
    price: 19.5,
    expiryHours: 8760,
  },
  {
    slug: "weekend-brunch",
    title: () => "Weekend Brunch for Two",
    description: (restaurantName) =>
      `A brunch-focused offer from ${restaurantName} with coffee, juice, and a better weekend start.`,
    dealType: "Other",
    discountType: "amount",
    value: 10,
    price: 26.0,
    expiryHours: 8760,
  },
  {
    slug: "pickup-special",
    title: () => "Neighborhood Pickup Special",
    description: (restaurantName) =>
      `Quick pickup pricing from ${restaurantName} for busy evenings when you want something reliable and fast.`,
    dealType: "Carryout",
    discountType: "amount",
    value: 6,
    price: 18.99,
    expiryHours: 8760,
  },
  {
    slug: "chef-sampler",
    title: (cuisine) => `${labelCuisine(cuisine)} Chef's Sampler`,
    description: (restaurantName, cuisine) =>
      `A curated tasting from ${restaurantName} that highlights signature ${labelCuisine(cuisine).toLowerCase()} flavors.`,
    dealType: "Other",
    discountType: "percent",
    value: 18,
    price: 29.0,
    expiryHours: 8760,
  },
  {
    slug: "date-night",
    title: () => "Date Night Prix Fixe",
    description: (restaurantName) =>
      `A two-person dinner package from ${restaurantName} designed for a more polished evening out.`,
    dealType: "Delivery",
    discountType: "amount",
    value: 12,
    price: 34.99,
    expiryHours: 8760,
  },
];

async function hashPassword(pw: string) {
  return bcrypt.hash(pw, 10);
}

function hoursFromNow(h: number) {
  return new Date(Date.now() + h * 60 * 60 * 1000);
}

function labelCuisine(cuisine: CuisineType) {
  return cuisine === "Other" ? "House" : cuisine;
}

function imageForCuisine(cuisine: CuisineType) {
  switch (cuisine) {
    case "Italian":
      return "/images/placeholders/pizza.jpg";
    case "American":
    case "Mexican":
      return "/images/placeholders/burger.jpg";
    case "Asian":
      return "/images/placeholders/sushi.jpg";
    case "French":
      return "/images/placeholders/dessert.jpg";
    case "Mediterranean":
    case "Spanish":
      return "/images/placeholders/salad.jpg";
    default:
      return "/images/placeholders/default.svg";
  }
}

function ratingForIndex(index: number) {
  return Math.round((3.9 + (index % 8) * 0.1) * 10) / 10;
}

function pickTemplates(seedIndex: number) {
  const count = 2 + (seedIndex % 2);
  const start = (seedIndex * 2) % DEAL_LIBRARY.length;
  const picked: DealTemplate[] = [];

  for (let i = 0; picked.length < count; i++) {
    const template = DEAL_LIBRARY[(start + i) % DEAL_LIBRARY.length];
    if (!picked.some((item) => item.slug === template.slug)) {
      picked.push(template);
    }
  }

  return picked;
}

async function clearOldSeedData() {
  const seedDeals = await DealModel.find({ restaurantSource: "seed" }, "_id restaurantId");
  const seedDealIds = seedDeals.map((deal) => deal._id);
  const seedRestaurantIds = [...new Set(seedDeals.map((deal) => deal.restaurantId))];

  if (seedDealIds.length) {
    await FavoriteModel.deleteMany({ dealId: { $in: seedDealIds } });
    await NotificationModel.deleteMany({ dealId: { $in: seedDealIds } });
  }

  if (seedRestaurantIds.length) {
    await OrderModel.deleteMany({ "items.restaurantId": { $in: seedRestaurantIds } });
  }

  await DealModel.deleteMany({ restaurantSource: "seed" });
  await RestaurantModel.deleteMany({ source: "seed" });
  await UserModel.deleteMany({
    role: "owner",
    email: { $in: CITIES.map(({ city }) => `owner.${city.toLowerCase().replace(" ", ".")}@restaurantdeals.dev`) },
  });
}

async function seed() {
  await mongoose.connect(MONGO_URI);
  console.log("DB connected");

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
    console.log("Admin already exists — keeping");
  }

  console.log("Replacing old seed-only demo data...");
  await clearOldSeedData();

  let totalRestaurants = 0;
  let totalDeals = 0;
  let globalIndex = 0;

  for (const { city, state, restaurants } of CITIES) {
    const ownerEmail = `owner.${city.toLowerCase().replace(" ", ".")}@restaurantdeals.dev`;
    const restaurantSlug = `${city.toLowerCase().replace(" ", "-")}-owner`;

    const owner = await UserModel.create({
      email: ownerEmail,
      passwordHash: await hashPassword(PASSWORD),
      role: "owner",
      restaurantId: `${restaurantSlug}-1`,
    });

    for (let ri = 0; ri < restaurants.length; ri++) {
      const sourceRestaurant = restaurants[ri];
      const restaurantId = `${restaurantSlug}-${ri + 1}`;
      const address = `${sourceRestaurant.address}, ${city}, ${state}`;

      await RestaurantModel.create({
        restaurantId,
        name: sourceRestaurant.name,
        ownerId: owner._id,
        source: "seed",
        description: `${sourceRestaurant.name} is a neighborhood favorite in ${city} known for approachable ${labelCuisine(sourceRestaurant.cuisineType).toLowerCase()} dishes and a polished casual atmosphere.`,
        address,
        city,
        imageUrl: imageForCuisine(sourceRestaurant.cuisineType),
        phone: `(${201 + ri}) 555-${String(3100 + globalIndex).padStart(4, "0")}`,
        cuisineType: sourceRestaurant.cuisineType,
        rating: ratingForIndex(globalIndex) * 2,
      });
      totalRestaurants++;

      const templates = pickTemplates(globalIndex);

      for (const template of templates) {
        await DealModel.create({
          restaurantId,
          restaurantName: sourceRestaurant.name,
          restaurantAddress: address,
          restaurantCity: city,
          restaurantSource: "seed",
          title: template.title(sourceRestaurant.cuisineType),
          description: template.description(sourceRestaurant.name, sourceRestaurant.cuisineType),
          dealType: template.dealType,
          discountType: template.discountType,
          value: template.value,
          price: template.price,
          imageUrl: imageForCuisine(sourceRestaurant.cuisineType),
          cuisineType: sourceRestaurant.cuisineType,
          dietaryTags: sourceRestaurant.dietaryTags ?? [],
          yelpRating: ratingForIndex(globalIndex),
          status: "PUBLISHED",
          createdByUserId: owner._id,
          startAt: new Date(),
          endAt: hoursFromNow(template.expiryHours),
        });
        totalDeals++;
      }

      globalIndex++;
    }
  }

  console.log("\nSeed complete:");
  console.log(`  Restaurants created: ${totalRestaurants}`);
  console.log(`  Deals published:     ${totalDeals}`);
  console.log("\nDemo accounts (password: Demo123!):");
  console.log("  admin@restaurantdeals.dev");
  CITIES.forEach(({ city }) => {
    console.log(`  owner.${city.toLowerCase().replace(" ", ".")}@restaurantdeals.dev`);
  });

  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
