const { PrismaClient } = require('@prisma/client');
const { v4: uuidv4 } = require('uuid');

const prisma = new PrismaClient();

async function insertDiverseData() {
  try {
    console.log('🚀 Creating diverse mock data...');

    // Create multiple test users with different patterns
    const users = [
      { name: 'Sarah Wilson', mobile: '+1234567891', pattern: 'weight_loss' },
      { name: 'Mike Johnson', mobile: '+1234567892', pattern: 'weight_gain' },
      { name: 'Emma Davis', mobile: '+1234567893', pattern: 'fluctuating' }
    ];

    for (const userData of users) {
      console.log(`\n👤 Creating user: ${userData.name}`);
      
      // Create or find user
      let user = await prisma.user.findFirst({
        where: { mobile: userData.mobile }
      });

      if (!user) {
        user = await prisma.user.create({
          data: {
            name: userData.name,
            mobile: userData.mobile
          }
        });
      }

      // Create screen
      const screenId = `test-screen-${userData.mobile.slice(-3)}`;
      await prisma.screen.upsert({
        where: { id: screenId },
        create: { id: screenId },
        update: {}
      });

      // Delete existing data
      await prisma.bMI.deleteMany({
        where: { userId: user.id }
      });

      // Generate data based on pattern
      const mockData = [];
      const today = new Date();
      const height = 170; // Fixed height for consistency

      for (let daysAgo = 60; daysAgo >= 0; daysAgo--) {
        // Skip some days randomly to create realistic gaps
        if (Math.random() < 0.3) continue; // 30% chance to skip a day

        const date = new Date(today);
        date.setDate(date.getDate() - daysAgo);

        let weight;
        switch (userData.pattern) {
          case 'weight_loss':
            // Gradual weight loss from 80kg to 65kg
            weight = 80 - (daysAgo / 60) * 15 + (Math.random() - 0.5) * 2;
            break;
          case 'weight_gain':
            // Gradual weight gain from 60kg to 75kg
            weight = 60 + (daysAgo / 60) * 15 + (Math.random() - 0.5) * 2;
            break;
          case 'fluctuating':
            // Fluctuating weight around 70kg
            weight = 70 + Math.sin(daysAgo / 10) * 5 + (Math.random() - 0.5) * 3;
            break;
        }

        weight = Math.max(50, Math.min(100, weight)); // Keep within reasonable bounds
        const bmi = Number((weight / ((height / 100) ** 2)).toFixed(1));

        let category = 'Normal';
        if (bmi < 18.5) category = 'Underweight';
        else if (bmi < 25) category = 'Normal';
        else if (bmi < 30) category = 'Overweight';
        else category = 'Obese';

        const devices = ['smart-scale-001', 'gym-scale-002', 'clinic-scale-003', 'home-scale-004'];
        const locations = ['Home', 'Gym', 'Clinic', 'Office'];
        const appVersions = ['f1', 'f2', 'web-direct'];
        
        const deviceIndex = Math.floor(Math.random() * devices.length);

        mockData.push({
          id: uuidv4(),
          screenId: screenId,
          userId: user.id,
          heightCm: height,
          weightKg: Number(weight.toFixed(1)),
          bmi: bmi,
          category: category,
          timestamp: date,
          deviceId: devices[deviceIndex],
          appVersion: appVersions[Math.floor(Math.random() * appVersions.length)],
          location: locations[deviceIndex]
        });
      }

      // Insert data
      await prisma.bMI.createMany({
        data: mockData
      });

      console.log(`✅ Created ${mockData.length} records for ${userData.name}`);
      console.log(`📊 User ID: ${user.id}`);
      
      // Show pattern info
      const weights = mockData.map(d => d.weightKg);
      const bmis = mockData.map(d => d.bmi);
      console.log(`📈 Weight: ${Math.min(...weights).toFixed(1)} - ${Math.max(...weights).toFixed(1)} kg`);
      console.log(`📈 BMI: ${Math.min(...bmis)} - ${Math.max(...bmis)}`);
      
      const categories = {};
      mockData.forEach(d => {
        categories[d.category] = (categories[d.category] || 0) + 1;
      });
      console.log(`📊 Categories:`, categories);
    }

    console.log('\n🎉 All diverse mock data created successfully!');
    console.log('\n🔗 Test URLs:');
    users.forEach(userData => {
      console.log(`${userData.name}: http://localhost:5174/analytics?userId=USER_ID`);
      console.log(`  Login: ${userData.name} / ${userData.mobile}`);
    });

  } catch (error) {
    console.error('❌ Error creating diverse data:', error);
  } finally {
    await prisma.$disconnect();
  }
}

insertDiverseData();




















