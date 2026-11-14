import mongoose from 'mongoose';

/**
 * Fælles katalog over LEGO-sæt (cache af eksterne opslag + manuelle indtastninger).
 * Indeholder ALDRIG en brugers private samlingsdata.
 */
const legoSetSchema = new mongoose.Schema(
  {
    setNumber: { type: String, required: true, trim: true, lowercase: true }, // fx "75192-1"
    name: { type: String, required: true, trim: true, maxlength: 300 },
    theme: { type: String, default: null, trim: true, maxlength: 120 }, // hovedtema, fx "Star Wars"
    subtheme: { type: String, default: null, trim: true, maxlength: 120 }, // fx "Ultimate Collector Series"
    releaseYear: { type: Number, default: null, min: 1932, max: 2100 },
    pieceCount: { type: Number, default: null, min: 0 },
    minifigureCount: { type: Number, default: null, min: 0 },
    imageUrl: { type: String, default: null, maxlength: 2000 },
    description: { type: String, default: null, maxlength: 5000 },
    instructionsUrl: { type: String, default: null, maxlength: 2000 },
    sourceUrl: { type: String, default: null, maxlength: 2000 }, // sættets side hos datakilden
    source: { type: String, required: true, enum: ['rebrickable', 'manual'] },
    // Kun for manuelle indtastninger: hvem oprettede posten.
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    // Sidste vellykkede hentning fra ekstern datakilde.
    lastFetchedAt: { type: Date, default: null },
    // Sidste forsøg på at finde et manuelt sæt hos datakilden (undgår gentagne opslag).
    lastProviderCheckAt: { type: Date, default: null },
  },
  { timestamps: true },
);

legoSetSchema.index({ setNumber: 1 }, { unique: true });

legoSetSchema.methods.toPublic = function toPublic() {
  return {
    id: this._id.toString(),
    setNumber: this.setNumber,
    name: this.name,
    theme: this.theme,
    subtheme: this.subtheme,
    releaseYear: this.releaseYear,
    pieceCount: this.pieceCount,
    minifigureCount: this.minifigureCount,
    imageUrl: this.imageUrl,
    description: this.description,
    instructionsUrl: this.instructionsUrl,
    sourceUrl: this.sourceUrl,
    source: this.source,
    lastFetchedAt: this.lastFetchedAt,
    updatedAt: this.updatedAt,
  };
};

export const LegoSet = mongoose.model('LegoSet', legoSetSchema, 'legoSets');
