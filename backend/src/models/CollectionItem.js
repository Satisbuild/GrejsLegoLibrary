import mongoose from 'mongoose';

export const CONDITIONS = ['new', 'opened', 'used'];

const collectionItemSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    setId: { type: mongoose.Schema.Types.ObjectId, ref: 'LegoSet', required: true },
    setNumber: { type: String, required: true },
    quantity: { type: Number, required: true, min: 1, max: 999, default: 1 },
    condition: { type: String, enum: CONDITIONS, default: 'new' },
    hasBox: { type: Boolean, default: false },
    hasInstructions: { type: Boolean, default: false },
    purchaseDate: { type: Date, default: null },
    purchasePrice: { type: Number, default: null, min: 0 }, // pris pr. eksemplar i DKK
    notes: { type: String, default: '', maxlength: 2000 },
  },
  { timestamps: { createdAt: 'addedAt', updatedAt: 'updatedAt' } },
);

collectionItemSchema.index({ userId: 1, addedAt: -1 });
collectionItemSchema.index({ userId: 1, setId: 1 });

collectionItemSchema.methods.toPublic = function toPublic() {
  const set = this.populated('setId') ? this.setId : null;
  return {
    id: this._id.toString(),
    setNumber: this.setNumber,
    setId: set ? set._id.toString() : this.setId.toString(),
    set: set ? set.toPublic() : null,
    quantity: this.quantity,
    condition: this.condition,
    hasBox: this.hasBox,
    hasInstructions: this.hasInstructions,
    purchaseDate: this.purchaseDate,
    purchasePrice: this.purchasePrice,
    notes: this.notes,
    addedAt: this.addedAt,
    updatedAt: this.updatedAt,
  };
};

export const CollectionItem = mongoose.model('CollectionItem', collectionItemSchema, 'collectionItems');
