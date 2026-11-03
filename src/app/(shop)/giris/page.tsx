import { redirect } from "next/navigation";
import { getCurrentCustomer, safeNext } from "@/lib/auth/customer";
import { LoginForm, RegisterForm } from "@/components/shop/AuthForms";

export const metadata = { title: "Giriş yap veya üye ol", robots: { index: false } };
type SP = Promise<Record<string, string | string[] | undefined>>;

export default async function LoginPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const next = safeNext(sp.devam);
  if (await getCurrentCustomer()) redirect(next);
  return (
    <>
      <h1 className="h1">Giriş yap veya üye ol</h1>
      <div className="grid-2" style={{ alignItems: "start" }}>
        <LoginForm next={next} />
        <RegisterForm next={next} />
      </div>
    </>
  );
}
