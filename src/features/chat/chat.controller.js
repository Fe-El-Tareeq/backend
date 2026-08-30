const ApiResponse = require("../../utils/ApiResponse");
const service = require("./chat.service");

const listRooms = async (req, res, next) => {
  try {
    const data = await service.listRooms(req.user.id);
    return res
      .status(200)
      .json(new ApiResponse(200, "Chat rooms retrieved successfully.", data));
  } catch (error) {
    return next(error);
  }
};

const getRoom = async (req, res, next) => {
  try {
    const data = await service.getRoom(req.user.id, req.validatedData.params.roomId);
    return res
      .status(200)
      .json(new ApiResponse(200, "Chat room retrieved successfully.", data));
  } catch (error) {
    return next(error);
  }
};

const listMessages = async (req, res, next) => {
  try {
    const data = await service.listMessages(
      req.user.id,
      req.validatedData.params.roomId,
      req.validatedData.query,
    );

    return res
      .status(200)
      .json(new ApiResponse(200, "Chat messages retrieved successfully.", data));
  } catch (error) {
    return next(error);
  }
};

const sendMessage = async (req, res, next) => {
  try {
    const result = await service.sendMessage(
      req.user.id,
      req.validatedData.params.roomId,
      req.validatedData.body,
    );

    return res
      .status(result.created ? 201 : 200)
      .json(new ApiResponse(
        result.created ? 201 : 200,
        result.created ? "Chat message sent successfully." : "Chat message already exists.",
        { message: result.message },
      ));
  } catch (error) {
    return next(error);
  }
};

const syncMessages = async (req, res, next) => {
  try {
    const data = await service.syncMessages(
      req.user.id,
      req.validatedData.params.roomId,
      req.validatedData.query,
    );

    return res
      .status(200)
      .json(new ApiResponse(200, "Chat messages synced successfully.", data));
  } catch (error) {
    return next(error);
  }
};

const markRead = async (req, res, next) => {
  try {
    const data = await service.markRead(
      req.user.id,
      req.validatedData.params.roomId,
    );

    return res
      .status(200)
      .json(new ApiResponse(200, "Chat messages marked read successfully.", data));
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  getRoom,
  listMessages,
  listRooms,
  markRead,
  sendMessage,
  syncMessages,
};
