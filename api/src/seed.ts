import bcrypt from 'bcryptjs';
import { prisma } from './lib/prisma.js';

async function main() {
  const companyName = process.env.COMPANY_NAME || 'Renace Tech';
  const email = (process.env.ADMIN_EMAIL || 'info@renace.tech').toLowerCase();
  const password = process.env.ADMIN_PASSWORD || 'RenaceNomina2026!';
  const slugBase = companyName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'renace';

  let company = await prisma.company.findFirst({
    where: { OR: [{ name: companyName }, { slug: slugBase }] },
  });
  if (!company) {
    company = await prisma.company.create({
      data: {
        name: companyName,
        slug: slugBase,
        rnc: '132842316',
        smtpFromName: `Nomina · ${companyName}`,
      },
    });
  } else if (!company.slug) {
    company = await prisma.company.update({
      where: { id: company.id },
      data: { slug: slugBase },
    });
  }

  const hash = await bcrypt.hash(password, 10);
  await prisma.user.upsert({
    where: { email },
    update: { passwordHash: hash, companyId: company.id, role: 'admin', name: 'Admin Nomina' },
    create: {
      email,
      name: 'Admin Nomina',
      passwordHash: hash,
      role: 'admin',
      companyId: company.id,
    },
  });

  let structure = await prisma.salaryStructure.findFirst({
    where: { companyId: company.id, code: 'STD' },
  });
  if (!structure) {
    structure = await prisma.salaryStructure.create({
      data: {
        companyId: company.id,
        name: 'Estructura estándar RD',
        code: 'STD',
        rules: {
          create: [
            { name: 'AFP (empleado)', code: 'AFP', sequence: 20, category: 'deduction', amountType: 'percent', amount: 2.87 },
            { name: 'SFS (empleado)', code: 'SFS', sequence: 30, category: 'deduction', amountType: 'percent', amount: 3.04 },
          ],
        },
      },
    });
  }

  console.log(
    JSON.stringify(
      {
        company: company.name,
        slug: company.slug,
        admin: email,
        structure: structure.code,
        login: `${process.env.PUBLIC_SITE_URL || 'https://nomina.renace.tech'}/login`,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
