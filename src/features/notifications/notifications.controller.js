const ApiResponse = require("../../utils/ApiResponse");
const service = require("./notifications.service");

const list = async (req, res, next) => {
  try {
    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          "Notifications retrieved successfully.",
          await service.list(req.user.id, req.validatedData.query),
        ),
      );
  } catch (error) {
    return next(error);
  }
};

const unreadCount = async (req, res, next) => {
  try {
    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          "Unread notification count retrieved successfully.",
          await service.unreadCount(req.user.id),
        ),
      );
  } catch (error) {
    return next(error);
  }
};

const markRead = async (req, res, next) => {
  try {
    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          "Notification marked read successfully.",
          await service.markRead(req.user.id, req.validatedData.params.id),
        ),
      );
  } catch (error) {
    return next(error);
  }
};

const markAllRead = async (req, res, next) => {
  try {
    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          "Notifications marked read successfully.",
          await service.markAllRead(req.user.id),
        ),
      );
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  list,
  markAllRead,
  markRead,
  unreadCount,
};
