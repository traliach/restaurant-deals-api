import dotenv from "dotenv";

dotenv.config();

// Load and validate env vars.
export const env = {
  API_PORT: Number(process.env.API_PORT) || 3000,
  MONGO_URI: process.env.MONGO_URI || "",
  JWT_SECRET: process.env.JWT_SECRET || "",
};

// Crash fast if missing.
export function assertEnv() {
  const missing: string[] = [];
  if (!env.MONGO_URI) missing.push("MONGO_URI");
  if (!env.JWT_SECRET) missing.push("JWT_SECRET");

  if (missing.length) {
    throw new Error(`Missing required env vars: ${missing.join(", ")}`);
  }
}
