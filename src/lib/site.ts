/** Sitenin herkese açık adresi (canlıda SITE_URL=https://alanadi.com.tr). */
export function siteUrl() {
  return (process.env.SITE_URL || process.env.PUBLIC_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
}
