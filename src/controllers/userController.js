const userService = require("../services/userService");
const { successResponse } = require("../utils/response");
const { asyncHandler } = require("../utils/asyncHandler");

const getProfile = asyncHandler(async (req, res) => {
  const profile = await userService.getProfile(req.user.id);
  return successResponse(res, { message: "Profil berhasil diambil", data: profile });
});

const updateProfile = asyncHandler(async (req, res) => {
  const profile = await userService.updateProfile(req.user.id, req.body);
  return successResponse(res, { message: "Profil berhasil diperbarui", data: profile });
});

const getAllCustomers = asyncHandler(async (req, res) => {
  // UPDATE 08 — search (nama/email) + pagination. Hanya nilai string yang diteruskan.
  const str = (v) => (typeof v === "string" ? v : undefined);
  const { data, meta } = await userService.getAllCustomers({
    search: str(req.query.search),
    page: str(req.query.page),
    limit: str(req.query.limit),
  });
  return successResponse(res, { message: "Daftar pelanggan berhasil diambil", data, meta });
});

// UPDATE — Banned User: Admin melakukan banned terhadap satu user lewat
// halaman Manajemen User. Alasan (reason) wajib diisi, divalidasi di validators/userValidator.js.
const banUser = asyncHandler(async (req, res) => {
  const user = await userService.banUser(req.user.id, req.params.id, req.body.reason);
  return successResponse(res, { message: "Akun berhasil dibanned", data: user });
});

module.exports = { getProfile, updateProfile, getAllCustomers, banUser };
