require('dotenv').config();
const prisma = require('../db');
const bcrypt = require('bcryptjs');

async function createSuperAdmin() {
  try {
    const email = process.env.SUPER_ADMIN_EMAIL || 'well2dayadmin@bmi.com';
    const password = process.env.SUPER_ADMIN_PASSWORD || 'well2dayadmin123';
    const name = process.env.SUPER_ADMIN_NAME || 'Well2Day Admin';

    // Check if super admin already exists
    const existingAdmin = await prisma.adminUser.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (existingAdmin) {
      console.log('Super admin already exists:', email);
      return;
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create super admin
    const superAdmin = await prisma.adminUser.create({
      data: {
        email: email.toLowerCase(),
        password: hashedPassword,
        name,
        role: 'super_admin',
        isActive: true,
      },
    });

    console.log('Super admin created successfully!');
    console.log('Email:', email);
    console.log('Password:', password);
    console.log('ID:', superAdmin.id);
  } catch (error) {
    console.error('Error creating super admin:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

createSuperAdmin();



