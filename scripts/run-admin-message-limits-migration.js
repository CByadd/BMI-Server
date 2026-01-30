const prisma = require('../db');
const fs = require('fs');
const path = require('path');

async function runMigration() {
  try {
    console.log('Running admin message limits migration...');
    
    // Read the migration file
    const migrationPath = path.join(__dirname, '..', 'migration_admin_message_limits.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    
    // Execute the migration
    await prisma.$executeRawUnsafe(migrationSQL);
    
    console.log('✓ Migration completed successfully!');
    console.log('✓ Added totalMessageLimit to AdminUser');
    console.log('✓ Added messageLimit to AdminScreenAssignment');
    console.log('\nNext step: Run "npm run prisma:generate" to regenerate Prisma client');
    
  } catch (error) {
    console.error('Error running migration:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runMigration();
