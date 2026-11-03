import { RequestResetForm } from "@/components/shop/ResetForms";

export const metadata = { title: "Şifremi unuttum", robots: { index: false } };

export default function ForgotPage() {
  return (
    <>
      <h1 className="h1">Şifremi unuttum</h1>
      <p className="muted">Üyelikte kullandığınız e-posta adresini girin; şifrenizi yenilemeniz için bir bağlantı gönderelim.</p>
      <RequestResetForm />
    </>
  );
}
