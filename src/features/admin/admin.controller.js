const ApiResponse = require("../../utils/ApiResponse");
const service = require("./admin.service");

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
