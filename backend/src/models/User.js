import mongoose from 'mongoose';

const CASE_INSENSITIVE = { locale: 'en', strength: 2 };

const userSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, trim: true, minlength: 3, maxlength: 30 },
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 254 },
    passwordHash: { type: String, required: true, select: false },
    // Øges ved ændring af adgangskode, så alle andre sessioner bliver ugyldige.
    sessionVersion: { type: Number, default: 0 },
  },
  { timestamps: true },
);

userSchema.index({ email: 1 }, { unique: true });
// Unikt uden hensyn til store/små bogstaver: "Grej" og "grej" er samme brugernavn.
userSchema.index({ username: 1 }, { unique: true, collation: CASE_INSENSITIVE });

userSchema.methods.toPublic = function toPublic() {
  return {
    id: this._id.toString(),
    username: this.username,
    email: this.email,
    createdAt: this.createdAt,
  };
};

userSchema.statics.findByUsername = function findByUsername(username) {
  return this.findOne({ username }).collation(CASE_INSENSITIVE);
};

export const User = mongoose.model('User', userSchema, 'users');
