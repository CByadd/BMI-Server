const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function cleanupUsers() {
  try {
    console.log('🧹 Cleaning up duplicate users...\n');

    // Find all users
    const allUsers = await prisma.user.findMany({
      include: { 
        _count: { select: { bmiData: true } }
      },
      orderBy: { createdAt: 'asc' }
    });

    console.log(`Found ${allUsers.length} total users:`);
    
    const usersToDelete = [];
    
    allUsers.forEach((user, index) => {
      console.log(`${index + 1}. ${user.name} (${user.mobile}) - ${user._count.bmiData} BMI records`);
      
      // Mark users with no BMI data and similar names for potential deletion
      if (user._count.bmiData === 0 && 
          (user.name.includes('John') || user.name.includes('Doe')) &&
          user.id !== '0381c68c-987d-4794-9649-dfd5c00ffd3c') {
        usersToDelete.push(user);
      }
    });

    if (usersToDelete.length > 0) {
      console.log(`\n🗑️ Found ${usersToDelete.length} users to delete (no BMI data):`);
      
      for (const user of usersToDelete) {
        console.log(`   Deleting: ${user.name} (${user.mobile})`);
        await prisma.user.delete({ where: { id: user.id } });
      }
      
      console.log('✅ Cleanup completed!');
    } else {
      console.log('\n✅ No duplicate users found to clean up.');
    }

    // Show final user list
    console.log('\n📋 Final user list:');
    const finalUsers = await prisma.user.findMany({
      include: { _count: { select: { bmiData: true } } }
    });
    
    finalUsers.forEach((user, index) => {
      console.log(`${index + 1}. ${user.name} (${user.mobile}) - ${user._count.bmiData} records`);
    });

  } catch (error) {
    console.error('❌ Error during cleanup:', error);
  } finally {
    await prisma.$disconnect();
  }
}

cleanupUsers();


















