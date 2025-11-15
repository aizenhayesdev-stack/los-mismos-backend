/**
 * Migration script to update profile picture URLs
 * Updates the base URL from the old Railway URL to the new Los-Mismos API URL
 * 
 * Usage: npx ts-node src/scripts/update-profile-picture-urls.ts
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Profile from '../models/profile.model';
import { DB_URI } from '../config/environment';

dotenv.config();

// Old and new base URLs
const OLD_BASE_URL = 'https://ticktingbackend-production.up.railway.app';
const NEW_BASE_URL = 'https://los-mismos-api.the4loop.com';

async function updateProfilePictureUrls() {
  try {
    // Connect to MongoDB
    console.log('Connecting to MongoDB...');
    await mongoose.connect(DB_URI as string);
    console.log('✅ Connected to MongoDB\n');

    // Find all profiles with pictureUrl that contains the old base URL
    console.log('Searching for profiles with old picture URLs...');
    const profiles = await Profile.find({
      pictureUrl: { $regex: OLD_BASE_URL, $options: 'i' }
    });

    console.log(`Found ${profiles.length} profile(s) with old picture URLs\n`);

    if (profiles.length === 0) {
      console.log('No profiles to update. Exiting...');
      await mongoose.disconnect();
      process.exit(0);
    }

    // Update each profile
    let updatedCount = 0;
    let skippedCount = 0;

    for (const profile of profiles) {
      if (!profile.pictureUrl) {
        skippedCount++;
        continue;
      }

      const oldUrl = profile.pictureUrl;
      const newUrl = oldUrl.replace(OLD_BASE_URL, NEW_BASE_URL);

      // Only update if the URL actually changed
      if (oldUrl !== newUrl) {
        profile.pictureUrl = newUrl;
        await profile.save();
        updatedCount++;
        console.log(`✓ Updated profile ${profile._id}`);
        console.log(`  Old: ${oldUrl}`);
        console.log(`  New: ${newUrl}\n`);
      } else {
        skippedCount++;
        console.log(`- Skipped profile ${profile._id} (URL already correct)\n`);
      }
    }

    console.log('\n✅ Migration completed successfully!');
    console.log(`\nSummary:`);
    console.log(`- Total profiles found: ${profiles.length}`);
    console.log(`- Profiles updated: ${updatedCount}`);
    console.log(`- Profiles skipped: ${skippedCount}`);

  } catch (error) {
    console.error('❌ Error updating profile picture URLs:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
    process.exit(0);
  }
}

// Run the migration function
updateProfilePictureUrls();

