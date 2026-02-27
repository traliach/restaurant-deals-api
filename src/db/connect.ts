import mongoose from "mongoose";
import { env } from "../config/env";

// Connect to MongoDB Atlas.
export async function connectDb() {
  await mongoose.connect(env.MONGO_URI);
}
