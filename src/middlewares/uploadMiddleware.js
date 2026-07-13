const multer = require("multer");
const { AppError } = require("../utils/AppError");

/**
 * Middleware upload reusable — pakai memory storage (bukan disk) karena file
 * langsung diteruskan ke Supabase Storage, tidak perlu disimpan di server lokal.
 * Dipakai Product API (upload foto produk) dan Banner API (upload gambar banner).
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      return cb(new AppError("File yang diupload harus berupa gambar", 400));
    }
    cb(null, true);
  },
});

module.exports = { upload };
