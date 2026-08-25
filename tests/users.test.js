const repository = require("../src/features/users/users.repository");
const profileImageStorage = require("../src/features/users/profileImage.storage");
const service = require("../src/features/users/users.service");
const validate = require("../src/middleware/validate.middleware");
const {
  updateProfileSchema,
} = require("../src/features/users/users.validation");

// Mock the repository so the service can be tested without accessing the real database.
jest.mock("../src/features/users/users.repository");
jest.mock("../src/features/users/profileImage.storage");

describe("User Profile Service Tests", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    profileImageStorage.remove.mockResolvedValue(undefined);
  });

  // Verifies that the authenticated user's profile can be retrieved.
  test("Should return the current user's profile", async () => {
    const mockUser = {
      id: "user-1",
      phone: "+970599000000",
      fullName: "Farah",
      neighborhoodId: "neighborhood-1",
      profileCompleted: true,
      status: "ACTIVE",
    };

    repository.findUserById.mockResolvedValue(mockUser);

    const result = await service.getCurrentUserProfile("user-1");

    expect(repository.findUserById).toHaveBeenCalledWith("user-1");
    expect(result).toEqual(mockUser);
  });

  // Verifies that a missing user returns a 404 error.
  test("Should throw 404 when the user does not exist", async () => {
    repository.findUserById.mockResolvedValue(null);

    await expect(
      service.getCurrentUserProfile("missing-user"),
    ).rejects.toMatchObject({
      statusCode: 404,
      message: "User not found.",
    });
  });

  // Verifies that an active neighborhood can be selected when updating the profile.
  test("Should update the profile with an active neighborhood", async () => {
    const existingUser = {
      id: "user-1",
      fullName: null,
      neighborhoodId: null,
      profileCompleted: false,
    };

    const activeNeighborhood = {
      id: "550e8400-e29b-41d4-a716-446655440000",
      name: "Test Neighborhood",
      governorate: "Test Governorate",
      isActive: true,
    };

    const updatedUser = {
      ...existingUser,
      fullName: "Farah",
      neighborhoodId: activeNeighborhood.id,
      profileCompleted: true,
    };

    repository.findUserById.mockResolvedValue(existingUser);
    repository.findActiveNeighborhoodById.mockResolvedValue(activeNeighborhood);
    repository.updateUserProfile.mockResolvedValue(updatedUser);

    const result = await service.updateCurrentUserProfile("user-1", {
      fullName: "Farah",
      neighborhoodId: activeNeighborhood.id,
    });

    expect(repository.findActiveNeighborhoodById).toHaveBeenCalledWith(
      activeNeighborhood.id,
    );

    expect(repository.updateUserProfile).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({
        fullName: "Farah",
        neighborhoodId: activeNeighborhood.id,
        profileCompleted: true,
      }),
    );

    expect(result.profileCompleted).toBe(true);
  });

  // Verifies that an invalid or inactive neighborhood cannot be selected.
  test("Should reject an invalid or inactive neighborhood", async () => {
    repository.findUserById.mockResolvedValue({
      id: "user-1",
      fullName: "Farah",
      neighborhoodId: null,
      profileCompleted: false,
    });

    repository.findActiveNeighborhoodById.mockResolvedValue(null);

    await expect(
      service.updateCurrentUserProfile("user-1", {
        neighborhoodId: "550e8400-e29b-41d4-a716-446655440000",
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: "Selected neighborhood does not exist or is inactive.",
    });

    expect(repository.updateUserProfile).not.toHaveBeenCalled();
  });

  // Verifies that the profile remains incomplete when required profile data is missing.
  test("Should keep profileCompleted false when profile data is incomplete", async () => {
    repository.findUserById.mockResolvedValue({
      id: "user-1",
      fullName: null,
      neighborhoodId: null,
      profileCompleted: false,
    });

    repository.updateUserProfile.mockResolvedValue({
      id: "user-1",
      fullName: "Farah",
      neighborhoodId: null,
      profileCompleted: false,
    });

    const result = await service.updateCurrentUserProfile("user-1", {
      fullName: "Farah",
    });

    expect(repository.updateUserProfile).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({
        fullName: "Farah",
        profileCompleted: false,
      }),
    );

    expect(result.profileCompleted).toBe(false);
  });

  test("Should upload a new profile image and persist its URL and path", async () => {
    repository.findUserById.mockResolvedValue({ id: "user-1", profileImagePath: null });
    profileImageStorage.upload.mockResolvedValue({ path: "user-1/new.jpg", url: "https://example.com/new.jpg" });
    repository.updateProfileImage.mockResolvedValue({ id: "user-1", profileImageUrl: "https://example.com/new.jpg" });

    const image = { mimetype: "image/jpeg", buffer: Buffer.from([0xff, 0xd8, 0xff]) };
    const result = await service.updateCurrentUserProfileImage("user-1", image);

    expect(profileImageStorage.upload).toHaveBeenCalledWith("user-1", image);
    expect(repository.updateProfileImage).toHaveBeenCalledWith("user-1", "https://example.com/new.jpg", "user-1/new.jpg");
    expect(result.profileImageUrl).toBe("https://example.com/new.jpg");
  });

  test("Should remove the old stored image after replacing it", async () => {
    repository.findUserById.mockResolvedValue({ id: "user-1", profileImagePath: "user-1/old.jpg" });
    profileImageStorage.upload.mockResolvedValue({ path: "user-1/new.jpg", url: "https://example.com/new.jpg" });
    repository.updateProfileImage.mockResolvedValue({ id: "user-1" });

    await service.updateCurrentUserProfileImage("user-1", { mimetype: "image/jpeg", buffer: Buffer.alloc(3) });
    expect(profileImageStorage.remove).toHaveBeenCalledWith("user-1/old.jpg");
  });

  test("Should clear the database image and remove the stored object", async () => {
    repository.findUserById.mockResolvedValue({ id: "user-1", profileImagePath: "user-1/old.jpg" });
    repository.updateProfileImage.mockResolvedValue({ id: "user-1", profileImageUrl: null });

    const result = await service.deleteCurrentUserProfileImage("user-1");
    expect(repository.updateProfileImage).toHaveBeenCalledWith("user-1", null, null);
    expect(profileImageStorage.remove).toHaveBeenCalledWith("user-1/old.jpg");
    expect(result.profileImageUrl).toBeNull();
  });
  describe("User Profile Validation Tests", () => {
    // Verifies that a valid full name passes validation.
    test("Should accept a valid fullName", () => {
      const req = {
        body: {
          fullName: "Farah Abuassi",
        },
        params: {},
        query: {},
      };

      const res = {};
      const next = jest.fn();

      validate(updateProfileSchema)(req, res, next);

      expect(next).toHaveBeenCalledWith();
      expect(req.validatedData.body.fullName).toBe("Farah Abuassi");
    });

    // Verifies that a full name shorter than the allowed minimum is rejected.
    test("Should reject a short fullName", () => {
      const req = {
        body: {
          fullName: "F",
        },
        params: {},
        query: {},
      };

      const res = {};
      const next = jest.fn();

      validate(updateProfileSchema)(req, res, next);

      const error = next.mock.calls[0][0];

      expect(error.statusCode).toBe(400);
      expect(error.message).toBe("Validation failed");
      expect(error.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: "body.fullName",
          }),
        ]),
      );
    });

    // Verifies that neighborhoodId must be a valid UUID.
    test("Should reject an invalid neighborhoodId", () => {
      const req = {
        body: {
          neighborhoodId: "invalid-id",
        },
        params: {},
        query: {},
      };

      const res = {};
      const next = jest.fn();

      validate(updateProfileSchema)(req, res, next);

      const error = next.mock.calls[0][0];

      expect(error.statusCode).toBe(400);
      expect(error.message).toBe("Validation failed");
      expect(error.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: "body.neighborhoodId",
          }),
        ]),
      );
    });

    // Verifies that an empty update request is rejected.
    test("Should reject an empty profile update", () => {
      const req = {
        body: {},
        params: {},
        query: {},
      };

      const res = {};
      const next = jest.fn();

      validate(updateProfileSchema)(req, res, next);

      const error = next.mock.calls[0][0];

      expect(error.statusCode).toBe(400);
      expect(error.message).toBe("Validation failed");
    });
  });
});
