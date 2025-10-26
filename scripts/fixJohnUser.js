const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function fixJohnUser() {
  try {
    console.log('🔧 Fixing John user details...\n');

    // Update the John user to have the expected name and mobile
    const updatedUser = await prisma.user.update({
      where: { id: '0381c68c-987d-4794-9649-dfd5c00ffd3c' },
      data: {
        name: 'John Doe',
        mobile: '+1234567890'
      }
    });

    console.log('✅ Updated John user:');
    console.log(`   Name: "${updatedUser.name}"`);
    console.log(`   Mobile: "${updatedUser.mobile}"`);
    console.log(`   ID: ${updatedUser.id}`);

    // Check BMI records count
    const bmiCount = await prisma.bMI.count({
      where: { userId: updatedUser.id }
    });

    console.log(`   BMI Records: ${bmiCount}`);

    console.log('\n🎉 John Doe user is now ready for testing!');
    console.log('\n🔗 Test Instructions:');
    console.log('1. Visit: http://localhost:5174/');
    console.log('2. Enter Name: "John Doe"');
    console.log('3. Enter Mobile: "+1234567890"');
    console.log('4. Click "Login to Dashboard"');
    console.log('5. Should see analytics with 18 BMI records!');
    
    console.log(`\n📊 Direct Analytics URL:`);
    console.log(`http://localhost:5174/analytics?userId=${updatedUser.id}`);

  } catch (error) {
    console.error('❌ Error fixing user:', error);
  } finally {
    await prisma.$disconnect();
  }
}

fixJohnUser();


















