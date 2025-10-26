const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function listUsers() {
  try {
    console.log('👥 Listing all users with BMI data...\n');

    const users = await prisma.user.findMany({
      include: {
        bmiData: {
          orderBy: { timestamp: 'desc' },
          take: 1 // Get latest BMI record
        },
        _count: {
          select: { bmiData: true }
        }
      }
    });

    if (users.length === 0) {
      console.log('❌ No users found in database');
      return;
    }

    users.forEach((user, index) => {
      console.log(`${index + 1}. ${user.name}`);
      console.log(`   📱 Mobile: ${user.mobile}`);
      console.log(`   🆔 User ID: ${user.id}`);
      console.log(`   📊 Total BMI Records: ${user._count.bmiData}`);
      
      if (user.bmiData.length > 0) {
        const latest = user.bmiData[0];
        console.log(`   📈 Latest BMI: ${latest.bmi} (${latest.category})`);
        console.log(`   📅 Last Record: ${latest.timestamp.toLocaleDateString()}`);
      }
      
      console.log(`   🔗 Analytics URL: http://localhost:5174/analytics?userId=${user.id}`);
      console.log(`   🔗 Dashboard Login: Name="${user.name}", Mobile="${user.mobile}"`);
      console.log('');
    });

    console.log('🚀 Quick Test Instructions:');
    console.log('1. Visit http://localhost:5174/');
    console.log('2. Use any of the above Name/Mobile combinations to login');
    console.log('3. Or visit the direct analytics URLs');
    console.log('4. Or visit http://localhost:5174/dashboard if already logged in');

  } catch (error) {
    console.error('❌ Error listing users:', error);
  } finally {
    await prisma.$disconnect();
  }
}

listUsers();




















