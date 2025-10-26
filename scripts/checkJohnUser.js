const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function checkJohnUser() {
  try {
    console.log('🔍 Checking John user details...\n');

    // Find the John user
    const user = await prisma.user.findUnique({
      where: { id: '0381c68c-987d-4794-9649-dfd5c00ffd3c' },
      include: { 
        bmiData: { 
          take: 5, 
          orderBy: { timestamp: 'desc' } 
        },
        _count: {
          select: { bmiData: true }
        }
      }
    });

    if (!user) {
      console.log('❌ User not found!');
      return;
    }

    console.log('👤 User Details:');
    console.log(`   Name: "${user.name}"`);
    console.log(`   Mobile: "${user.mobile}"`);
    console.log(`   ID: ${user.id}`);
    console.log(`   Total BMI Records: ${user._count.bmiData}`);
    console.log(`   Created: ${user.createdAt}`);

    if (user.bmiData.length > 0) {
      console.log('\n📊 Recent BMI Records:');
      user.bmiData.forEach((record, index) => {
        console.log(`   ${index + 1}. BMI: ${record.bmi} (${record.category})`);
        console.log(`      Weight: ${record.weightKg}kg, Height: ${record.heightCm}cm`);
        console.log(`      Date: ${record.timestamp.toLocaleDateString()}`);
        console.log(`      Screen: ${record.screenId}`);
        console.log('');
      });
    } else {
      console.log('\n❌ No BMI records found for this user!');
    }

    // Also check if there are any BMI records with this user ID
    const allBMIRecords = await prisma.bMI.findMany({
      where: { userId: user.id }
    });

    console.log(`\n🔍 Direct BMI query result: ${allBMIRecords.length} records found`);

  } catch (error) {
    console.error('❌ Error checking user:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkJohnUser();


















