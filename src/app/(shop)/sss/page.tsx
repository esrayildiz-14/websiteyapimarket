import { prisma } from "@/lib/prisma";

export const metadata = { title: "Sıkça sorulan sorular" };

export default async function FaqPage() {
  const faqs = await prisma.faq.findMany({ where: { isActive: true }, orderBy: [{ groupName: "asc" }, { sortOrder: "asc" }] });
  const groups = [...new Set(faqs.map((f) => f.groupName ?? "Genel"))];
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({ "@type": "Question", name: f.question, acceptedAnswer: { "@type": "Answer", text: f.answer } })),
  };
  return (
    <>
      <h1 className="h1">Sıkça sorulan sorular</h1>
      {groups.map((g) => (
        <section key={g} style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 820 }}>
          <h2 className="h3">{g}</h2>
          {faqs
            .filter((f) => (f.groupName ?? "Genel") === g)
            .map((f) => (
              <details key={f.id} className="card" style={{ padding: 14 }}>
                <summary style={{ fontWeight: 600, cursor: "pointer" }}>{f.question}</summary>
                <p style={{ marginBottom: 0 }}>{f.answer}</p>
              </details>
            ))}
        </section>
      ))}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
    </>
  );
}
