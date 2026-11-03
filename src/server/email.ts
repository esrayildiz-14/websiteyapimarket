import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * Müşteri e-postaları. Şu an SMTP / e-posta servisi bağlı DEĞİL (kullanıcı kararı: "şimdilik kayda yaz").
 * Her e-posta email_logs tablosuna LOGGED olarak yazılır ve admin panelinde görüntülenir; müşteriye gitmez.
 * Gönderim eklendiğinde yalnız deliver() değişir.
 */
export async function sendEmail(opts: { to: string; subject: string; body: string; template: string; orderId?: string | null; secret?: string }) {
  const status = await deliver(opts);
  // Şifre sıfırlama bağlantısı gibi gizli değerler kayda açık yazılmaz (yönetici hesabı ele geçiremesin).
  // Yalnız test ortamında EMAIL_LOG_SECRETS=1 ile açık kaydedilir.
  const body = opts.secret && process.env.EMAIL_LOG_SECRETS !== "1" ? opts.body.split(opts.secret).join("[gizli bağlantı]") : opts.body;
  return prisma.emailLog.create({
    data: { toEmail: opts.to, subject: opts.subject, body, template: opts.template, orderId: opts.orderId ?? null, status: status.status, error: status.error },
  });
}

async function deliver(_opts: { to: string; subject: string; body: string }): Promise<{ status: "LOGGED" | "SENT" | "FAILED"; error: string | null }> {
  return { status: "LOGGED", error: "E-posta gönderimi yapılandırılmadı; yalnız kayda yazıldı." };
}

export function trackingLink(template: string | null | undefined, trackingNumber: string | null | undefined) {
  if (!template || !trackingNumber) return null;
  return template.includes("{no}") ? template.replace("{no}", encodeURIComponent(trackingNumber)) : null;
}
