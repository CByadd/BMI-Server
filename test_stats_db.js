
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const getScreenFilter = (user) => {
    if (user.role === 'super_admin') return {};
    if (user.assignedScreenIds.length === 0) return { screenId: { in: [] } };
    return { screenId: { in: user.assignedScreenIds } };
};

async function testStatsForUser(user) {
    try {
        console.log(`--- Testing for role: ${user.role} ---`);
        const screenFilter = getScreenFilter(user);

        const totalBMIRecords = await prisma.bMI.count({ where: screenFilter });
        console.log('Total BMI records:', totalBMIRecords);

        const uniqueUserIds = await prisma.bMI.findMany({
            where: screenFilter,
            select: { userId: true },
            distinct: ['userId']
        });
        const totalUsers = uniqueUserIds.filter(u => u.userId !== null).length;
        console.log('Total unique users:', totalUsers);

        const screenWhere = user.role === 'super_admin'
            ? { isActive: true }
            : { isActive: true, screenId: { in: user.assignedScreenIds } };

        const totalScreens = await prisma.adscapePlayer.count({ where: screenWhere });
        console.log('Total screens:', totalScreens);

    } catch (err) {
        console.error('Test error:', err);
    }
}

async function run() {
    // 1. Super Admin
    await testStatsForUser({ role: 'super_admin', assignedScreenIds: [] });

    // 2. Regular Admin with no screens
    await testStatsForUser({ role: 'admin', assignedScreenIds: [] });

    // 3. Regular Admin with one screen
    const firstPlayer = await prisma.adscapePlayer.findFirst();
    if (firstPlayer) {
        await testStatsForUser({ role: 'admin', assignedScreenIds: [firstPlayer.screenId] });
    }

    await prisma.$disconnect();
}

run();
