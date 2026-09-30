const ApiResponse = require("../../utils/ApiResponse");
const service = require("./admin.service");

const paymentsService = require("../payments/payments.service");

const listPaymentInvoices = async (req, res, next) => {
  try {
    const result = await paymentsService.listBankTransferInvoices(req.validatedData.query);
    return res.status(200).json(new ApiResponse(200, "Bank transfer invoices retrieved successfully.", result));
  } catch (error) {
    return next(error);
  }
};

const approvePaymentInvoice = async (req, res, next) => {
  try {
    const invoice = await paymentsService.approveBankTransferInvoice(req.user.id, req.validatedData.params.id);
    return res.status(200).json(new ApiResponse(200, "Bank transfer approved and wallet credited.", { invoice }));
  } catch (error) {
    return next(error);
  }
};

const rejectPaymentInvoice = async (req, res, next) => {
  try {
    const invoice = await paymentsService.rejectBankTransferInvoice(
      req.user.id,
      req.validatedData.params.id,
      req.validatedData.body.notes,
    );
    return res.status(200).json(new ApiResponse(200, "Bank transfer rejected.", { invoice }));
  } catch (error) {
    return next(error);
  }
};

const listVerifications = async (req, res, next) => {
  try {
    const result = await service.listVerifications(req.validatedData.query);
    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          "Identity verifications retrieved successfully.",
          result,
        ),
      );
  } catch (error) {
    return next(error);
  }
};
const getVerification = async (req, res, next) => {
  try {
    const verification = await service.getVerification(
      req.validatedData.params.id,
    );
    return res.status(200).json(
      new ApiResponse(200, "Identity verification retrieved successfully.", {
        verification,
      }),
    );
  } catch (error) {
    return next(error);
  }
};
const approveVerification = async (req, res, next) => {
  try {
    const verification = await service.approveVerification(
      req.user.id,
      req.validatedData.params.id,
    );
    return res.status(200).json(
      new ApiResponse(200, "Identity verification approved successfully.", {
        verification,
      }),
    );
  } catch (error) {
    return next(error);
  }
};
const rejectVerification = async (req, res, next) => {
  try {
    const verification = await service.rejectVerification(
      req.user.id,
      req.validatedData.params.id,
      req.validatedData.body.reason,
    );
    return res.status(200).json(
      new ApiResponse(200, "Identity verification rejected successfully.", {
        verification,
      }),
    );
  } catch (error) {
    return next(error);
  }
};

const listFaqs = async (req, res, next) => {
  try {
    const result = await service.listFaqs(req.validatedData.query);
    return res
      .status(200)
      .json(new ApiResponse(200, "FAQs retrieved successfully.", result));
  } catch (error) {
    return next(error);
  }
};
const createFaq = async (req, res, next) => {
  try {
    const faq = await service.createFaq(req.user.id, req.validatedData.body);
    return res
      .status(201)
      .json(new ApiResponse(201, "FAQ created successfully.", { faq }));
  } catch (error) {
    return next(error);
  }
};
const updateFaq = async (req, res, next) => {
  try {
    const faq = await service.updateFaq(
      req.user.id,
      req.validatedData.params.id,
      req.validatedData.body,
    );
    return res
      .status(200)
      .json(new ApiResponse(200, "FAQ updated successfully.", { faq }));
  } catch (error) {
    return next(error);
  }
};
const deleteFaq = async (req, res, next) => {
  try {
    const faq = await service.deleteFaq(
      req.user.id,
      req.validatedData.params.id,
    );
    return res
      .status(200)
      .json(new ApiResponse(200, "FAQ deactivated successfully.", { faq }));
  } catch (error) {
    return next(error);
  }
};
const reorderFaqs = async (req, res, next) => {
  try {
    const faqs = await service.reorderFaqs(
      req.user.id,
      req.validatedData.body.items,
    );
    return res
      .status(200)
      .json(new ApiResponse(200, "FAQs reordered successfully.", { faqs }));
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  listPaymentInvoices,
  approvePaymentInvoice,
  rejectPaymentInvoice,
  listVerifications,
  getVerification,
  approveVerification,
  rejectVerification,
  listFaqs,
  createFaq,
  updateFaq,
  deleteFaq,
  reorderFaqs,
};
