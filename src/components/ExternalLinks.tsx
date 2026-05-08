import { useState } from "react";

function gFavicon(domain: string) {
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
}

const LINKS = [
  {
    key: "naver",
    label: "네이버부동산에서 보기",
    href: (name: string) => `https://new.land.naver.com/search?query=${encodeURIComponent(name)}`,
    favicon: gFavicon("land.naver.com"),
    fallback: "N",
  },
  {
    key: "hogangnono",
    label: "호갱노노에서 보기",
    href: (name: string) => `https://hogangnono.com/search?q=${encodeURIComponent(name)}`,
    favicon: gFavicon("hogangnono.com"),
    fallback: "호",
  },
];

const RICHGO_FAVICON = gFavicon("richgo.ai");

// Module-level: shared across all component instances, persists for the page lifetime
const richgoCache = new Map<string, string | null>();

function FaviconIcon({ src, fallback }: { src: string; fallback: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <span className="ext-link__fallback">{fallback}</span>;
  return (
    <img
      src={src}
      width={16}
      height={16}
      alt=""
      onError={() => setFailed(true)}
    />
  );
}

export function ExternalLinks({ name }: { name: string }) {
  const [richgoLoading, setRichgoLoading] = useState(false);

  async function handleRichgoClick(e: React.MouseEvent) {
    e.preventDefault();
    if (richgoLoading) return;

    if (richgoCache.has(name)) {
      const danjiId = richgoCache.get(name) ?? null;
      window.open(
        danjiId ? `https://m.richgo.ai/danji/${danjiId}` : "https://m.richgo.ai/pc",
        "_blank",
        "noopener,noreferrer",
      );
      return;
    }

    setRichgoLoading(true);
    try {
      const res = await fetch(`/api/richgo-search?name=${encodeURIComponent(name)}`);
      const data = await res.json() as { danjiId: string | null };
      const danjiId = data.danjiId ?? null;
      richgoCache.set(name, danjiId);
      window.open(
        danjiId ? `https://m.richgo.ai/danji/${danjiId}` : "https://m.richgo.ai/pc",
        "_blank",
        "noopener,noreferrer",
      );
    } catch {
      richgoCache.set(name, null);
      window.open("https://m.richgo.ai/pc", "_blank", "noopener,noreferrer");
    } finally {
      setRichgoLoading(false);
    }
  }

  return (
    <span className="ext-links" onClick={(e) => e.stopPropagation()}>
      {LINKS.map(({ key, label, href, favicon, fallback }) => (
        <a
          key={key}
          href={href(name)}
          target="_blank"
          rel="noopener noreferrer"
          className="ext-link"
          title={label}
          aria-label={label}
        >
          <FaviconIcon src={favicon} fallback={fallback} />
        </a>
      ))}
      <button
        type="button"
        className="ext-link"
        title="리치고에서 보기"
        aria-label="리치고에서 보기"
        onClick={handleRichgoClick}
        disabled={richgoLoading}
      >
        {richgoLoading
          ? <span className="ext-link__spinner" />
          : <FaviconIcon src={RICHGO_FAVICON} fallback="리" />}
      </button>
    </span>
  );
}
