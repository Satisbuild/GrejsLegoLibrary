import mongoose from 'mongoose';

export const PRIORITIES = ['low', 'normal', 'high'];
export const WISH_STATUSES = ['wanted', 'purchased'];

const wishlistItemSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    setId: { type: mongoose.Schema.Types.ObjectId, ref: 'LegoSet', required: true },
    setNumber: { type: String, required: true },
    priority: { type: String, enum: PRIORITIES, default: 'normal' },
    targetPrice: { type: Number, default: null, min: 0 }, // ønsket maksimal pris i DKK
    notes: { type: String, default: '', maxlength: 2000 },
    status: { type: String, enum: WISH_STATUSES, default: 'wanted' },
    purchasedAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: 'addedAt', updatedAt: 'updatedAt' } },
);

wishlistItemSchema.index({ userId: 1, addedAt: -1 });
// Et sæt kan kun stå én gang på den samme brugers ønskeliste.
wishlistItemSchema.index({ userId: 1, setId: 1 }, { unique: true });

wishlistItemSchema.methods.toPublic = function toPublic() {
  const set = this.populated('setId') ? this.setId : null;
  return {
    id: this._id.toString(),
    setNumber: this.setNumber,
    setId: set ? set._id.toString() : this.setId.toString(),
    set: set ? set.toPublic() : null,
    priority: this.priority,
    targetPrice: this.targetPrice,
    notes: this.notes,
    status: this.status,
    purchasedAt: this.purchasedAt,
    addedAt: this.addedAt,
    updatedAt: this.updatedAt,
  };
};

export const WishlistItem = mongoose.model('WishlistItem', wishlistItemSchema, 'wishlistItems');
