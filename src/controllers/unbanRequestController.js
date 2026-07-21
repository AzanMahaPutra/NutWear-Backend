const unbanRequestService = require("../services/unbanRequestService");
const { successResponse } = require("../utils/response");
const { asyncHandler } = require("../utils/asyncHandler");

// --- Customer ---
const submit = asyncHandler(async (req, res) => {
  const request = await unbanRequestService.submitRequest(req.user.id, req.body.requestReason);
  return successResponse(res, { statusCode: 201, message: "Permohonan unban berhasil dikirim", data: request });
});

const getMyLatest = asyncHandler(async (req, res) => {
  const request = await unbanRequestService.getMyLatestRequest(req.user.id);
  return successResponse(res, { message: "Status permohonan unban berhasil diambil", data: request });
});

// --- Admin ---
const getAll = asyncHandler(async (req, res) => {
  const requests = await unbanRequestService.getAllRequests();
  return successResponse(res, { message: "Daftar permohonan unban berhasil diambil", data: requests });
});

const approve = asyncHandler(async (req, res) => {
  const request = await unbanRequestService.approveRequest(req.user.id, req.params.id);
  return successResponse(res, { message: "Permohonan unban disetujui, akun kembali aktif", data: request });
});

const reject = asyncHandler(async (req, res) => {
  const request = await unbanRequestService.rejectRequest(req.user.id, req.params.id);
  return successResponse(res, { message: "Permohonan unban ditolak", data: request });
});

module.exports = { submit, getMyLatest, getAll, approve, reject };
