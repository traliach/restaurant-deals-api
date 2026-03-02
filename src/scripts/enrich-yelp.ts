/**
 * Yelp enrichment script.
 * Creates real Restaurant + Deal documents using Yelp Fusion Business Search.
 *
 * Run: npx ts-node src/scripts/enrich-yelp.ts
 * Single city: ONLY_CITY="Newark" npx ts-node src/scripts/enrich-yelp.ts
 *
 * 6 cities × 1 API call = 6 requests total (well within 500/day free limit).
 * Idempotent — skips cities already enriched with source="yelp".
 */

import dotenv from "dotenv";
import mongoose from "mongoose";
import { DealModel } from "../models/Deal";
import { RestaurantModel } from "../models/Restaurant";
import { UserModel } from "../models/User";

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || "";
const YELP_KEY = process.env.YELP_API_KEY || "";

// Optional: run only one city per session.
// Usage: ONLY_CITY="Newark" npx ts-node src/scripts/enrich-yelp.ts
const ONLY_CITY = process.env.ONLY_CITY?.trim();

const CITIES: { city: string; location: string }[] = [
  { city: "Newark", location: "Newark, NJ" },
  { city: "Jersey City", location: "Jersey City, NJ" },
  { city: "New York", location: "New York, NY" },
  { city: "Brooklyn", location: "Brooklyn, NY" },
  { city: "Hoboken", location: "Hoboken, NJ" },
  { city: "Montclair", location: "Montclair, NJ" },
];

const DEAL_TEMPLATES = [
  { title: "Chef's Daily Special", description: "Fresh seasonal ingredients prepared by our head chef. Available daily until sold out.", dealType: "Lunch" as const, discountType: "percent" as const, value: 20, price: 16.99 },
  { title: "Happy Hour Bites", description: "Half-price appetizers every weekday 4–7pm. Perfect for after-work gatherings.", dealType: "Carryout" as const, discountType: "amount" as const, value: 8, price: 22.00 },
  { title: "Family Feast Pack", description: "Feeds a family of four. Two entrees, sides, and a shared dessert. Order ahead.", dealType: "Carryout" as const, discountType: "percent" as const, value: 15, price: 59.99 },
  { title: "Buy One Get One", description: "Order any entrée and receive a second of equal or lesser value free.", dealType: "Delivery" as const, discountType: "bogo" as const, value: 0, price: 19.50 },
  { title: "Weekend Brunch Deal", description: "Bottomless coffee and juice included with any brunch plate Saturday and Sunday.", dealType: "Other" as const, discountType: "amount" as const, value: 10, price: 28.00 },
];

type YelpBusiness = {
  id: string;
  name: string;
  rating?: number;
  image_url?: string;
  url?: string;
  phone?: string;
  location?: { display_address?: string[]; city?: string };
  coordinates?: { latitude?: number; longitude?: number };
  categories?: { title: string }[];
};

async function searchYelp(location: string, limit = 5): Promise<YelpBusiness[]> {
  const params = new URLSearchParams({
    term: "restaurants",
    location,
    limit: String(limit),
    categories: "restaurants",
  });

  const res = await fetch(
    `https://api.yelp.com/v3/businesses/search?${params.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${YELP_KEY}`,
        Accept: "application/json",
      },
    }
  );

  if (!res.ok) {
    const body = await res.text();
    console.log(`  Yelp error ${res.status}: ${body.slice(0, 100)}`);
    return [];
  }

  const data = await res.json() as { businesses?: YelpBusiness[] };
  return data.businesses ?? [];
}

function daysFromNow(n: number) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d;
}

async function enrich() {
  if (!YELP_KEY) {
    console.error("YELP_API_KEY is not set in .env");
    process.exit(1);
  }

  await mongoose.connect(MONGO_URI);
  console.log("DB connected\n");

  const adminUser = await UserModel.findOne({ role: "admin" });
  if (!adminUser) {
    console.error("No admin user found — run seed.ts first");
    await mongoose.disconnect();
    process.exit(1);
  }

  let totalRestaurants = 0;
  let totalDeals = 0;

  for (const { city, location } of CITIES) {
    if (ONLY_CITY && city !== ONLY_CITY) {
      console.log(`Skipping ${city} (ONLY_CITY=${ONLY_CITY})`);
      continue;
    }

    const existing = await RestaurantModel.countDocuments({ city, source: "yelp" });
    if (existing > 0) {
      console.log(`Skipping ${city} — already enriched (${existing} restaurants)`);
      continue;
    }

    console.log(`Fetching restaurants in ${location}...`);
    const businesses = await searchYelp(location, 5);

    if (businesses.length === 0) {
      console.log(`  No results for ${location}`);
      continue;
    }

    for (const biz of businesses) {
      const restaurantId = `yelp-${biz.id}`;
      const existing = await RestaurantModel.findOne({ restaurantId });
      if (existing) {
        console.log(`  Skipping duplicate: ${biz.name}`);
        continue;
      }

      const address = biz.location?.display_address?.join(", ") ?? "";

      await RestaurantModel.create({
        restaurantId,
        name: biz.name,
        ownerId: adminUser._id,
        source: "yelp",
        description: `${biz.name} is a real restaurant imported from Yelp. Rating: ${biz.rating ?? "N/A"}/5.`,
        address,
        city,
        latitude: biz.coordinates?.latitude,
        longitude: biz.coordinates?.longitude,
        phone: biz.phone,
        website: biz.url,
        rating: biz.rating ? biz.rating * 2 : undefined, // convert 0-5 → 0-10 to match schema
        imageUrl: biz.image_url,
      });
      totalRestaurants++;

      for (const tmpl of DEAL_TEMPLATES) {
        await DealModel.create({
          restaurantId,
          restaurantName: biz.name,
          restaurantAddress: address,
          restaurantCity: city,
          restaurantSource: "yelp",
          title: tmpl.title,
          description: tmpl.description,
          dealType: tmpl.dealType,
          discountType: tmpl.discountType,
          value: tmpl.value,
          price: tmpl.price,
          imageUrl: biz.image_url,
          status: "PUBLISHED",
          createdByUserId: adminUser._id,
          startAt: new Date(),
          endAt: daysFromNow(30),
        });
        totalDeals++;
      }

      console.log(`  ✓ ${biz.name} (${city}) rating:${biz.rating ?? "n/a"}`);
    }
  }

  console.log(`\nYelp enrichment complete:`);
  console.log(`  Restaurants imported: ${totalRestaurants}`);
  console.log(`  Deals created:        ${totalDeals}`);

  await mongoose.disconnect();
}

enrich().catch((err) => {
  console.error("Enrichment failed:", err);
  process.exit(1);
});
