import mongoose from 'mongoose';

const { Schema } = mongoose;

export const UserSchema = new Schema(
  {
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true
    },
    passwordHash: {
      type: String,
      required: [true, 'Password hash is required']
    },
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true
    },
    role: {
      type: String,
      enum: ['USER', 'ADMIN'],
      default: 'USER',
      required: true
    },
    isActive: {
      type: Boolean,
      default: true,
      required: true
    },
    sessionVersion: {
      type: Number,
      default: 1,
      required: true
    }
  },
  {
    timestamps: true,
    collection: 'users',
    strict: true
  }
);

UserSchema.index({ email: 1 }, { unique: true });

export const User = mongoose.models.User || mongoose.model('User', UserSchema);
