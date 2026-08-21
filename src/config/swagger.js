const swaggerJSDoc = require("swagger-jsdoc");
const env = require("./env");

const fixedOtpSwaggerNote =
  env.nodeEnv === "production" || !env.devFixedOtp
    ? ""
    : " Staging test OTP: 000000";

const apiResponse = (dataSchema, example) => ({
  type: "object",
  required: ["success", "message"],
  properties: {
    success: {
      type: "boolean",
      example: true,
    },
    message: {
      type: "string",
    },
    data: dataSchema || {
      nullable: true,
      example: null,
    },
  },
  ...(example && { example }),
});

const errorResponse = (message, errors = []) => ({
  description: message,
  content: {
    "application/json": {
      schema: {
        $ref: "#/components/schemas/ErrorResponse",
      },
      example: {
        success: false,
        message,
        errors,
      },
    },
  },
});

const swaggerDefinition = {
  openapi: "3.0.3",
  info: {
    title: "Fe El-Tareeq API",
    version: "1.0.0",
    description:
      "Interactive API contract for the Fe El-Tareeq peer-to-peer micro-errand backend. The documented endpoints cover the currently implemented health check, OTP authentication, authenticated user profile, and wallet token ledger APIs.",
  },
  servers: [
    {
      url: "/",
      description: "Current API server",
    },
  ],
  tags: [
    {
      name: "Health",
      description: "Service availability checks.",
    },
    {
      name: "Authentication",
      description:
        "Password registration/login, phone verification OTP, access-token refresh, and logout.",
    },
    {
      name: "Users",
      description: "Authenticated current-user profile APIs.",
    },
    {
      name: "Locations",
      description: "Public location lookup APIs used during registration.",
    },
    {
      name: "Errands",
      description: "Neighborhood notice-board errand posting and management.",
    },
    {
      name: "Wallet",
      description: "Authenticated token wallet and transaction history APIs.",
    },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        description: "Use the format: Authorization: Bearer <access-token>",
      },
    },
    schemas: {
      ApiSuccessResponse: apiResponse(),
      ErrorDetail: {
        type: "object",
        required: ["field", "message"],
        properties: {
          field: {
            type: "string",
            example: "body.phone",
          },
          message: {
            type: "string",
            example: "Phone number is too short",
          },
        },
      },
      ErrorResponse: {
        type: "object",
        required: ["success", "message", "errors"],
        properties: {
          success: {
            type: "boolean",
            example: false,
          },
          message: {
            type: "string",
            example: "Validation failed",
          },
          errors: {
            type: "array",
            items: {
              $ref: "#/components/schemas/ErrorDetail",
            },
          },
        },
      },
      RegisterRequest: {
        type: "object",
        required: ["fullName", "phone", "password", "neighborhoodId"],
        properties: {
          fullName: {
            type: "string",
            minLength: 2,
            maxLength: 100,
            description: "Trimmed before validation and persistence.",
            example: "Leenah Alborsh",
          },
          phone: {
            type: "string",
            minLength: 8,
            maxLength: 20,
            example: "+970599123456",
          },
          password: {
            type: "string",
            format: "password",
            minLength: 8,
            pattern: "^(?=.*[A-Z])(?=.*\\d)(?=.*[^A-Za-z0-9]).{8,}$",
            description:
              "Must be at least 8 characters and include one uppercase letter, one number, and one special character.",
            example: "Strong1!",
          },
          neighborhoodId: {
            type: "string",
            format: "uuid",
            description:
              "Must be selected from an existing active neighborhood returned by GET /api/v1/locations/neighborhoods.",
            example: "60a32850-bd3f-444a-84b4-c750abf6ecb6",
          },
        },
      },
      LoginRequest: {
        type: "object",
        required: ["phone", "password"],
        properties: {
          phone: {
            type: "string",
            minLength: 8,
            maxLength: 20,
            example: "+970599123456",
          },
          password: {
            type: "string",
            format: "password",
            minLength: 1,
            example: "Strong1!",
          },
        },
      },
      OtpRequest: {
        type: "object",
        required: ["phone"],
        properties: {
          phone: {
            type: "string",
            minLength: 8,
            maxLength: 20,
            example: "+970599123456",
          },
          channel: {
            type: "string",
            enum: ["SMS", "WHATSAPP"],
            default: "SMS",
            example: "SMS",
          },
        },
      },
      OtpVerifyRequest: {
        type: "object",
        required: ["phone", "otp"],
        properties: {
          phone: {
            type: "string",
            minLength: 8,
            maxLength: 20,
            example: "+970599123456",
          },
          otp: {
            type: "string",
            minLength: 6,
            maxLength: 6,
            pattern: "^\\d{6}$",
            example:
              env.nodeEnv === "production" || !env.devFixedOtp
                ? "123456"
                : "000000",
          },
        },
      },
      RefreshTokenRequest: {
        type: "object",
        required: ["refreshToken"],
        properties: {
          refreshToken: {
            type: "string",
            minLength: 1,
            example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
          },
        },
      },
      LogoutRequest: {
        allOf: [
          {
            $ref: "#/components/schemas/RefreshTokenRequest",
          },
        ],
      },
      UserSummary: {
        type: "object",
        required: ["id", "phone", "role", "status"],
        properties: {
          id: {
            type: "string",
            format: "uuid",
            example: "0f46f56f-32d1-4fd4-84d2-69bc2b077d8f",
          },
          phone: {
            type: "string",
            example: "+970599123456",
          },
          role: {
            type: "string",
            enum: ["USER", "SUPER_ADMIN"],
            example: "USER",
          },
          status: {
            type: "string",
            enum: ["ACTIVE", "SUSPENDED", "BANNED"],
            example: "ACTIVE",
          },
        },
      },
      Neighborhood: {
        type: "object",
        required: ["id", "name", "governorate"],
        nullable: true,
        properties: {
          id: {
            type: "string",
            format: "uuid",
            example: "60a32850-bd3f-444a-84b4-c750abf6ecb6",
          },
          name: {
            type: "string",
            example: "Al-Bireh",
          },
          governorate: {
            type: "string",
            example: "Ramallah and Al-Bireh",
          },
          isActive: {
            type: "boolean",
            example: true,
          },
        },
      },
      NeighborhoodListData: {
        type: "object",
        required: ["neighborhoods"],
        properties: {
          neighborhoods: {
            type: "array",
            items: {
              $ref: "#/components/schemas/Neighborhood",
            },
          },
        },
      },
      UserProfile: {
        type: "object",
        required: [
          "id",
          "phone",
          "fullName",
          "role",
          "trustScore",
          "neighborhoodId",
          "profileCompleted",
          "status",
        ],
        properties: {
          id: {
            type: "string",
            format: "uuid",
            example: "0f46f56f-32d1-4fd4-84d2-69bc2b077d8f",
          },
          phone: {
            type: "string",
            example: "+970599123456",
          },
          fullName: {
            type: "string",
            nullable: true,
            example: "Maya Nasser",
          },
          role: {
            type: "string",
            enum: ["USER", "SUPER_ADMIN"],
            example: "USER",
          },
          trustScore: {
            type: "number",
            format: "decimal",
            example: 70,
          },
          neighborhoodId: {
            type: "string",
            format: "uuid",
            nullable: true,
            example: "60a32850-bd3f-444a-84b4-c750abf6ecb6",
          },
          profileCompleted: {
            type: "boolean",
            example: true,
          },
          phoneVerifiedAt: {
            type: "string",
            format: "date-time",
            nullable: true,
            example: "2026-08-17T09:15:00.000Z",
          },
          status: {
            type: "string",
            enum: ["ACTIVE", "SUSPENDED", "BANNED"],
            example: "ACTIVE",
          },
          createdAt: {
            type: "string",
            format: "date-time",
            example: "2026-08-17T09:00:00.000Z",
          },
          updatedAt: {
            type: "string",
            format: "date-time",
            example: "2026-08-17T09:20:00.000Z",
          },
          neighborhood: {
            $ref: "#/components/schemas/Neighborhood",
          },
        },
      },
      UserProfileUpdateRequest: {
        type: "object",
        minProperties: 1,
        properties: {
          fullName: {
            type: "string",
            minLength: 2,
            maxLength: 100,
            description: "Trimmed before validation and persistence.",
            example: "Maya Nasser",
          },
          neighborhoodId: {
            type: "string",
            format: "uuid",
            example: "60a32850-bd3f-444a-84b4-c750abf6ecb6",
          },
        },
        description:
          "Provide at least one of fullName or neighborhoodId. neighborhoodId must reference an active neighborhood.",
      },
      ErrandCreateRequest: {
        type: "object",
        required: [
          "clientRequestKey",
          "categoryId",
          "title",
          "itemsDescription",
          "destinationKeyword",
          "weightClass",
        ],
        properties: {
          clientRequestKey: {
            type: "string",
            format: "uuid",
            description:
              "Offline idempotency key. Reusing the same key with identical data returns the existing errand without another wallet debit.",
            example: "60a32850-bd3f-444a-84b4-c750abf6ecb8",
          },
          categoryId: {
            type: "string",
            format: "uuid",
            description: "Must reference an active seeded category.",
            example: "60a32850-bd3f-444a-84b4-c750abf6ecb6",
          },
          title: {
            type: "string",
            minLength: 3,
            maxLength: 80,
            example: "Buy medicine",
          },
          itemsDescription: {
            type: "string",
            minLength: 3,
            maxLength: 1000,
            example: "One box of Panadol",
          },
          destinationKeyword: {
            type: "string",
            minLength: 2,
            maxLength: 150,
            example: "Central Pharmacy",
          },
          weightClass: {
            type: "string",
            enum: ["LIGHT", "MEDIUM", "HEAVY"],
            example: "LIGHT",
          },
          isUrgent: {
            type: "boolean",
            default: false,
            example: false,
          },
          isInterZone: {
            type: "boolean",
            default: false,
            example: false,
          },
          neededByTime: {
            type: "string",
            format: "date-time",
            nullable: true,
            description:
              "Must be a future ISO datetime when provided. Also controls expiration for Phase 5.",
            example: "2026-08-20T10:00:00.000Z",
          },
          voiceNoteUrl: {
            type: "string",
            format: "uri",
            nullable: true,
            example: null,
          },
          voiceNoteDurationSec: {
            type: "integer",
            minimum: 0,
            maximum: 30,
            nullable: true,
            example: null,
          },
        },
      },
      ErrandUpdateRequest: {
        type: "object",
        minProperties: 1,
        properties: {
          categoryId: {
            type: "string",
            format: "uuid",
          },
          title: {
            type: "string",
            minLength: 3,
            maxLength: 80,
          },
          itemsDescription: {
            type: "string",
            minLength: 3,
            maxLength: 1000,
          },
          destinationKeyword: {
            type: "string",
            minLength: 2,
            maxLength: 150,
          },
          weightClass: {
            type: "string",
            enum: ["LIGHT", "MEDIUM", "HEAVY"],
          },
          isUrgent: {
            type: "boolean",
          },
          isInterZone: {
            type: "boolean",
          },
          neededByTime: {
            type: "string",
            format: "date-time",
            nullable: true,
          },
          voiceNoteUrl: {
            type: "string",
            format: "uri",
            nullable: true,
          },
          voiceNoteDurationSec: {
            type: "integer",
            minimum: 0,
            maximum: 30,
            nullable: true,
          },
        },
        description:
          "Only the requester can update OPEN errands. requesterId, neighborhoodId, status, token cost, transaction IDs, and createdAt are immutable.",
      },
      Errand: {
        type: "object",
        required: [
          "id",
          "requesterId",
          "neighborhoodId",
          "clientRequestKey",
          "title",
          "itemsDescription",
          "destinationKeyword",
          "weightClass",
          "isUrgent",
          "isInterZone",
          "priorityScore",
          "calculatedFeeNis",
          "postTokenCost",
          "status",
          "expiresAt",
          "createdAt",
          "updatedAt",
        ],
        properties: {
          id: {
            type: "string",
            format: "uuid",
          },
          requesterId: {
            type: "string",
            format: "uuid",
          },
          categoryId: {
            type: "string",
            format: "uuid",
            nullable: true,
          },
          neighborhoodId: {
            type: "string",
            format: "uuid",
          },
          clientRequestKey: {
            type: "string",
            format: "uuid",
          },
          title: {
            type: "string",
          },
          itemsDescription: {
            type: "string",
          },
          destinationKeyword: {
            type: "string",
          },
          weightClass: {
            type: "string",
            enum: ["LIGHT", "MEDIUM", "HEAVY"],
          },
          isUrgent: {
            type: "boolean",
          },
          isInterZone: {
            type: "boolean",
          },
          priorityScore: {
            type: "number",
            example: 8,
          },
          calculatedFeeNis: {
            type: "number",
            example: 5,
          },
          postTokenCost: {
            type: "integer",
            example: 1,
          },
          postTokenTransactionId: {
            type: "string",
            format: "uuid",
            nullable: true,
          },
          voiceNoteUrl: {
            type: "string",
            nullable: true,
          },
          voiceNoteDurationSec: {
            type: "integer",
            nullable: true,
          },
          status: {
            type: "string",
            enum: ["OPEN", "MATCHED", "CANCELLED", "EXPIRED", "COMPLETED"],
          },
          neededByTime: {
            type: "string",
            format: "date-time",
            nullable: true,
          },
          expiresAt: {
            type: "string",
            format: "date-time",
          },
          category: {
            type: "object",
            nullable: true,
          },
          neighborhood: {
            $ref: "#/components/schemas/Neighborhood",
          },
          requester: {
            type: "object",
            properties: {
              id: {
                type: "string",
                format: "uuid",
              },
              fullName: {
                type: "string",
                nullable: true,
              },
              trustScore: {
                type: "number",
              },
            },
          },
          createdAt: {
            type: "string",
            format: "date-time",
          },
          updatedAt: {
            type: "string",
            format: "date-time",
          },
        },
      },
      ErrandListData: {
        type: "object",
        required: ["errands", "pagination"],
        properties: {
          errands: {
            type: "array",
            items: {
              $ref: "#/components/schemas/Errand",
            },
          },
          pagination: {
            type: "object",
            required: ["skip", "take", "total"],
            properties: {
              skip: {
                type: "integer",
                example: 0,
              },
              take: {
                type: "integer",
                example: 20,
              },
              total: {
                type: "integer",
                example: 1,
              },
            },
          },
        },
      },
      Wallet: {
        type: "object",
        required: ["id", "userId", "tokenBalance", "createdAt", "updatedAt"],
        properties: {
          id: {
            type: "string",
            format: "uuid",
            example: "ad0f7a16-c362-4714-a65d-9f11272ef746",
          },
          userId: {
            type: "string",
            format: "uuid",
            example: "0f46f56f-32d1-4fd4-84d2-69bc2b077d8f",
          },
          tokenBalance: {
            type: "integer",
            example: 3,
          },
          createdAt: {
            type: "string",
            format: "date-time",
            example: "2026-08-17T09:00:00.000Z",
          },
          updatedAt: {
            type: "string",
            format: "date-time",
            example: "2026-08-17T09:00:00.000Z",
          },
        },
      },
      WalletTransaction: {
        type: "object",
        required: [
          "id",
          "transactionType",
          "tokenAmount",
          "balanceBefore",
          "balanceAfter",
          "createdAt",
        ],
        properties: {
          id: {
            type: "string",
            format: "uuid",
            example: "17268c0e-0748-4108-a486-dce6d1da412e",
          },
          transactionType: {
            type: "string",
            enum: [
              "TOKEN_TOP_UP",
              "ERRAND_POST_DEBIT",
              "TRIP_POST_DEBIT",
              "ERRAND_ACCEPT_DEBIT",
              "ADMIN_CREDIT",
              "ADMIN_DEBIT",
              "REFUND",
              "SIGNUP_BONUS",
            ],
            example: "SIGNUP_BONUS",
          },
          tokenAmount: {
            type: "integer",
            example: 3,
          },
          balanceBefore: {
            type: "integer",
            example: 0,
          },
          balanceAfter: {
            type: "integer",
            example: 3,
          },
          referenceType: {
            type: "string",
            nullable: true,
            example: "USER",
          },
          referenceId: {
            type: "string",
            format: "uuid",
            nullable: true,
            example: "0f46f56f-32d1-4fd4-84d2-69bc2b077d8f",
          },
          idempotencyKey: {
            type: "string",
            nullable: true,
            example: "signup-bonus:0f46f56f-32d1-4fd4-84d2-69bc2b077d8f",
          },
          description: {
            type: "string",
            nullable: true,
            example: "Initial signup bonus",
          },
          createdAt: {
            type: "string",
            format: "date-time",
            example: "2026-08-17T09:00:00.000Z",
          },
        },
      },
      WalletTransactionsData: {
        type: "object",
        required: ["transactions", "pagination"],
        properties: {
          transactions: {
            type: "array",
            items: {
              $ref: "#/components/schemas/WalletTransaction",
            },
          },
          pagination: {
            type: "object",
            required: ["skip", "take", "total"],
            properties: {
              skip: {
                type: "integer",
                minimum: 0,
                default: 0,
                example: 0,
              },
              take: {
                type: "integer",
                minimum: 1,
                maximum: 100,
                default: 20,
                example: 20,
              },
              total: {
                type: "integer",
                example: 1,
              },
            },
          },
        },
      },
      AuthTokens: {
        type: "object",
        required: [
          "accessToken",
          "refreshToken",
          "tokenType",
          "accessTokenExpiresIn",
          "refreshTokenExpiresIn",
        ],
        properties: {
          accessToken: {
            type: "string",
            example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
          },
          refreshToken: {
            type: "string",
            example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
          },
          tokenType: {
            type: "string",
            example: "Bearer",
          },
          accessTokenExpiresIn: {
            type: "string",
            example: "15m",
          },
          refreshTokenExpiresIn: {
            type: "string",
            example: "7d",
          },
        },
      },
      VerifyOtpData: {
        allOf: [
          {
            type: "object",
            required: ["user"],
            properties: {
              user: {
                $ref: "#/components/schemas/UserSummary",
              },
            },
          },
          {
            $ref: "#/components/schemas/AuthTokens",
          },
        ],
      },
      RefreshData: {
        $ref: "#/components/schemas/AuthTokens",
      },
      HealthResponse: apiResponse(null, {
        success: true,
        message: "API is running",
        data: null,
      }),
      RegisterResponse: apiResponse(
        {
          type: "object",
          required: ["expiresInMinutes"],
          properties: {
            expiresInMinutes: {
              type: "integer",
              example: 2,
            },
          },
        },
        {
          success: true,
          message: "Registration OTP sent successfully",
          data: {
            expiresInMinutes: 2,
          },
        },
      ),
      LoginResponse: apiResponse({
        allOf: [
          {
            type: "object",
            required: ["user"],
            properties: {
              user: {
                $ref: "#/components/schemas/UserSummary",
              },
            },
          },
          {
            $ref: "#/components/schemas/AuthTokens",
          },
        ],
      }),
      OtpRequestResponse: apiResponse(
        {
          type: "object",
          required: ["expiresInMinutes"],
          properties: {
            expiresInMinutes: {
              type: "integer",
              example: 2,
            },
          },
        },
        {
          success: true,
          message: "OTP sent successfully",
          data: {
            expiresInMinutes: 2,
          },
        },
      ),
      VerifyOtpResponse: apiResponse({
        $ref: "#/components/schemas/VerifyOtpData",
      }),
      RefreshResponse: apiResponse({
        $ref: "#/components/schemas/RefreshData",
      }),
      LogoutResponse: apiResponse(null, {
        success: true,
        message: "Logged out successfully",
        data: null,
      }),
      UserProfileResponse: apiResponse({
        $ref: "#/components/schemas/UserProfile",
      }),
      NeighborhoodListResponse: apiResponse({
        $ref: "#/components/schemas/NeighborhoodListData",
      }),
      ErrandResponse: apiResponse({
        type: "object",
        required: ["errand"],
        properties: {
          errand: {
            $ref: "#/components/schemas/Errand",
          },
        },
      }),
      ErrandListResponse: apiResponse({
        $ref: "#/components/schemas/ErrandListData",
      }),
      WalletResponse: apiResponse({
        $ref: "#/components/schemas/Wallet",
      }),
      WalletTransactionsResponse: apiResponse({
        $ref: "#/components/schemas/WalletTransactionsData",
      }),
    },
    responses: {
      ValidationFailed: errorResponse("Validation failed", [
        {
          field: "body.phone",
          message: "Phone number is too short",
        },
      ]),
      Unauthorized: errorResponse("Authentication is required."),
      Forbidden: errorResponse("User is not active."),
      NotFound: errorResponse("Requested record was not found."),
      Conflict: errorResponse("A record with this value already exists."),
      TooManyRequests: errorResponse("Too many requests. Please try again later."),
      InternalServerError: errorResponse("Internal server error"),
    },
  },
  paths: {
    "/health": {
      get: {
        tags: ["Health"],
        summary: "Check API health",
        description: "Returns a simple success response when the API is running.",
        responses: {
          200: {
            description: "API is running.",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/HealthResponse",
                },
                example: {
                  success: true,
                  message: "API is running",
                },
              },
            },
          },
          429: {
            $ref: "#/components/responses/TooManyRequests",
          },
          500: {
            $ref: "#/components/responses/InternalServerError",
          },
        },
      },
    },
    "/api/v1/auth/register": {
      post: {
        tags: ["Authentication"],
        summary: "Register and request phone verification",
        description:
          `Creates or prepares an unverified password user with basic profile data and sends a phone verification OTP. This endpoint does not issue access or refresh tokens. neighborhoodId must be selected from an existing active neighborhood returned by GET /api/v1/locations/neighborhoods. Passwords must be at least 8 characters and include one uppercase letter, one number, and one special character.${fixedOtpSwaggerNote}`,
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/RegisterRequest",
              },
            },
          },
        },
        responses: {
          201: {
            description:
              "Registration prepared and verification OTP created. No tokens are issued until OTP verification succeeds.",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/RegisterResponse",
                },
              },
            },
          },
          400: {
            description:
              "Validation failed or the selected neighborhood does not exist or is inactive.",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse",
                },
                examples: {
                  validation: {
                    value: {
                      success: false,
                      message: "Validation failed",
                      errors: [
                        {
                          field: "body.neighborhoodId",
                          message: "Neighborhood ID must be a valid UUID.",
                        },
                      ],
                    },
                  },
                  inactiveNeighborhood: {
                    value: {
                      success: false,
                      message: "Selected neighborhood does not exist or is inactive.",
                      errors: [],
                    },
                  },
                },
              },
            },
          },
          409: errorResponse("A user with this phone already exists."),
          429: {
            $ref: "#/components/responses/TooManyRequests",
          },
          500: {
            $ref: "#/components/responses/InternalServerError",
          },
        },
      },
    },
    "/api/v1/auth/login": {
      post: {
        tags: ["Authentication"],
        summary: "Log in with phone and password",
        description:
          "Authenticates a verified ACTIVE user with phone and password. Wrong phone, missing password support on a legacy user, and wrong password all return a generic invalid-credentials response. Users whose phoneVerifiedAt is null are rejected until OTP verification succeeds.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/LoginRequest",
              },
            },
          },
        },
        responses: {
          200: {
            description: "Login succeeded and tokens were issued.",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/LoginResponse",
                },
              },
            },
          },
          400: {
            $ref: "#/components/responses/ValidationFailed",
          },
          401: errorResponse("Invalid phone or password."),
          403: {
            description:
              "Phone number is not verified, or the user is suspended or banned.",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse",
                },
                examples: {
                  unverified: {
                    value: {
                      success: false,
                      message: "Phone number is not verified.",
                      errors: [],
                    },
                  },
                  inactive: {
                    value: {
                      success: false,
                      message: "User is not active.",
                      errors: [],
                    },
                  },
                },
              },
            },
          },
          429: {
            $ref: "#/components/responses/TooManyRequests",
          },
          500: {
            $ref: "#/components/responses/InternalServerError",
          },
        },
      },
    },
    "/api/v1/auth/request-otp": {
      post: {
        tags: ["Authentication"],
        summary: "Request a phone verification OTP",
        description:
          `Creates a six-digit phone verification OTP for the provided phone number. This endpoint does not authenticate the user by itself and verification tokens are issued only for a prepared or existing user. In non-production, DEV_FIXED_OTP may be used for development and staging testing. Production delivery must use the OTP provider integration.${fixedOtpSwaggerNote}`,
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/OtpRequest",
              },
            },
          },
        },
        responses: {
          200: {
            description: "OTP created successfully.",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/OtpRequestResponse",
                },
              },
            },
          },
          400: {
            $ref: "#/components/responses/ValidationFailed",
          },
          429: {
            $ref: "#/components/responses/TooManyRequests",
          },
          500: {
            $ref: "#/components/responses/InternalServerError",
          },
        },
      },
    },
    "/api/v1/auth/verify-otp": {
      post: {
        tags: ["Authentication"],
        summary: "Verify phone OTP and receive tokens",
        description:
          `Verifies the latest phone verification OTP for a phone number. On success, the backend marks the OTP used, sets phoneVerifiedAt, ensures a wallet exists with exactly one signup bonus ledger entry for new wallets, and returns access and refresh tokens.${fixedOtpSwaggerNote}`,
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/OtpVerifyRequest",
              },
            },
          },
        },
        responses: {
          200: {
            description: "OTP verified and tokens issued.",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/VerifyOtpResponse",
                },
              },
            },
          },
          400: {
            description: "Validation failed, OTP was already used, or OTP has expired.",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse",
                },
                examples: {
                  validation: {
                    value: {
                      success: false,
                      message: "Validation failed",
                      errors: [
                        {
                          field: "body.otp",
                          message: "OTP must be exactly 6 digits",
                        },
                      ],
                    },
                  },
                  expired: {
                    value: {
                      success: false,
                      message: "OTP has expired.",
                      errors: [],
                    },
                  },
                },
              },
            },
          },
          401: errorResponse("Invalid OTP."),
          404: errorResponse("OTP not found."),
          429: errorResponse("Too many OTP attempts."),
          500: {
            $ref: "#/components/responses/InternalServerError",
          },
        },
      },
    },
    "/api/v1/auth/refresh": {
      post: {
        tags: ["Authentication"],
        summary: "Refresh access credentials",
        description:
          "Validates a refresh token, revokes it, and returns a new access token and refresh token pair.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/RefreshTokenRequest",
              },
            },
          },
        },
        responses: {
          200: {
            description: "Token refreshed successfully.",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/RefreshResponse",
                },
              },
            },
          },
          400: {
            $ref: "#/components/responses/ValidationFailed",
          },
          401: {
            description:
              "Refresh token is invalid, missing from storage, revoked, or expired.",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse",
                },
                examples: {
                  invalid: {
                    value: {
                      success: false,
                      message: "Invalid refresh token.",
                      errors: [],
                    },
                  },
                  revoked: {
                    value: {
                      success: false,
                      message: "Refresh token has been revoked.",
                      errors: [],
                    },
                  },
                },
              },
            },
          },
          403: {
            $ref: "#/components/responses/Forbidden",
          },
          429: {
            $ref: "#/components/responses/TooManyRequests",
          },
          500: {
            $ref: "#/components/responses/InternalServerError",
          },
        },
      },
    },
    "/api/v1/auth/logout": {
      post: {
        tags: ["Authentication"],
        summary: "Log out a refresh token",
        description:
          "Revokes the provided refresh token when it exists and is not already revoked. The endpoint returns success even when the token is not found.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/LogoutRequest",
              },
            },
          },
        },
        responses: {
          200: {
            description: "Logout completed.",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/LogoutResponse",
                },
              },
            },
          },
          400: {
            $ref: "#/components/responses/ValidationFailed",
          },
          429: {
            $ref: "#/components/responses/TooManyRequests",
          },
          500: {
            $ref: "#/components/responses/InternalServerError",
          },
        },
      },
    },
    "/api/v1/locations/neighborhoods": {
      get: {
        tags: ["Locations"],
        summary: "List active neighborhoods",
        description:
          "Returns active seeded neighborhoods for registration. This endpoint is public and excludes inactive neighborhoods.",
        responses: {
          200: {
            description: "Active neighborhoods retrieved successfully.",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/NeighborhoodListResponse",
                },
              },
            },
          },
          429: {
            $ref: "#/components/responses/TooManyRequests",
          },
          500: {
            $ref: "#/components/responses/InternalServerError",
          },
        },
      },
    },
    "/api/v1/errands": {
      get: {
        tags: ["Errands"],
        summary: "List neighborhood errands",
        description:
          "Returns a paginated notice-board list. When authenticated and neighborhoodId is omitted, the user's neighborhood is used. By default only non-expired OPEN errands are returned.",
        security: [
          {
            bearerAuth: [],
          },
        ],
        parameters: [
          {
            name: "neighborhoodId",
            in: "query",
            required: false,
            schema: {
              type: "string",
              format: "uuid",
            },
          },
          {
            name: "status",
            in: "query",
            required: false,
            schema: {
              type: "string",
              enum: ["OPEN", "MATCHED", "CANCELLED", "EXPIRED", "COMPLETED"],
            },
          },
          {
            name: "categoryId",
            in: "query",
            required: false,
            schema: {
              type: "string",
              format: "uuid",
            },
          },
          {
            name: "urgent",
            in: "query",
            required: false,
            schema: {
              type: "boolean",
            },
          },
          {
            name: "skip",
            in: "query",
            required: false,
            schema: {
              type: "integer",
              minimum: 0,
              default: 0,
            },
          },
          {
            name: "take",
            in: "query",
            required: false,
            schema: {
              type: "integer",
              minimum: 1,
              maximum: 50,
              default: 20,
            },
          },
        ],
        responses: {
          200: {
            description: "Errands retrieved successfully.",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrandListResponse",
                },
              },
            },
          },
          400: {
            $ref: "#/components/responses/ValidationFailed",
          },
          429: {
            $ref: "#/components/responses/TooManyRequests",
          },
          500: {
            $ref: "#/components/responses/InternalServerError",
          },
        },
      },
      post: {
        tags: ["Errands"],
        summary: "Create an errand",
        description:
          "Creates an OPEN errand in the authenticated user's selected neighborhood and atomically debits 1 posting token with wallet transaction type ERRAND_POST_DEBIT. clientRequestKey makes unstable-network retries safe; conflicting reuse returns 409.",
        security: [
          {
            bearerAuth: [],
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/ErrandCreateRequest",
              },
            },
          },
        },
        responses: {
          201: {
            description: "Errand created successfully.",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrandResponse",
                },
              },
            },
          },
          400: errorResponse(
            "Validation failed, profile is incomplete, category is inactive, or token balance is insufficient.",
          ),
          401: {
            $ref: "#/components/responses/Unauthorized",
          },
          403: {
            $ref: "#/components/responses/Forbidden",
          },
          409: errorResponse(
            "Client request key has already been used with different errand data.",
          ),
          429: {
            $ref: "#/components/responses/TooManyRequests",
          },
          500: {
            $ref: "#/components/responses/InternalServerError",
          },
        },
      },
    },
    "/api/v1/errands/{id}": {
      get: {
        tags: ["Errands"],
        summary: "Get errand details",
        description:
          "Returns a safe errand view with category, neighborhood, and requester summary. Password hashes, refresh tokens, and wallet internals are never returned.",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: {
              type: "string",
              format: "uuid",
            },
          },
        ],
        responses: {
          200: {
            description: "Errand retrieved successfully.",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrandResponse",
                },
              },
            },
          },
          400: {
            $ref: "#/components/responses/ValidationFailed",
          },
          404: errorResponse("Errand not found."),
          429: {
            $ref: "#/components/responses/TooManyRequests",
          },
          500: {
            $ref: "#/components/responses/InternalServerError",
          },
        },
      },
      patch: {
        tags: ["Errands"],
        summary: "Update own open errand",
        description:
          "Only the requester can update an OPEN errand. Derived fee, priority, and expiration are recalculated. Posting tokens are not debited again for edits.",
        security: [
          {
            bearerAuth: [],
          },
        ],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: {
              type: "string",
              format: "uuid",
            },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/ErrandUpdateRequest",
              },
            },
          },
        },
        responses: {
          200: {
            description: "Errand updated successfully.",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrandResponse",
                },
              },
            },
          },
          400: errorResponse(
            "Validation failed or errand cannot be updated in its current status.",
          ),
          401: {
            $ref: "#/components/responses/Unauthorized",
          },
          403: errorResponse("You are not allowed to modify this errand."),
          404: errorResponse("Errand not found."),
          429: {
            $ref: "#/components/responses/TooManyRequests",
          },
          500: {
            $ref: "#/components/responses/InternalServerError",
          },
        },
      },
    },
    "/api/v1/errands/{id}/cancel": {
      post: {
        tags: ["Errands"],
        summary: "Cancel own open errand",
        description:
          "Only the requester can cancel an OPEN errand. The record is kept and status is set to CANCELLED. Phase 5 does not refund the posting token.",
        security: [
          {
            bearerAuth: [],
          },
        ],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: {
              type: "string",
              format: "uuid",
            },
          },
        ],
        responses: {
          200: {
            description: "Errand cancelled successfully.",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrandResponse",
                },
              },
            },
          },
          400: errorResponse(
            "Validation failed or errand cannot be cancelled in its current status.",
          ),
          401: {
            $ref: "#/components/responses/Unauthorized",
          },
          403: errorResponse("You are not allowed to modify this errand."),
          404: errorResponse("Errand not found."),
          429: {
            $ref: "#/components/responses/TooManyRequests",
          },
          500: {
            $ref: "#/components/responses/InternalServerError",
          },
        },
      },
    },
    "/api/v1/users/me": {
      get: {
        tags: ["Users"],
        summary: "Get current user profile",
        description:
          "Returns the authenticated user's profile, including neighborhood details when a neighborhood is set.",
        security: [
          {
            bearerAuth: [],
          },
        ],
        responses: {
          200: {
            description: "User profile retrieved successfully.",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/UserProfileResponse",
                },
              },
            },
          },
          401: {
            $ref: "#/components/responses/Unauthorized",
          },
          403: {
            $ref: "#/components/responses/Forbidden",
          },
          404: errorResponse("User not found."),
          429: {
            $ref: "#/components/responses/TooManyRequests",
          },
          500: {
            $ref: "#/components/responses/InternalServerError",
          },
        },
      },
      patch: {
        tags: ["Users"],
        summary: "Update current user profile",
        description:
          "Updates fullName, neighborhoodId, or both for the authenticated user. The profileCompleted flag is recalculated after the update.",
        security: [
          {
            bearerAuth: [],
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/UserProfileUpdateRequest",
              },
            },
          },
        },
        responses: {
          200: {
            description: "User profile updated successfully.",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/UserProfileResponse",
                },
              },
            },
          },
          400: {
            description:
              "Validation failed or the selected neighborhood does not exist or is inactive.",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse",
                },
                examples: {
                  validation: {
                    value: {
                      success: false,
                      message: "Validation failed",
                      errors: [
                        {
                          field: "body",
                          message: "At least one field must be provided for update.",
                        },
                      ],
                    },
                  },
                  inactiveNeighborhood: {
                    value: {
                      success: false,
                      message: "Selected neighborhood does not exist or is inactive.",
                      errors: [],
                    },
                  },
                },
              },
            },
          },
          401: {
            $ref: "#/components/responses/Unauthorized",
          },
          403: {
            $ref: "#/components/responses/Forbidden",
          },
          404: errorResponse("User not found."),
          429: {
            $ref: "#/components/responses/TooManyRequests",
          },
          500: {
            $ref: "#/components/responses/InternalServerError",
          },
        },
      },
    },
    "/api/v1/wallet": {
      get: {
        tags: ["Wallet"],
        summary: "Get current user wallet",
        description:
          "Returns the authenticated user's wallet and current token balance.",
        security: [
          {
            bearerAuth: [],
          },
        ],
        responses: {
          200: {
            description: "Wallet retrieved successfully.",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/WalletResponse",
                },
              },
            },
          },
          401: {
            $ref: "#/components/responses/Unauthorized",
          },
          403: {
            $ref: "#/components/responses/Forbidden",
          },
          404: errorResponse("Wallet not found"),
          429: {
            $ref: "#/components/responses/TooManyRequests",
          },
          500: {
            $ref: "#/components/responses/InternalServerError",
          },
        },
      },
    },
    "/api/v1/wallet/transactions": {
      get: {
        tags: ["Wallet"],
        summary: "List wallet transactions",
        description:
          "Returns the authenticated user's wallet transaction history ordered from newest to oldest.",
        security: [
          {
            bearerAuth: [],
          },
        ],
        parameters: [
          {
            name: "skip",
            in: "query",
            required: false,
            description: "Number of transactions to skip. Defaults to 0.",
            schema: {
              type: "integer",
              minimum: 0,
              default: 0,
            },
            example: 0,
          },
          {
            name: "take",
            in: "query",
            required: false,
            description:
              "Number of transactions to return. Defaults to 20 and cannot exceed 100.",
            schema: {
              type: "integer",
              minimum: 1,
              maximum: 100,
              default: 20,
            },
            example: 20,
          },
        ],
        responses: {
          200: {
            description: "Wallet transactions retrieved successfully.",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/WalletTransactionsResponse",
                },
              },
            },
          },
          400: {
            description:
              "Validation failed for skip or take query parameters.",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse",
                },
                example: {
                  success: false,
                  message: "Validation failed",
                  errors: [
                    {
                      field: "query.take",
                      message: "Take must not exceed 100.",
                    },
                  ],
                },
              },
            },
          },
          401: {
            $ref: "#/components/responses/Unauthorized",
          },
          403: {
            $ref: "#/components/responses/Forbidden",
          },
          404: errorResponse("Wallet not found"),
          429: {
            $ref: "#/components/responses/TooManyRequests",
          },
          500: {
            $ref: "#/components/responses/InternalServerError",
          },
        },
      },
    },
  },
};

const swaggerSpec = swaggerJSDoc({
  definition: swaggerDefinition,
  apis: [],
});

module.exports = swaggerSpec;
