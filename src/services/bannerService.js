const bannerRepository = require("../repositories/bannerRepository");
const supabaseStorage = require("../storage/supabaseStorage");
const { AppError } = require("../utils/AppError");

function toResponse(b) {
  return {
    id: b.id,
    isActive: b.is_active,
    sortOrder: b.sort_order,
    backgroundImageUrl: b.background_image_url,
    brand: {
      name: b.brand_name,
      logoUrl: b.brand_logo_url,
      logoSize: b.brand_logo_size,
    },
    title: {
      text: b.title_text,
      color: b.title_color,
      heading: b.title_heading,
      weight: b.title_weight,
    },
    subtitle: {
      text: b.subtitle_text,
      color: b.subtitle_color,
      heading: b.subtitle_heading,
      weight: b.subtitle_weight,
    },
    priceNormal: {
      value: b.price_normal,
      color: b.price_normal_color,
      heading: b.price_normal_heading,
    },
    priceBeforeDiscount:
      b.price_before_discount == null
        ? null
        : {
            value: b.price_before_discount,
            color: b.price_before_discount_color,
            heading: b.price_before_discount_heading,
          },
    pricePromo: {
      value: b.price_promo,
      color: b.price_promo_color,
      heading: b.price_promo_heading,
    },
    limitedOffer:
      b.offer_start_date && b.offer_end_date
        ? {
            startDate: b.offer_start_date,
            endDate: b.offer_end_date,
            color: b.offer_color,
            heading: b.offer_heading,
          }
        : null,
    cta: {
      text: b.cta_text,
      link: b.cta_link,
      bgColor: b.cta_bg_color,
      textColor: b.cta_text_color,
      radius: b.cta_radius,
      size: b.cta_size,
    },
    // Produk tujuan saat banner (Hero Banner) diklik user di Beranda. Null kalau
    // admin belum memilih produk, atau produk tujuannya sudah dihapus.
    targetProduct: b.product
      ? {
          id: b.product.id,
          namaProduk: b.product.nama_produk,
          slug: b.product.slug,
          sku: b.product.product_variants?.[0]?.sku ?? null,
        }
      : null,
  };
}

async function getBanners({ activeOnly } = {}) {
  const banners = await bannerRepository.findAll({ activeOnly });
  return banners.map(toResponse);
}

async function getBannerRawById(id) {
  const banner = await bannerRepository.findById(id);
  if (!banner) throw new AppError("Banner tidak ditemukan", 404);
  return banner;
}

async function getBannerById(id) {
  return toResponse(await getBannerRawById(id));
}

/**
 * Mapping payload camelCase (dari form-data) -> kolom snake_case,
 * hanya menyertakan field yang benar-benar dikirim (partial update aman).
 */
function buildFieldsFromPayload(payload) {
  const str = (key) => (payload[key] !== undefined && payload[key] !== "" ? String(payload[key]) : undefined);
  const num = (key) => (payload[key] !== undefined && payload[key] !== "" ? Number(payload[key]) : undefined);
  const nullableNum = (key) => {
    if (payload[key] === undefined) return undefined;
    return payload[key] === "" || payload[key] === null ? null : Number(payload[key]);
  };
  const nullableDate = (key) => {
    if (payload[key] === undefined) return undefined;
    return payload[key] === "" || payload[key] === null ? null : payload[key];
  };
  const bool = (key) => {
    if (payload[key] === undefined) return undefined;
    return payload[key] === true || payload[key] === "true";
  };
  const nullableStr = (key) => {
    if (payload[key] === undefined) return undefined;
    return payload[key] === "" || payload[key] === null ? null : String(payload[key]);
  };

  const fields = {
    brand_name: str("brandName"),
    brand_logo_size: str("brandLogoSize"),
    title_text: str("titleText"),
    title_color: str("titleColor"),
    title_heading: str("titleHeading"),
    title_weight: str("titleWeight"),
    subtitle_text: str("subtitleText"),
    subtitle_color: str("subtitleColor"),
    subtitle_heading: str("subtitleHeading"),
    subtitle_weight: str("subtitleWeight"),
    price_normal: num("priceNormal"),
    price_normal_color: str("priceNormalColor"),
    price_normal_heading: str("priceNormalHeading"),
    price_before_discount: nullableNum("priceBeforeDiscount"),
    price_before_discount_color: str("priceBeforeDiscountColor"),
    price_before_discount_heading: str("priceBeforeDiscountHeading"),
    price_promo: num("pricePromo"),
    price_promo_color: str("pricePromoColor"),
    price_promo_heading: str("pricePromoHeading"),
    offer_start_date: nullableDate("offerStartDate"),
    offer_end_date: nullableDate("offerEndDate"),
    offer_color: str("offerColor"),
    offer_heading: str("offerHeading"),
    cta_text: str("ctaText"),
    cta_link: str("ctaLink"),
    cta_bg_color: str("ctaBgColor"),
    cta_text_color: str("ctaTextColor"),
    cta_radius: num("ctaRadius"),
    cta_size: str("ctaSize"),
    is_active: bool("isActive"),
    sort_order: num("sortOrder"),
    // Produk tujuan Hero Banner. "" (dikosongkan admin) -> null (hapus tujuan).
    product_id: nullableStr("productId"),
  };

  Object.keys(fields).forEach((key) => fields[key] === undefined && delete fields[key]);
  return fields;
}

async function createBanner(payload, files) {
  const backgroundFile = files.backgroundImage[0];
  const uploadedBg = await supabaseStorage.uploadImage(backgroundFile.buffer, backgroundFile.mimetype, "banners");

  let uploadedLogo = null;
  if (files.brandLogo?.[0]) {
    const logoFile = files.brandLogo[0];
    uploadedLogo = await supabaseStorage.uploadImage(logoFile.buffer, logoFile.mimetype, "banners/brand-logos");
  }

  const fields = buildFieldsFromPayload(payload);
  fields.background_image_url = uploadedBg.publicUrl;
  fields.background_image_path = uploadedBg.path;
  if (uploadedLogo) {
    fields.brand_logo_url = uploadedLogo.publicUrl;
    fields.brand_logo_path = uploadedLogo.path;
  }
  if (fields.is_active === undefined) fields.is_active = true;
  if (fields.sort_order === undefined) fields.sort_order = await bannerRepository.getNextSortOrder();

  const banner = await bannerRepository.create(fields);
  return toResponse(banner);
}

async function updateBanner(id, payload, files = {}) {
  const existing = await getBannerRawById(id);
  const fields = buildFieldsFromPayload(payload);

  if (files.backgroundImage?.[0]) {
    const bgFile = files.backgroundImage[0];
    const uploaded = await supabaseStorage.replaceImage(
      existing.background_image_path,
      bgFile.buffer,
      bgFile.mimetype,
      "banners"
    );
    fields.background_image_url = uploaded.publicUrl;
    fields.background_image_path = uploaded.path;
  }

  if (files.brandLogo?.[0]) {
    const logoFile = files.brandLogo[0];
    const uploaded = await supabaseStorage.replaceImage(
      existing.brand_logo_path,
      logoFile.buffer,
      logoFile.mimetype,
      "banners/brand-logos"
    );
    fields.brand_logo_url = uploaded.publicUrl;
    fields.brand_logo_path = uploaded.path;
  } else if (payload.removeBrandLogo === "true" || payload.removeBrandLogo === true) {
    if (existing.brand_logo_path) await supabaseStorage.deleteImage(existing.brand_logo_path).catch(() => null);
    fields.brand_logo_url = null;
    fields.brand_logo_path = null;
  }

  const banner = await bannerRepository.updateById(id, fields);
  return toResponse(banner);
}

async function deleteBanner(id) {
  const existing = await getBannerRawById(id);
  await Promise.all([
    existing.background_image_path
      ? supabaseStorage.deleteImage(existing.background_image_path).catch(() => null)
      : null,
    existing.brand_logo_path ? supabaseStorage.deleteImage(existing.brand_logo_path).catch(() => null) : null,
  ]);
  await bannerRepository.deleteById(id);
  return true;
}

async function reorderBanners(order) {
  await Promise.all(
    order
      .filter((item) => item && item.id)
      .map((item) => bannerRepository.updateById(item.id, { sort_order: Number(item.sortOrder) }))
  );
  return getBanners({});
}

module.exports = { getBanners, getBannerById, createBanner, updateBanner, deleteBanner, reorderBanners };
