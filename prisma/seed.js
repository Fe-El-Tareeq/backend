require("dotenv").config();

const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
const areasConfig = require("../src/data/gaza-areas.json");

const adapter = new PrismaPg({
  connectionString: process.env.DIRECT_URL,
});

const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("Starting database seed...");

  // Neighborhoods
  const neighborhoods = areasConfig.zones.flatMap((zone) =>
    zone.areas.map((area) => ({
      key: area.key,
      name: area.nameAr,
      governorate: zone.nameAr,
    })),
  );

  for (const neighborhood of neighborhoods) {
    await prisma.neighborhood.upsert({
      where: { key: neighborhood.key },
      update: {
        name: neighborhood.name,
        governorate: neighborhood.governorate,
        isActive: true,
      },
      create: {
        key: neighborhood.key,
        name: neighborhood.name,
        governorate: neighborhood.governorate,
        isActive: true,
      },
    });
  }

  console.log("Neighborhoods seeded successfully.");

  // Categories
  const categories = [
    {
      name: "Medicine",
      priorityWeight: 5,
      icon: "medicine",
      isActive: true,
    },
    {
      name: "Groceries",
      priorityWeight: 4,
      icon: "groceries",
      isActive: true,
    },
    {
      name: "Baby Supplies",
      priorityWeight: 5,
      icon: "baby-supplies",
      isActive: true,
    },
    {
      name: "Water",
      priorityWeight: 5,
      icon: "water",
      isActive: true,
    },
    {
      name: "Documents",
      priorityWeight: 3,
      icon: "documents",
      isActive: true,
    },
    {
      name: "Parcel",
      priorityWeight: 3,
      icon: "parcel",
      isActive: true,
    },
    {
      name: "Clothes",
      priorityWeight: 2,
      icon: "clothes",
      isActive: true,
    },
    {
      name: "Household Supplies",
      priorityWeight: 3,
      icon: "household-supplies",
      isActive: true,
    },
    {
      name: "Electronics",
      priorityWeight: 2,
      icon: "electronics",
      isActive: true,
    },
    {
      name: "Other",
      priorityWeight: 1,
      icon: "other",
      isActive: true,
    },
  ];

  for (const category of categories) {
    await prisma.category.upsert({
      where: {
        name: category.name,
      },
      update: {
        priorityWeight: category.priorityWeight,
        icon: category.icon,
        isActive: category.isActive,
      },
      create: category,
    });
  }

  console.log("Categories seeded successfully.");

  // Token Packages
  // Retire the previous catalog while retaining rows referenced by old invoices.
  await prisma.tokenPackage.updateMany({
    where: { name: { in: ["Starter", "Standard", "Value"] } },
    data: { isActive: false },
  });

  const tokenPackages = [
    {
      name: "الأساسية",
      tokenAmount: 10,
      bonusTokens: 2,
      priceNis: 5,
      discountPercentage: 0,
      features: ["10 توكنز + 2 هدية"],
      savingsText: "تحصل على توكنزين هدية",
      hasSearchPriority: false,
      isActive: true,
    },
    {
      name: "المتوسطة",
      tokenAmount: 25,
      bonusTokens: 0,
      priceNis: 10,
      discountPercentage: 20,
      features: ["خصم 20%"],
      savingsText: "وفّر 2.5 ₪",
      hasSearchPriority: false,
      isActive: true,
    },
    {
      name: "الاحترافية",
      tokenAmount: 50,
      bonusTokens: 0,
      priceNis: 15,
      discountPercentage: 40,
      features: ["خصم 40%", "أولوية في البحث"],
      savingsText: "وفّر 10 ₪",
      hasSearchPriority: true,
      isActive: true,
    },
    {
      name: "المؤسسية",
      tokenAmount: 100,
      bonusTokens: 0,
      priceNis: 25,
      discountPercentage: 50,
      features: ["خصم 50%", "أولوية في البحث"],
      savingsText: "وفّر 25 ₪",
      hasSearchPriority: true,
      isActive: true,
    },
  ];

  for (const tokenPackage of tokenPackages) {
    const { name, ...data } = tokenPackage;
    await prisma.tokenPackage.upsert({
      where: { name },
      update: data,
      create: tokenPackage,
    });
  }

  // Badges
  const badges = [
    {
      name: "First Delivery",
      description: "Awarded after completing the first delivery.",
      icon: "first-delivery",
      isActive: true,
    },
    {
      name: "Trusted Traveler",
      description: "Awarded to travelers with a strong trust record.",
      icon: "trusted-traveler",
      isActive: true,
    },
    {
      name: "Helpful Neighbor",
      description: "Awarded for consistently helping users in the community.",
      icon: "helpful-neighbor",
      isActive: true,
    },
    {
      name: "Top Rated",
      description: "Awarded to users who maintain excellent ratings.",
      icon: "top-rated",
      isActive: true,
    },
  ];

  for (const badge of badges) {
    await prisma.badge.upsert({
      where: {
        name: badge.name,
      },
      update: {
        description: badge.description,
        icon: badge.icon,
        isActive: badge.isActive,
      },
      create: badge,
    });
  }

  console.log("Badges seeded successfully.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
