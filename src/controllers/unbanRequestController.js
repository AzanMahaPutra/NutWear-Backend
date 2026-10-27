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
  // UPDATE 09 — search (nama/email) + filter status + pagination. Hanya nilai string yang diteruskan.
  const str = (v) => (typeof v === "string" ? v : undefined);
  const { data, meta } = await unbanRequestService.getAllRequests({
    search: str(req.query.search),
    status: str(req.query.status),
    page: str(req.query.page),
    limit: str(req.query.limit),
  });
  return successResponse(res, { message: "Daftar permohonan unban berhasil diambil", data, meta });
});

const approve = asyncHandler(async (req, res) => {
  const request = await unbanRequestService.approveRequest(req.user.id, req.params.id);
  return successResponse(res, { message: "Permohonan unban disetujui, akun kembali aktif", data: request });
});

const reject = asyncHandler(async (req, res) => {
  const request = await unbanRequestService.rejectRequest(req.user.id, req.params.id);
  return successResponse(res, { message: "Permohonan unban ditolak", data: request });
});

// UPDATE 09 — hapus permohonan yang sudah diproses (lihat unbanRequestService.deleteRequest).
const remove = asyncHandler(async (req, res) => {
  const result = await unbanRequestService.deleteRequest(req.user.id, req.params.id);
  return successResponse(res, { message: "Permohonan unban berhasil dihapus", data: result });
});

module.exports = { submit, getMyLatest, getAll, approve, reject, remove };
