require('dotenv').config();
const prisma = require('../db');

async function fixSchemaMigration() {
  try {
    console.log('Starting schema migration fixes...');

    // Drop the unique constraint on registrationCode first
    try {
      console.log('Dropping unique constraint on registrationCode...');
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "AdscapePlayer" 
        DROP CONSTRAINT IF EXISTS "AdscapePlayer_registrationCode_key";
      `);
      console.log('✓ Dropped registrationCode unique constraint');
    } catch (error) {
      console.log('Note: registrationCode constraint may not exist:', error.message);
    }

    // Drop the index if it exists separately
    try {
      console.log('Dropping index on registrationCode...');
      await prisma.$executeRawUnsafe(`
        DROP INDEX IF EXISTS "AdscapePlayer_registrationCode_key";
      `);
      console.log('✓ Dropped registrationCode index');
    } catch (error) {
      console.log('Note: registrationCode index may not exist:', error.message);
    }

    console.log('\n✓ Schema migration fixes completed!');
    console.log('You can now run: npx prisma db push');
    
  } catch (error) {
    console.error('Error fixing schema migration:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

fixSchemaMigration();


