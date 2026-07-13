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
  const customers = await userService.getAllCustomers();
  return successResponse(res, { message: "Daftar pelanggan berhasil diambil", data: customers });
});

module.exports = { getProfile, updateProfile, getAllCustomers };
