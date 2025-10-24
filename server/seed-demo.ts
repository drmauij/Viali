/**
 * Seed Demo User and Hospital
 * 
 * This script creates a demo user (demo@viali.app) with a demo hospital.
 * Run with: NODE_ENV=development tsx server/seed-demo.ts
 */

import { db } from './db.js';
import bcrypt from 'bcrypt';
import { users, hospitals, userHospitalRoles } from '../shared/schema.js';
import { eq } from 'drizzle-orm';
import { seedHospitalData } from './seed-hospital.js';

const DEMO_EMAIL = 'demo@viali.app';
const DEMO_PASSWORD = 'demo123';
const DEMO_FIRST_NAME = 'Demo';
const DEMO_LAST_NAME = 'User';
const DEMO_HOSPITAL_NAME = 'Demo Hospital';

async function seedDemoUser() {
  console.log('🌱 Starting demo user seeding...');
  
  try {
    // Check if demo user already exists
    const existingUser = await db
      .select()
      .from(users)
      .where(eq(users.email, DEMO_EMAIL))
      .limit(1);

    if (existingUser.length > 0) {
      console.log('✅ Demo user already exists:', DEMO_EMAIL);
      const user = existingUser[0];
      
      // Get hospital for this user
      const userRoles = await db
        .select({ hospitalId: userHospitalRoles.hospitalId })
        .from(userHospitalRoles)
        .where(eq(userHospitalRoles.userId, user.id))
        .limit(1);
        
      if (userRoles.length > 0) {
        const hospitalData = await db
          .select()
          .from(hospitals)
          .where(eq(hospitals.id, userRoles[0].hospitalId))
          .limit(1);
          
        if (hospitalData.length > 0) {
          console.log('✅ Demo hospital:', hospitalData[0].name);
        }
      }
      
      console.log('✨ Demo user is ready to use!');
      process.exit(0);
    }

    // Hash password
    console.log('🔐 Hashing password...');
    const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

    // Create demo user
    console.log('👤 Creating demo user...');
    const newUser = await db
      .insert(users)
      .values({
        email: DEMO_EMAIL,
        firstName: DEMO_FIRST_NAME,
        lastName: DEMO_LAST_NAME,
        passwordHash,
        mustChangePassword: false,
      })
      .returning();

    const user = newUser[0];
    console.log('✅ Created user:', user.email);

    // Create demo hospital
    console.log('🏥 Creating demo hospital...');
    const newHospital = await db
      .insert(hospitals)
      .values({
        name: DEMO_HOSPITAL_NAME,
        licenseType: 'free',
      })
      .returning();

    const hospital = newHospital[0];
    console.log('✅ Created hospital:', hospital.name);

    // Seed hospital with default data (locations, surgery rooms, admin groups, medications)
    console.log('🌱 Seeding hospital with default data...');
    await seedHospitalData(hospital.id, user.id);
    console.log('✅ Hospital seeded with default data');

    console.log('\n🎉 Demo user setup complete!');
    console.log('\n📝 Demo Credentials:');
    console.log(`   Email: ${DEMO_EMAIL}`);
    console.log(`   Password: ${DEMO_PASSWORD}`);
    console.log('\n✨ You can now use the "Try Demo" button on the login page!');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding demo user:', error);
    process.exit(1);
  }
}

// Run the seed function
seedDemoUser();
