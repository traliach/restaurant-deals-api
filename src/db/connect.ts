import mongoose from "mongoose";
import { env } from "../config/env";

export async function connectDb() {
  console.log("[db] connecting...");
  await mongoose.connect(env.MONGO_URI, { serverSelectionTimeoutMS: 5000 });
  console.log("[db] connected");

  mongoose.connection.on("error", (err) =>
    console.error("[db] error:", err.message)
  );
  mongoose.connection.on("disconnected", () =>
    console.warn("[db] disconnected")
  );
}
