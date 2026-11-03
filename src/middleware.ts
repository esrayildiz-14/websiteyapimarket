import { NextResponse, type NextRequest } from "next/server";
import { bucketFor, clientIpFrom, contentSecurityPolicy, FixedWindowLimiter, ruleFor } from "@/lib/rate-limit";

// İlk savunma hattı:
//  - Her yanıta isteğe özel nonce'lu Content-Security-Policy (canlıda HSTS),
//  - IP başına hız sınırı (form gönderimleri, adres API'si, arama),
//  - çerezi olmayan isteği admin sayfalarından giriş sayfasına yönlendirme.
// Oturumun geçerliliği ve yetki her sayfada ve her işlemde sunucuda ayrıca kontrol edilir (requireStaff).
const limiter = new FixedWindowLimiter();
const DEV = process.env.NODE_ENV !== "production";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const bucket = bucketFor(req.method, pathname);
  if (bucket) {
    const ip = clientIpFrom((n) => req.headers.get(n));
    const r = limiter.hit(`${bucket}:${ip}`, ruleFor(bucket));
    if (!r.ok) {
      return new NextResponse("Çok fazla istek. Lütfen biraz sonra tekrar deneyin.", {
        status: 429,
        headers: { "Retry-After": String(r.retryAfterSec), "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
      });
    }
  }

  if (pathname.startsWith("/admin") && !pathname.startsWith("/admin/giris")) {
    if (!req.cookies.get("oy_admin")?.value) {
      const url = req.nextUrl.clone();
      url.pathname = "/admin/giris";
      url.search = "";
      return NextResponse.redirect(url);
    }
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = contentSecurityPolicy(nonce, DEV);
  const reqHeaders = new Headers(req.headers);
  reqHeaders.set("x-nonce", nonce);
  reqHeaders.set("content-security-policy", csp); // Next.js betiklerine nonce'u buradan ekler
  const res = NextResponse.next({ request: { headers: reqHeaders } });
  res.headers.set("Content-Security-Policy", csp);
  if (!DEV) res.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  if (pathname.startsWith("/admin")) {
    res.headers.set("Cache-Control", "no-store");
    res.headers.set("X-Robots-Tag", "noindex, nofollow");
  }
  return res;
}

export const config = {
  runtime: "nodejs",
  matcher: [{ source: "/((?!_next/static|_next/image|favicon.ico).*)" }],
};
