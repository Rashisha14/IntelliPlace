import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
});

// Test database connection on startup with retries
(async () => {
  let retries = 5;
  while (retries > 0) {
    try {
      await prisma.$connect();
      console.log('✅ Database connected successfully');
      return;
    } catch (error) {
      retries--;
      console.error(`❌ Database connection failed (retries left: ${retries}):`, error.message);
      if (retries === 0) {
        if (error.code === 'P1001') {
          console.error('\n⚠️  Database Connection Troubleshooting:');
          console.error('1. Check if Neon database is paused - visit Neon Console to wake it up');
          console.error('2. Verify DATABASE_URL in .env file is correct');
          console.error('3. Ensure DATABASE_URL includes ?sslmode=require for Neon');
          console.error('4. Check network connectivity (try a more stable connection than a hotspot)');
          console.error('5. Verify database credentials are valid\n');
        }
      } else {
        // Wait 2 seconds before retrying
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
  }
})();

// Handle graceful shutdown
process.on('beforeExit', async () => {
  await prisma.$disconnect();
});

export default prisma;

