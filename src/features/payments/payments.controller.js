const ApiResponse = require("../../utils/ApiResponse");
const service = require("./payments.service");
const { MOCK_SIGNATURE_HEADER } = require("./payments.constants");

const listPackages = async (req, res, next) => {
  try {
    return res
      .status(200)
      .json(
        new ApiResponse(200, "Active token packages retrieved successfully.", {
          packages: await service.listPackages(),
        }),
      );
  } catch (error) {
    return next(error);
  }
};

const createInvoice = async (req, res, next) => {
  try {
    const result = await service.createInvoice(
      req.user.id,
      req.validatedData.body,
    );
    const statusCode = result.created ? 201 : 200;
    return res
      .status(statusCode)
      .json(
        new ApiResponse(
          statusCode,
          result.created
            ? "Payment invoice created successfully."
            : "Existing payment invoice retrieved successfully.",
          result,
        ),
      );
  } catch (error) {
    return next(error);
  }
};

const getInvoice = async (req, res, next) => {
  try {
    return res
      .status(200)
      .json(
        new ApiResponse(200, "Payment invoice retrieved successfully.", {
          invoice: await service.getInvoice(
            req.user.id,
            req.validatedData.params.id,
          ),
        }),
      );
  } catch (error) {
    return next(error);
  }
};

const listInvoices = async (req, res, next) => {
  try {
    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          "Payment invoices retrieved successfully.",
          await service.listInvoices(req.user.id, req.validatedData.query),
        ),
      );
  } catch (error) {
    return next(error);
  }
};

const processMockWebhook = async (req, res, next) => {
  try {
    const result = await service.processMockWebhook(
      req.validatedData.body,
      req.get(MOCK_SIGNATURE_HEADER),
    );
    return res
      .status(200)
      .json(new ApiResponse(200, "Mock payment webhook processed.", result));
  } catch (error) {
    return next(error);
  }
};

const simulateMockPayment = async (req, res, next) => {
  try {
    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          "Mock payment processed successfully.",
          await service.simulateMockPayment(
            req.user.id,
            req.validatedData.params.id,
          ),
        ),
      );
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  listPackages,
  createInvoice,
  getInvoice,
  listInvoices,
  processMockWebhook,
  simulateMockPayment,
};
