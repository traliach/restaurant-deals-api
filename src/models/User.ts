import { InferSchemaType, Schema, model } from "mongoose";

const userSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, trim: true, lowercase: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ["customer", "owner", "admin"], required: true, default: "customer" },
    restaurantId: { type: String, trim: true },
  },
  { timestamps: true }
);

// Owner needs restaurantId.
userSchema.path("restaurantId").validate(function (this: User, value: string | undefined) {
  if (this.role === "owner") return Boolean(value && value.trim());
  return true;
}, "restaurantId is required when role is owner");

export type User = InferSchemaType<typeof userSchema>;
export const UserModel = model<User>("User", userSchema);
