import { InferSchemaType, Schema, model } from "mongoose";

const favoriteSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    dealId: { type: Schema.Types.ObjectId, ref: "Deal", required: true },
  },
  { timestamps: true }
);

// Prevent duplicate favorites.
favoriteSchema.index({ userId: 1, dealId: 1 }, { unique: true });

export type Favorite = InferSchemaType<typeof favoriteSchema>;
export const FavoriteModel = model<Favorite>("Favorite", favoriteSchema);
