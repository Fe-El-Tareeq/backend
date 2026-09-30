jest.mock("../src/features/users/users.repository");
jest.mock("../src/features/users/identityVerification.storage");
const repository = require("../src/features/users/users.repository");
const storage = require("../src/features/users/identityVerification.storage");
const service = require("../src/features/users/users.service");
const file = { mimetype: "image/jpeg", buffer: Buffer.from([255, 216, 255]) };
const files = {
  idFrontImage: [file],
  idBackImage: [file],
  selfieImage: [file],
};
beforeEach(() => {
  jest.resetAllMocks();
  repository.findUserById.mockResolvedValue({
    id: "user",
    verificationStatus: "UNVERIFIED",
  });
  repository.findPendingIdentityVerification.mockResolvedValue(null);
  repository.stageIdentityCleanup.mockResolvedValue({ id: "cleanup" });
  storage.upload.mockImplementation(async (user, label, file, path) => path);
  storage.remove.mockResolvedValue();
  repository.submitIdentityVerification.mockResolvedValue({
    verification: { id: "new", status: "PENDING_REVIEW" },
  });
});
test("reserves cleanup before uploading and links all three paths in one save", async () => {
  const result = await service.submitIdentityVerification("user", files);
  expect(result.status).toBe("PENDING_REVIEW");
  const paths = repository.stageIdentityCleanup.mock.calls[0][0];
  expect(paths).toHaveLength(3);
  expect(new Set(paths).size).toBe(3);
  expect(
    repository.stageIdentityCleanup.mock.invocationCallOrder[0],
  ).toBeLessThan(storage.upload.mock.invocationCallOrder[0]);
  expect(repository.submitIdentityVerification).toHaveBeenCalledWith(
    "user",
    {
      idFrontImagePath: paths[0],
      idBackImagePath: paths[1],
      selfieImagePath: paths[2],
    },
    "cleanup",
  );
});
test("reservation failure prevents any network uploads", async () => {
  repository.stageIdentityCleanup.mockRejectedValue(
    new Error("DB unavailable"),
  );
  await expect(
    service.submitIdentityVerification("user", files),
  ).rejects.toThrow("DB unavailable");
  expect(storage.upload).not.toHaveBeenCalled();
});
test.each(["upload", "save"])(
  "%s failure removes every reserved path, including uncertain uploads",
  async (failure) => {
    const error = new Error("unavailable");
    if (failure === "upload") storage.upload.mockRejectedValueOnce(error);
    else repository.submitIdentityVerification.mockRejectedValue(error);
    await expect(
      service.submitIdentityVerification("user", files),
    ).rejects.toBe(error);
    const paths = repository.stageIdentityCleanup.mock.calls[0][0];
    expect(storage.remove.mock.calls.map(([path]) => path)).toEqual(paths);
    if (failure === "upload")
      expect(repository.submitIdentityVerification).not.toHaveBeenCalled();
  },
);
test("failed cleanup activates the durable retry task", async () => {
  storage.upload.mockRejectedValueOnce(new Error("upload failed"));
  storage.remove.mockRejectedValue(new Error("delete failed"));
  await expect(
    service.submitIdentityVerification("user", files),
  ).rejects.toThrow("upload failed");
  expect(repository.activateIdentityCleanup).toHaveBeenCalledWith("cleanup");
});
test("unique constraint race becomes a controlled conflict and cleans up", async () => {
  repository.submitIdentityVerification.mockRejectedValue(
    Object.assign(new Error("duplicate"), { code: "P2002" }),
  );
  await expect(
    service.submitIdentityVerification("user", files),
  ).rejects.toMatchObject({ statusCode: 409 });
  expect(storage.remove).toHaveBeenCalledTimes(3);
});
test("rejected user may submit three fresh files as a new request", async () => {
  repository.findUserById.mockResolvedValue({
    id: "user",
    verificationStatus: "REJECTED",
  });
  await expect(
    service.submitIdentityVerification("user", files),
  ).resolves.toMatchObject({ id: "new", status: "PENDING_REVIEW" });
});
test.each(["VERIFIED", "PENDING_REVIEW"])(
  "%s cannot upload again",
  async (status) => {
    repository.findUserById.mockResolvedValue({
      id: "user",
      verificationStatus: status,
    });
    if (status === "PENDING_REVIEW")
      repository.findPendingIdentityVerification.mockResolvedValue({
        id: "old",
      });
    await expect(
      service.submitIdentityVerification("user", files),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(repository.stageIdentityCleanup).not.toHaveBeenCalled();
    expect(storage.upload).not.toHaveBeenCalled();
  },
);

test("lost commit response does not delete documents of the saved request", async () => {
  repository.submitIdentityVerification.mockRejectedValue(
    new Error("connection lost"),
  );
  repository.findIdentityByPaths.mockResolvedValue({
    id: "committed",
    status: "PENDING_REVIEW",
  });
  await expect(
    service.submitIdentityVerification("user", files),
  ).resolves.toMatchObject({ id: "committed" });
  expect(storage.remove).not.toHaveBeenCalled();
});
test("database outage defers cleanup instead of risking committed documents", async () => {
  repository.submitIdentityVerification.mockRejectedValue(
    new Error("connection lost"),
  );
  repository.findIdentityByPaths.mockRejectedValue(new Error("DB offline"));
  await expect(
    service.submitIdentityVerification("user", files),
  ).rejects.toThrow("connection lost");
  expect(storage.remove).not.toHaveBeenCalled();
});
