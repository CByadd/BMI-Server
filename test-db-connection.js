// Test database connection
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({
  log: ['query', 'error', 'warn'],
});

async function testConnection() {
  try {
    console.log('Testing database connection...');
    console.log('DATABASE_URL:', process.env.DATABASE_URL ? 'Set' : 'Not set');
    
    // Test connection
    await prisma.$connect();
    console.log('✓ Database connection successful!');
    
    // Test a simple query
    const result = await prisma.$queryRaw`SELECT 1 as test`;
    console.log('✓ Database query test successful!', result);
    
    // Check if tables exist
    const tables = await prisma.$queryRaw`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name
    `;
    console.log('✓ Available tables:', tables.map(t => t.table_name).join(', '));
    
  } catch (error) {
    console.error('✗ Database connection failed!');
    console.error('Error:', error.message);
    console.error('Error code:', error.code);
    console.error('Full error:', error);
    
    if (error.code === 'P1001') {
      console.error('\nPossible issues:');
      console.error('1. Database server is not running');
      console.error('2. DATABASE_URL is incorrect');
      console.error('3. Network/firewall blocking connection');
      console.error('4. SSL configuration issue');
    }
  } finally {
    await prisma.$disconnect();
    process.exit(0);
  }
}

testConnection();


