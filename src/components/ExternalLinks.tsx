import { useState } from "react";

const LINKS = [
  {
    key: "naver",
    label: "네이버부동산에서 보기",
    href: (name: string) => `https://land.naver.com/search/search.naver?query=${encodeURIComponent(name)}`,
    favicon: "https://land.naver.com/favicon.ico",
    fallback: "N",
  },
  {
    key: "hogangnono",
    label: "호갱노노에서 보기",
    href: (name: string) => `https://hogangnono.com/search?q=${encodeURIComponent(name)}`,
    favicon: "https://hogangnono.com/favicon.ico",
    fallback: "호",
  },
  {
    key: "kb",
    label: "KB부동산에서 보기",
    href: (name: string) => `https://kbland.kr/map?SearchWord=${encodeURIComponent(name)}`,
    favicon: "https://kbland.kr/favicon.ico",
    fallback: "KB",
  },
];

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
    </span>
  );
}
