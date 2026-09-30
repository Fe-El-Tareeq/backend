const prisma = require("../config/prisma");
const storage = require("../features/users/identityVerification.storage");
let running = false;

const runIdentityDocumentCleanup = async () => {
  if (running) return { checked: 0, deleted: 0 };
  running = true;
  try {
    const now = new Date();
    const tasks = await prisma.identityDocumentCleanup.findMany({
      where: { nextAttemptAt: { lte: now } },
      orderBy: [{ nextAttemptAt: "asc" }, { id: "asc" }],
      take: 20,
    });
    let deleted = 0;
    for (const task of tasks) {
      // A durable lease prevents simultaneous workers from claiming this task.
      const claim = await prisma.identityDocumentCleanup.updateMany({
        where: { id: task.id, nextAttemptAt: task.nextAttemptAt },
        data: {
          nextAttemptAt: new Date(Date.now() + 10 * 60 * 1000),
          attempts: { increment: 1 },
        },
      });
      if (claim.count !== 1) continue;
      try {
        const linked = await prisma.identityVerification.findFirst({
          where: {
            OR: [
              { idFrontImagePath: { in: task.paths } },
              { idBackImagePath: { in: task.paths } },
              { selfieImagePath: { in: task.paths } },
            ],
            ...(task.verificationId ? { id: task.verificationId } : {}),
          },
          select: { id: true, status: true },
        });
        if (linked && (!task.verificationId || linked.status !== "REJECTED")) {
          // A saved or approved request owns these files; discard stale cleanup.
          await prisma.identityDocumentCleanup.deleteMany({
            where: { id: task.id },
          });
          continue;
        }
        const results = await Promise.allSettled(
          task.paths.map((path) => storage.remove(path)),
        );
        if (results.some((result) => result.status === "rejected")) continue;
        await prisma.$transaction(async (tx) => {
          if (task.verificationId) {
            await tx.identityVerification.updateMany({
              where: {
                id: task.verificationId,
                status: "REJECTED",
                documentsDeletedAt: null,
              },
              data: {
                idFrontImagePath: null,
                idBackImagePath: null,
                selfieImagePath: null,
                documentsDeletedAt: new Date(),
              },
            });
          }
          await tx.identityDocumentCleanup.deleteMany({
            where: { id: task.id },
          });
        });
        deleted += 1;
      } catch {
        // Keep the leased task; it becomes eligible again after the retry delay.
        console.error("Identity document cleanup will retry task:", task.id);
      }
    }
    return { checked: tasks.length, deleted };
  } finally {
    running = false;
  }
};

const startIdentityDocumentCleanup = () => {
  const run = () =>
    runIdentityDocumentCleanup().catch(() => {
      console.error("Identity document cleanup could not access its queue.");
    });
  run();
  const timer = setInterval(run, 60000);
  timer.unref();
  return timer;
};
module.exports = { runIdentityDocumentCleanup, startIdentityDocumentCleanup };
