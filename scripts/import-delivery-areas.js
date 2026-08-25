require("dotenv").config();

const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
const areasConfig = require("../src/data/gaza-areas.json");

const adapter = new PrismaPg({ connectionString: process.env.DIRECT_URL });
const prisma = new PrismaClient({ adapter });

const main = async () => {
  let imported = 0;
  for (const zone of areasConfig.zones) {
    for (const area of zone.areas) {
      await prisma.neighborhood.upsert({
        where: { key: area.key },
        update: {
          name: area.nameAr,
          governorate: zone.nameAr,
          isActive: true,
        },
        create: {
          key: area.key,
          name: area.nameAr,
          governorate: zone.nameAr,
          isActive: true,
        },
      });
      imported += 1;
    }
  }
  console.log(`Imported ${imported} delivery neighborhoods.`);
};

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
