const prisma = require("../config/prisma");
const env = require("../config/env");
const profileImageStorage = require("../features/users/profileImage.storage");

const permanentlyDeleteAccount = async (user) => {
  if (user.profileImagePath) {
    await profileImageStorage.remove(user.profileImagePath);
  }

  return prisma.$transaction((tx) =>
    tx.user.delete({
      where: {
        id: user.id,
      },
      select: { id: true },
    }),
  );
};

const runAccountDeletionCleanup = async () => {
  const dueUsers = await prisma.user.findMany({
    where: {
      status: "DEACTIVATED",
      deletionScheduledAt: { lte: new Date() },
    },
    select: { id: true, profileImagePath: true },
    take: 100,
  });

  const results = await Promise.allSettled(
    dueUsers.map(permanentlyDeleteAccount),
  );
  results.forEach((result, index) => {
    if (result.status === "rejected") {
      console.error(
        `Failed to erase personal data for user ${dueUsers[index].id}:`,
        result.reason?.message || result.reason,
      );
    }
  });
  return {
    checked: dueUsers.length,
    erased: results.filter((x) => x.status === "fulfilled").length,
  };
};

const startAccountDeletionCleanup = () => {
  const run = () =>
    runAccountDeletionCleanup().catch((error) => {
      console.error("Account deletion cleanup failed:", error.message);
    });
  run();
  const timer = setInterval(run, env.accountDeletionCleanupIntervalMs);
  timer.unref();
  return timer;
};

module.exports = {
  permanentlyDeleteAccount,
  runAccountDeletionCleanup,
  startAccountDeletionCleanup,
};
