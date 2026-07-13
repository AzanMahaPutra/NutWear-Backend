/**
 * Membuat slug URL-friendly dari nama produk/kategori.
 * Reusable di productService dan categoryService.
 */
function slugify(text) {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

module.exports = { slugify };
