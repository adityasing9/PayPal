import fs from 'node:fs';
import path from 'node:path';
import mongoose from 'mongoose';
import { env } from '../src/config/env.js';
import { Product } from '../src/models/Product.model.js';
import { User } from '../src/models/User.model.js';
import { UserPreference } from '../src/models/UserPreference.model.js';
import { authService } from '../src/services/AuthService.js';

/**
 * Idempotent Database Catalog and Development Seeder.
 * Populates verified 18-product catalog from data/catalog_fixture.json into MongoDB.
 *
 * SAFEGUARDS:
 * 1. Strictly refuses execution in production (NODE_ENV === 'production').
 * 2. Demo user creation is quarantined behind SEED_DEMO_USER === 'true' in local dev only.
 * 3. Enforces BigInt minor unit representations for financial fields.
 */
async function runSeed() {
  // 1. Production Lockout Safeguard
  if (env.NODE_ENV === 'production' || process.env.NODE_ENV === 'production') {
    console.error('CRITICAL ERROR: scripts/seed.js is strictly barred in production environments.');
    process.exit(1);
  }

  const mongoUri = env.MONGODB_URI;
  console.log(`Connecting to MongoDB at ${mongoUri}...`);

  await mongoose.connect(mongoUri, {
    serverSelectionTimeoutMS: 5000
  });

  try {
    // 2. Seed Verified Product Catalog Fixture
    const fixturePath = path.resolve(process.cwd(), 'data', 'catalog_fixture.json');
    if (!fs.existsSync(fixturePath)) {
      throw new Error(`Catalog fixture file not found at ${fixturePath}`);
    }

    const rawFixture = fs.readFileSync(fixturePath, 'utf8');
    const catalogItems = JSON.parse(rawFixture);

    console.log(`Validating and upserting ${catalogItems.length} products from catalog fixture...`);

    const bulkOps = catalogItems.map((item) => {
      // Validate schema compliance
      if (!item.externalId || !item.title || !item.category || !item.specHash) {
        throw new Error(`Invalid catalog item format: missing required fields in ${item.externalId || 'unknown'}`);
      }

      const updateDoc = {
        externalId: item.externalId,
        title: item.title,
        description: item.description,
        category: item.category,
        merchantId: item.merchantId,
        merchantName: item.merchantName,
        paypalMerchantId: item.paypalMerchantId,
        basePriceMinor: BigInt(item.basePriceMinor),
        currency: item.currency || 'USD',
        minorUnitExponent: item.minorUnitExponent || 2,
        specifications: item.specifications || {},
        specHash: item.specHash,
        productUrl: item.productUrl,
        catalogSource: item.catalogSource || 'CHANNEL3_OFFLINE_FIXTURE',
        isVerified: item.isVerified !== undefined ? item.isVerified : true
      };

      return {
        updateOne: {
          filter: { externalId: item.externalId },
          update: { $set: updateDoc },
          upsert: true
        }
      };
    });

    const productResult = await Product.bulkWrite(bulkOps);
    console.log(
      `Catalog sync complete: ${productResult.upsertedCount} inserted, ${productResult.modifiedCount} updated.`
    );

    // 3. Demo User Creation Safeguard
    if (process.env.SEED_DEMO_USER === 'true') {
      console.log('SEED_DEMO_USER=true detected. Seeding development demo user...');
      const demoEmail = 'demo@intentlock.io';
      const existingUser = await User.findOne({ email: demoEmail });

      let userId;
      if (!existingUser) {
        const passwordHash = await authService.hashPassword('Password123!');
        const newUser = await User.create({
          email: demoEmail,
          passwordHash,
          name: 'IntentLock Demo User',
          sessionVersion: 1
        });
        userId = newUser._id;
        console.log(`Demo user created: ${demoEmail} (id: ${userId})`);
      } else {
        userId = existingUser._id;
        console.log(`Demo user already exists: ${demoEmail} (id: ${userId})`);
      }

      // Seed preferences for demo user
      await UserPreference.findOneAndUpdate(
        { userId },
        {
          $set: {
            userId,
            currency: 'USD',
            maxTransactionLimitMinor: 20000n, // $200.00
            approvedMerchants: [
              'MERCHANT_KEYCHRON',
              'MERCHANT_LOGITECH',
              'MERCHANT_SONY',
              'MERCHANT_DELL',
              'MERCHANT_LG',
              'MERCHANT_AUDIO_TECHNICA',
              'MERCHANT_SENNHEISER',
              'MERCHANT_ASUS'
            ],
            requireExplicitDiffConfirmation: true
          }
        },
        { upsert: true }
      );
      console.log(`User preferences updated for ${demoEmail}.`);
    } else {
      console.log('Skipping demo user seeding (zero predictable credentials seeded).');
    }

    console.log('Database seeding finished successfully.');
  } finally {
    await mongoose.disconnect();
    console.log('MongoDB connection closed.');
  }
}

// Execute if invoked directly from CLI
if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}`) {
  runSeed().catch((err) => {
    console.error('Seeding failed with error:', err);
    process.exit(1);
  });
}

export { runSeed };
