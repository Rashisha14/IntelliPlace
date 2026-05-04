import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const pendingJobs = await prisma.job.findMany({
    where: { adminApproved: false },
    select: { id: true, title: true }
  });
  console.log('Pending Jobs:', JSON.stringify(pendingJobs, null, 2));
  console.log('Total Pending:', pendingJobs.length);
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
