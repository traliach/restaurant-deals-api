import { InferSchemaType, Schema, model } from "mongoose";

// One restaurant per owner (scalable to many).
const restaurantSchema = new Schema(
  {
    restaurantId: { type: String, required: true, unique: true, trim: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    description: { type: String, trim: true, maxlength: 500 },
    address: { type: String, trim: true },
    city: { type: String, trim: true },
    latitude: { type: Number },
    longitude: { type: Number },
    phone: { type: String, trim: true },
    website: { type: String, trim: true },
    rating: { type: Number, min: 0, max: 10 },
    imageUrl: { type: String, trim: true },
    foursquareId: { type: String, trim: true },
  },
  { timestamps: true }
);

// Fast lookup by owner.
restaurantSchema.index({ ownerId: 1 });
// Fast city filtering.
restaurantSchema.index({ city: 1 });

export type Restaurant = InferSchemaType<typeof restaurantSchema>;
export const RestaurantModel = model<Restaurant>("Restaurant", restaurantSchema);
