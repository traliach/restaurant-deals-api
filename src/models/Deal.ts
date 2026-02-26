import { InferSchemaType, Schema, model } from "mongoose";

const dealSchema = new Schema(
  {
    restaurantId: { type: String, required: true, trim: true },
    restaurantName: { type: String, required: true, trim: true },
    title: { type: String, required: true, trim: true, maxlength: 80 },
    description: { type: String, required: true, trim: true, maxlength: 400 },
    dealType: {
      type: String,
      enum: ["Lunch", "Carryout", "Delivery", "Other"],
      required: true,
    },
    discountType: {
      type: String,
      enum: ["percent", "amount", "bogo", "other"],
      required: true,
    },
    value: { type: Number },
    price: { type: Number },
    imageUrl: { type: String, trim: true },
    tags: [{ type: String, trim: true }],
    startAt: { type: Date },
    endAt: { type: Date },
    status: {
      type: String,
      enum: ["DRAFT", "SUBMITTED", "PUBLISHED", "REJECTED"],
      default: "DRAFT",
      required: true,
    },
    rejectionReason: { type: String, trim: true },
    createdByUserId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

dealSchema.index({ restaurantId: 1 });
dealSchema.index({ status: 1, createdAt: -1 });

dealSchema.path("value").validate(function (this: Deal, value: number | undefined) {
  if (this.discountType === "percent" || this.discountType === "amount") {
    return typeof value === "number";
  }
  return true;
}, "value is required for percent and amount discount types");

export type Deal = InferSchemaType<typeof dealSchema>;

export const DealModel = model<Deal>("Deal", dealSchema);
