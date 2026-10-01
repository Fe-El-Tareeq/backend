process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://test";
process.env.DIRECT_URL = process.env.DIRECT_URL || "postgresql://test";
process.env.NODE_ENV = "test";

jest.mock("../src/config/prisma", () => ({
  trip: { findUnique: jest.fn() },
}));

const prisma = require("../src/config/prisma");
const repository = require("../src/features/trips/trips.repository");

test("loads the complete checklist graph with one focused Prisma query", async () => {
  const trip = { id: "trip-id", travelerId: "traveler-id", assignments: [] };
  prisma.trip.findUnique.mockResolvedValue(trip);

  await expect(repository.findChecklistById("trip-id")).resolves.toBe(trip);
  expect(prisma.trip.findUnique).toHaveBeenCalledTimes(1);
  expect(prisma.trip.findUnique).toHaveBeenCalledWith(
    expect.objectContaining({
      where: { id: "trip-id" },
      select: expect.objectContaining({
        id: true,
        travelerId: true,
        assignments: expect.objectContaining({
          select: expect.objectContaining({
            id: true,
            status: true,
            errand: expect.objectContaining({
              select: expect.objectContaining({
                id: true,
                items: expect.objectContaining({
                  select: expect.objectContaining({
                    id: true,
                    category: {
                      select: { id: true, name: true, icon: true },
                    },
                  }),
                }),
              }),
            }),
          }),
        }),
      }),
    }),
  );
});
