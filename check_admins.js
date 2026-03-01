
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkAdmins() {
    try {
        const admins = await prisma.adminUser.findMany({
            include: {
                assignedScreens: true
            }
        });
        console.log('Admins count:', admins.length);
        admins.forEach(admin => {
            console.log(`- ${admin.email}: role=${admin.role}, screens=${admin.assignedScreens.length}`);
        });

    } catch (err) {
        console.error('Check admins error:', err);
    } finally {
        await prisma.$disconnect();
    }
}

checkAdmins();
