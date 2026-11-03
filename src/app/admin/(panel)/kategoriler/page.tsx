import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth/session";
import Flash from "@/components/admin/Flash";
import { moveCategoryAction, toggleCategoryAction } from "./actions";

export const metadata = { title: "Kategori yönetimi" };
type SP = Promise<Record<string, string | string[] | undefined>>;

export default async function CategoriesPage({ searchParams }: { searchParams: SP }) {
  await requireStaff("category.write");
  const sp = await searchParams;
  const mains = await prisma.category.findMany({
    where: { parentId: null },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: {
      defaultShippingProfile: true,
      _count: { select: { products: true } },
      children: {
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        include: { defaultShippingProfile: true, _count: { select: { products: true } } },
      },
    },
  });
  const subCount = mains.reduce((n, m) => n + m.children.length, 0);

  const Row = ({ c, sub, first, last }: { c: (typeof mains)[number] | (typeof mains)[number]["children"][number]; sub: boolean; first: boolean; last: boolean }) => (
    <tr data-testid={`cat-row-${c.slug}`}>
      <td style={{ paddingLeft: sub ? 36 : 12 }}>
        {sub ? "└ " : ""}
        <Link href={`/admin/kategoriler/${c.id}`} style={{ fontWeight: sub ? 500 : 700 }}>
          {c.name}
        </Link>
        <div className="muted">/kategori/{c.slug}</div>
      </td>
      <td className="num">{c._count.products}</td>
      <td>{c.defaultShippingProfile?.name ?? "—"}</td>
      <td>
        <span className={`pill ${c.isActive ? "on" : "off"}`}>{c.isActive ? "Aktif" : "Pasif"}</span>
      </td>
      <td>
        <div className="actions">
          <form action={moveCategoryAction} className="inline-form">
            <input type="hidden" name="id" value={c.id} />
            <input type="hidden" name="dir" value="up" />
            <button className="oy-btn oy-btn--ghost oy-btn--sm" type="submit" disabled={first} aria-label={`${c.name} yukarı taşı`}>
              ↑
            </button>
          </form>
          <form action={moveCategoryAction} className="inline-form">
            <input type="hidden" name="id" value={c.id} />
            <input type="hidden" name="dir" value="down" />
            <button className="oy-btn oy-btn--ghost oy-btn--sm" type="submit" disabled={last} aria-label={`${c.name} aşağı taşı`}>
              ↓
            </button>
          </form>
          <form action={toggleCategoryAction} className="inline-form">
            <input type="hidden" name="id" value={c.id} />
            <button className="oy-btn oy-btn--ghost oy-btn--sm" type="submit">
              {c.isActive ? "Pasif yap" : "Aktif yap"}
            </button>
          </form>
          {!sub && (
            <Link className="oy-btn oy-btn--ghost oy-btn--sm" href={`/admin/kategoriler/yeni?ust=${c.id}`}>
              + Alt kategori
            </Link>
          )}
        </div>
      </td>
    </tr>
  );

  return (
    <>
      <div className="adm-head">
        <div>
          <h1>Kategori ve alt kategori yönetimi</h1>
          <p>
            {mains.length} ana kategori · {subCount} alt kategori
          </p>
        </div>
        <Link className="oy-btn oy-btn--primary" href="/admin/kategoriler/yeni">
          + Yeni ana kategori
        </Link>
      </div>
      <Flash sp={sp} />
      <div className="tbl-wrap">
        <table className="tbl" data-testid="category-table">
          <thead>
            <tr>
              <th>Kategori</th>
              <th className="num">Ürün</th>
              <th>Varsayılan kargo</th>
              <th>Durum</th>
              <th>İşlemler</th>
            </tr>
          </thead>
          <tbody>
            {mains.map((m, i) => (
              <FragmentRows key={m.id}>
                <Row c={m} sub={false} first={i === 0} last={i === mains.length - 1} />
                {m.children.map((c, j) => (
                  <Row key={c.id} c={c} sub first={j === 0} last={j === m.children.length - 1} />
                ))}
              </FragmentRows>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function FragmentRows({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
