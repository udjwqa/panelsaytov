import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import bcryptjs from 'bcryptjs';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  // User 1: admin
  const adminHash = await bcryptjs.hash('Xk9$mPw2#Qz7!nR', 12);
  const admin = await prisma.user.upsert({
    where: { username: 'admin' },
    update: { passwordHash: adminHash },
    create: {
      username: 'admin',
      passwordHash: adminHash,
      role: 'ADMIN',
      totpEnabled: false,
    },
  });
  console.log(`User created: ${admin.username} (role: ADMIN)`);

  // User 2: operator1
  const op1Hash = await bcryptjs.hash('Bv4&tLy8@Jf3^hW', 12);
  const operator1 = await prisma.user.upsert({
    where: { username: 'operator1' },
    update: { passwordHash: op1Hash },
    create: {
      username: 'operator1',
      passwordHash: op1Hash,
      role: 'ADMIN',
      totpEnabled: false,
    },
  });
  console.log(`User created: ${operator1.username} (role: ADMIN)`);

  // User 3: manager
  const managerHash = await bcryptjs.hash('Cs6*dNq5!Kg2#rT', 12);
  const manager = await prisma.user.upsert({
    where: { username: 'manager' },
    update: { passwordHash: managerHash },
    create: {
      username: 'manager',
      passwordHash: managerHash,
      role: 'ADMIN',
      totpEnabled: false,
    },
  });
  console.log(`User created: ${manager.username} (role: ADMIN)`);

  // Delete old users if exist
  for (const oldUsername of ['xK7_sysroot_4dm', 'n3_opnode_7rx']) {
    const oldUser = await prisma.user.findUnique({ where: { username: oldUsername } });
    if (oldUser) {
      await prisma.session.deleteMany({ where: { userId: oldUser.id } });
      await prisma.user.delete({ where: { id: oldUser.id } });
      console.log(`Old user deleted: ${oldUsername}`);
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
