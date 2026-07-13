const addressRepository = require("../repositories/addressRepository");
const { AppError } = require("../utils/AppError");

function toResponse(addr) {
  return {
    id: addr.id,
    userId: addr.user_id,
    receiverName: addr.receiver_name,
    phone: addr.phone,
    province: addr.province,
    city: addr.city,
    district: addr.district,
    postalCode: addr.postal_code,
    address: addr.address,
    isDefault: addr.is_default,
  };
}

async function getAddresses(userId) {
  const addresses = await addressRepository.findAllByUser(userId);
  return addresses.map(toResponse);
}

async function addAddress(userId, payload) {
  const existing = await addressRepository.findAllByUser(userId);
  // Alamat pertama otomatis jadi default, mendukung "lebih dari satu alamat + alamat utama"
  const isDefault = existing.length === 0 ? true : Boolean(payload.isDefault);

  if (isDefault) {
    await addressRepository.clearDefaultForUser(userId);
  }

  const created = await addressRepository.create(userId, { ...payload, isDefault });
  return toResponse(created);
}

async function updateAddress(userId, addressId, payload) {
  const existing = await addressRepository.findById(addressId);
  if (!existing || existing.user_id !== userId) {
    throw new AppError("Alamat tidak ditemukan", 404);
  }

  if (payload.isDefault) {
    await addressRepository.clearDefaultForUser(userId);
  }

  const fields = {
    ...(payload.receiverName && { receiver_name: payload.receiverName }),
    ...(payload.phone && { phone: payload.phone }),
    ...(payload.province && { province: payload.province }),
    ...(payload.city && { city: payload.city }),
    ...(payload.district && { district: payload.district }),
    ...(payload.postalCode && { postal_code: payload.postalCode }),
    ...(payload.address && { address: payload.address }),
    ...(typeof payload.isDefault === "boolean" && { is_default: payload.isDefault }),
  };
  if (Object.keys(fields).length === 0) return toResponse(existing);
  const updated = await addressRepository.updateById(addressId, fields);
  if (!updated) throw new AppError("Alamat tidak ditemukan", 404);
  return toResponse(updated);
}

async function deleteAddress(userId, addressId) {
  const existing = await addressRepository.findById(addressId);
  if (!existing || existing.user_id !== userId) {
    throw new AppError("Alamat tidak ditemukan", 404);
  }
  await addressRepository.deleteById(addressId);
  return true;
}

async function setDefaultAddress(userId, addressId) {
  const existing = await addressRepository.findById(addressId);
  if (!existing || existing.user_id !== userId) {
    throw new AppError("Alamat tidak ditemukan", 404);
  }
  await addressRepository.clearDefaultForUser(userId);
  const updated = await addressRepository.updateById(addressId, { is_default: true });
  return toResponse(updated);
}

module.exports = { getAddresses, addAddress, updateAddress, deleteAddress, setDefaultAddress };
