import { NextResponse, type NextRequest } from "next/server";

// İlk savunma hattı: çerezi olmayan isteği admin sayfalarından giriş sayfasına yönlendirir.
// Oturumun geçerliliği ve yetki her sayfada ve her işlemde sunucuda ayrıca kontrol edilir (requireStaff).
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname.startsWith("/admin") && !pathname.startsWith("/admin/giris")) {
    if (!req.cookies.get("oy_admin")?.value) {
      const url = req.nextUrl.clone();
      url.pathname = "/admin/giris";
      url.search = "";
      return NextResponse.redirect(url);
    }
  }
  const res = NextResponse.next();
  if (pathname.startsWith("/admin")) {
    res.headers.set("Cache-Control", "no-store");
    res.headers.set("X-Robots-Tag", "noindex, nofollow");
  }
  return res;
}

export const config = { matcher: ["/admin/:path*"] };
