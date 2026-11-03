import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import RichText from "@/components/shop/RichText";

type Props = { params: Promise<{ slug: string }> };
const load = async (slug: string) => prisma.page.findFirst({ where: { slug, isPublished: true } });

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const p = await load((await params).slug);
  return p ? { title: p.title, robots: p.type === "LEGAL" && !p.legalApproved ? { index: false } : undefined } : { title: "Sayfa bulunamadı" };
}

export default async function ContentPage({ params }: Props) {
  const p = await load((await params).slug);
  if (!p) notFound();
  return (
    <article style={{ display: "flex", flexDirection: "column", gap: 16 }} data-testid="content-page">
      <h1 className="h1">{p.title}</h1>
      {p.type === "LEGAL" && !p.legalApproved && (
        <div className="flash warn" data-testid="legal-draft">
          Bu metin taslaktır ve henüz hukuki uzman kontrolünden geçmemiştir.
        </div>
      )}
      <RichText text={p.content} />
      <p className="muted">Son güncelleme: {p.updatedAt.toLocaleDateString("tr-TR")}</p>
    </article>
  );
}
