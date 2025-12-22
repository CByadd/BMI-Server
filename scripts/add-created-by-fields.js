require('dotenv').config();
const prisma = require('../db');

async function addCreatedByFields() {
  try {
    console.log('Adding created_by fields to tables...');

    // Add created_by to playlists table
    try {
      await prisma.$executeRawUnsafe(`
        ALTER TABLE playlists 
        ADD COLUMN IF NOT EXISTS created_by VARCHAR(255);
      `);
      console.log('✓ Added created_by to playlists table');
    } catch (error) {
      console.log('Note: created_by may already exist in playlists:', error.message);
    }

    // Add index for faster queries
    try {
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS idx_playlists_created_by ON playlists(created_by);
      `);
      console.log('✓ Added index on playlists.created_by');
    } catch (error) {
      console.log('Note: Index may already exist:', error.message);
    }

    console.log('\n✓ All created_by fields added successfully!');
    
  } catch (error) {
    console.error('Error adding created_by fields:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

addCreatedByFields();












