const { PrismaClient } = require('@prisma/client');
const { v4: uuidv4 } = require('uuid');

const prisma = new PrismaClient();

async function insertMockData() {
  try {
    console.log('🚀 Starting mock data insertion...');

    // Create or find a test user
    let testUser = await prisma.user.findFirst({
      where: { mobile: '+1234567890' }
    });

    if (!testUser) {
      testUser = await prisma.user.create({
        data: {
          name: 'John Doe',
          mobile: '+1234567890'
        }
      });
      console.log('✅ Created test user:', testUser.id);
    } else {
      console.log('✅ Found existing test user:', testUser.id);
    }

    // Create test screen
    const screenId = 'test-screen-001';
    await prisma.screen.upsert({
      where: { id: screenId },
      create: { id: screenId },
      update: {}
    });

    // Generate mock BMI data for the last 45 days
    const mockData = [];
    const today = new Date();
    
    // Create data for different patterns to test streak logic
    const dates = [];
    
    // Add some consecutive days (streak of 7)
    for (let i = 6; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      dates.push(date);
    }
    
    // Skip 2 days (break streak)
    
    // Add another streak of 3 days
    for (let i = 12; i >= 10; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      dates.push(date);
    }
    
    // Skip 1 day
    
    // Add scattered historical data
    const historicalDays = [15, 18, 22, 25, 30, 35, 40, 45];
    historicalDays.forEach(daysAgo => {
      const date = new Date(today);
      date.setDate(date.getDate() - daysAgo);
      dates.push(date);
    });

    // Generate BMI records for each date
    for (let i = 0; i < dates.length; i++) {
      const date = dates[i];
      
      // Simulate weight fluctuation (65-75 kg)
      const baseWeight = 70;
      const weightVariation = (Math.random() - 0.5) * 10; // ±5 kg
      const weight = Math.max(60, Math.min(80, baseWeight + weightVariation));
      
      // Fixed height
      const height = 175;
      
      // Calculate BMI
      const bmi = Number((weight / ((height / 100) ** 2)).toFixed(1));
      
      // Determine category
      let category = 'Normal';
      if (bmi < 18.5) category = 'Underweight';
      else if (bmi < 25) category = 'Normal';
      else if (bmi < 30) category = 'Overweight';
      else category = 'Obese';

      // Simulate different devices/locations
      const devices = ['gym-scale-001', 'home-scale-002', 'clinic-scale-003', 'mobile-app-001'];
      const locations = ['Home Gym', 'Fitness Center', 'Medical Clinic', 'Office Wellness Room'];
      const appVersions = ['f1', 'f2', 'web-direct'];
      
      const deviceIndex = Math.floor(Math.random() * devices.length);
      
      mockData.push({
        id: uuidv4(),
        screenId: screenId,
        userId: testUser.id,
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

    // Insert all mock data
    console.log(`📊 Inserting ${mockData.length} BMI records...`);
    
    // Delete existing test data first
    await prisma.bMI.deleteMany({
      where: { userId: testUser.id }
    });
    
    // Insert new mock data
    await prisma.bMI.createMany({
      data: mockData
    });

    console.log('✅ Mock data inserted successfully!');
    console.log(`📈 Created ${mockData.length} BMI records for user: ${testUser.name}`);
    console.log(`👤 User ID: ${testUser.id}`);
    console.log(`📱 Mobile: ${testUser.mobile}`);
    
    // Calculate and display streak info
    const sortedData = mockData.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    console.log('\n📊 Sample Data Overview:');
    console.log(`Latest BMI: ${sortedData[0].bmi} (${sortedData[0].category})`);
    console.log(`Weight Range: ${Math.min(...mockData.map(d => d.weightKg))} - ${Math.max(...mockData.map(d => d.weightKg))} kg`);
    console.log(`BMI Range: ${Math.min(...mockData.map(d => d.bmi))} - ${Math.max(...mockData.map(d => d.bmi))}`);
    
    // Category distribution
    const categories = {};
    mockData.forEach(d => {
      categories[d.category] = (categories[d.category] || 0) + 1;
    });
    console.log('Category Distribution:', categories);
    
    console.log('\n🔗 Test URLs:');
    console.log(`Analytics: http://localhost:5174/analytics?userId=${testUser.id}`);
    console.log(`Dashboard: http://localhost:5174/dashboard`);
    console.log('\n💡 Login credentials for testing:');
    console.log(`Name: ${testUser.name}`);
    console.log(`Mobile: ${testUser.mobile}`);

  } catch (error) {
    console.error('❌ Error inserting mock data:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
insertMockData();




















