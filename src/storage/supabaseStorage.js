const { v4: uuidv4 } = require("uuid");
const { supabase } = require("../config/supabase");
const { AppError } = require("../utils/AppError");

const BUCKET_NAME = "nutwear-assets";

/**
 * Wrapper reusable untuk operasi Supabase Storage.
 * Dipakai productService (foto produk) & bannerService (gambar banner)
 * supaya logic upload/delete tidak diduplikasi di masing-masing modul.
 */
async function uploadImage(fileBuffer, mimetype, folder = "products") {
  const fileExt = mimetype.split("/")[1] || "jpg";
  const fileName = `${folder}/${uuidv4()}.${fileExt}`;

  const { error } = await supabase.storage.from(BUCKET_NAME).upload(fileName, fileBuffer, {
    contentType: mimetype,
    upsert: false,
  });

  if (error) throw new AppError(`Gagal upload gambar: ${error.message}`, 500);

  const { data } = supabase.storage.from(BUCKET_NAME).getPublicUrl(fileName);
  return { path: fileName, publicUrl: data.publicUrl };
}

async function deleteImage(path) {
  const { error } = await supabase.storage.from(BUCKET_NAME).remove([path]);
  if (error) throw new AppError(`Gagal menghapus gambar: ${error.message}`, 500);
  return true;
}

/**
 * Update = hapus gambar lama lalu upload gambar baru (reusable di semua modul).
 */
async function replaceImage(oldPath, fileBuffer, mimetype, folder) {
  if (oldPath) await deleteImage(oldPath);
  return uploadImage(fileBuffer, mimetype, folder);
}

module.exports = { uploadImage, deleteImage, replaceImage, BUCKET_NAME };
