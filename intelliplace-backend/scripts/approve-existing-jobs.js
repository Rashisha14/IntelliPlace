import prisma from '../lib/prisma.js';

const result = await prisma.job.updateMany({
  where: {},
  data: { adminApproved: true }
});

console.log(`✅ Updated ${result.count} existing jobs → adminApproved = true`);
await prisma.$disconnect();
