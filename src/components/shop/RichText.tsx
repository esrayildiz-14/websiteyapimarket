/** Basit içerik biçimi: "## " başlık, "- " madde, boş satır paragraf. HTML yorumlanmaz (XSS'e karşı güvenli). */
export default function RichText({ text }: { text: string }) {
  const blocks = text.replace(/\r/g, "").split(/\n{2,}/);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 820, lineHeight: 1.6 }}>
      {blocks.map((b, i) => {
        const lines = b.split("\n").filter((l) => l.trim() !== "");
        if (!lines.length) return null;
        if (lines.every((l) => l.startsWith("- ")))
          return (
            <ul key={i} style={{ margin: 0 }}>
              {lines.map((l, j) => (
                <li key={j}>{l.slice(2)}</li>
              ))}
            </ul>
          );
        return (
          <div key={i}>
            {lines.map((l, j) =>
              l.startsWith("## ") ? (
                <h2 key={j} className="h3" style={{ marginTop: 8 }}>
                  {l.slice(3)}
                </h2>
              ) : l.startsWith("- ") ? (
                <ul key={j} style={{ margin: 0 }}>
                  <li>{l.slice(2)}</li>
                </ul>
              ) : (
                <p key={j} style={{ margin: 0 }}>
                  {l}
                </p>
              ),
            )}
          </div>
        );
      })}
    </div>
  );
}
