import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const company = await prisma.company.findFirst();
  if (!company) {
    console.error('No company found');
    return;
  }

  const job = await prisma.job.create({
    data: {
      title: 'TEST PENDING JOB',
      description: 'Testing admin approval',
      type: 'FULL_TIME',
      companyId: company.id,
      adminApproved: false
    }
  });
  console.log('Created pending job:', job.id);
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
