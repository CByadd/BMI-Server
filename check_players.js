const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log('Fetching all Adscape players...');
    const players = await prisma.adscapePlayer.findMany({
        select: {
            screenId: true,
            deviceName: true,
            appVersion: true,
            flowType: true,
            updatedAt: true
        }
    });
    console.table(players);
}

main()
    .catch(e => console.error(e))
    .finally(() => prisma.$disconnect());
