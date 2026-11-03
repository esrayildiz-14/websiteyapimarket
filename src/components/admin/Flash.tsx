/** ?ok=… / ?hata=… / ?uyari=… sorgu parametrelerinden gelen bilgilendirme mesajı */
export default function Flash({ sp }: { sp: Record<string, string | string[] | undefined> }) {
  const pick = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string).slice(0, 300) : null);
  const ok = pick("ok");
  const err = pick("hata");
  const warn = pick("uyari");
  return (
    <>
      {ok && (
        <div className="flash ok" role="status" data-testid="flash-ok">
          {ok}
        </div>
      )}
      {warn && (
        <div className="flash warn" role="status">
          {warn}
        </div>
      )}
      {err && (
        <div className="flash err" role="alert" data-testid="flash-err">
          {err}
        </div>
      )}
    </>
  );
}

export function withMsg(path: string, key: "ok" | "hata" | "uyari", msg: string) {
  return `${path}${path.includes("?") ? "&" : "?"}${key}=${encodeURIComponent(msg)}`;
}
