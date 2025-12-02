// Single Prisma Client instance for the entire application
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
});

// Test connection on startup (non-blocking)
prisma.$connect()
    .then(() => {
        console.log('[DB] ✓ Database connection established');
    })
    .catch((error) => {
        console.error('[DB] ✗ Database connection failed:', error.message);
        console.error('[DB] Error code:', error.code);
        if (error.code === 'P1001') {
            console.error('[DB] Cannot reach database server. Please check:');
            console.error('[DB] 1. Database server is running');
            console.error('[DB] 2. DATABASE_URL is correct');
            console.error('[DB] 3. Network/firewall allows connection');
            console.error('[DB] 4. For Azure: Check firewall rules and SSL settings');
            console.error('[DB] 5. Azure firewall: Add your IP address in Azure Portal');
        } else if (error.code === 'P1000') {
            console.error('[DB] Authentication failed. Please check:');
            console.error('[DB] 1. Username and password are correct');
            console.error('[DB] 2. Database name is correct');
        }
    });

// Handle graceful shutdown
process.on('beforeExit', async () => {
    await prisma.$disconnect();
});

module.exports = prisma;


















