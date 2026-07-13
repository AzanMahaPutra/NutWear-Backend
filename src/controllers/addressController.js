const addressService = require("../services/addressService");
const { successResponse } = require("../utils/response");
const { asyncHandler } = require("../utils/asyncHandler");

const getAll = asyncHandler(async (req, res) => {
  const addresses = await addressService.getAddresses(req.user.id);
  return successResponse(res, { message: "Daftar alamat berhasil diambil", data: addresses });
});

const create = asyncHandler(async (req, res) => {
  const address = await addressService.addAddress(req.user.id, req.body);
  return successResponse(res, { statusCode: 201, message: "Alamat berhasil ditambahkan", data: address });
});

const update = asyncHandler(async (req, res) => {
  const address = await addressService.updateAddress(req.user.id, req.params.id, req.body);
  return successResponse(res, { message: "Alamat berhasil diperbarui", data: address });
});

const remove = asyncHandler(async (req, res) => {
  await addressService.deleteAddress(req.user.id, req.params.id);
  return successResponse(res, { message: "Alamat berhasil dihapus" });
});

const setDefault = asyncHandler(async (req, res) => {
  const address = await addressService.setDefaultAddress(req.user.id, req.params.id);
  return successResponse(res, { message: "Alamat utama berhasil diperbarui", data: address });
});

module.exports = { getAll, create, update, remove, setDefault };
