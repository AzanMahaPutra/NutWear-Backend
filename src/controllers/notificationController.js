const notificationService = require("../services/notificationService");
const { successResponse } = require("../utils/response");
const { asyncHandler } = require("../utils/asyncHandler");

const getAll = asyncHandler(async (req, res) => {
  const { page, pageSize } = req.query;
  const result = await notificationService.getNotifications(req.user.id, { page, pageSize });
  return successResponse(res, {
    message: "Notifikasi berhasil diambil",
    data: result.items,
    meta: { ...result.meta, unreadCount: result.unreadCount },
  });
});

const getUnreadCount = asyncHandler(async (req, res) => {
  const unreadCount = await notificationService.getUnreadCount(req.user.id);
  return successResponse(res, { message: "Jumlah notifikasi belum dibaca berhasil diambil", data: { unreadCount } });
});

const markRead = asyncHandler(async (req, res) => {
  const notification = await notificationService.markAsRead(req.user.id, req.params.id);
  return successResponse(res, { message: "Notifikasi ditandai sudah dibaca", data: notification });
});

const markAllRead = asyncHandler(async (req, res) => {
  await notificationService.markAllAsRead(req.user.id);
  return successResponse(res, { message: "Seluruh notifikasi ditandai sudah dibaca" });
});

module.exports = { getAll, getUnreadCount, markRead, markAllRead };
