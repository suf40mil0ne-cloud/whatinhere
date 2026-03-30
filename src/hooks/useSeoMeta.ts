import { useEffect, useState } from "react";

const SITE_URL = "https://whatsinhere.pages.dev";

export type RouteKey = "/" | "/about" | "/contact" | "/privacy" | "/terms";

interface PageMeta {
  title: string;
  description: string;
}

const PAGE_META: Record<RouteKey, PageMeta> = {
  "/": {
    title: "여기 뭐 생겨요? | 내 주변 대형 공사·개발사업 지도",
    description: "내 주변의 대형 공사·개발사업을 지도에서 확인하세요. 공공데이터를 바탕으로 주요 사업만 간단히 보여줍니다.",
  },
  "/about": {
    title: "About | 여기 뭐 생겨요?",
    description: "여기 뭐 생겨요?는 내 주변 공사·개발 정보를 공공데이터 기반으로 시각화하는 지도 서비스입니다.",
  },
  "/contact": {
    title: "Contact | 여기 뭐 생겨요?",
    description: "서비스 문의와 데이터 오류 제보를 위한 연락 방법을 확인하세요.",
  },
  "/privacy": {
    title: "Privacy | 여기 뭐 생겨요?",
    description: "쿠키, 광고, 제3자 사업자 사용 가능성, 문의 방법을 포함한 개인정보처리방침입니다.",
  },
  "/terms": {
    title: "Terms | 여기 뭐 생겨요?",
    description: "서비스 이용 시 적용되는 기본 이용 안내와 책임 한계를 확인하세요.",
  },
};

function normalizePathname(pathname: string): RouteKey {
  if (pathname === "/about") return "/about";
  if (pathname === "/contact") return "/contact";
  if (pathname === "/privacy") return "/privacy";
  if (pathname === "/terms") return "/terms";
  return "/";
}

function ensureMetaTag(selector: string, attributes: Record<string, string>, content: string) {
  let element = document.head.querySelector<HTMLMetaElement>(selector);

  if (!element) {
    element = document.createElement("meta");
    Object.entries(attributes).forEach(([key, value]) => element?.setAttribute(key, value));
    document.head.appendChild(element);
  }

  element.setAttribute("content", content);
}

function ensureCanonicalLink(href: string) {
  let element = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');

  if (!element) {
    element = document.createElement("link");
    element.rel = "canonical";
    document.head.appendChild(element);
  }

  element.href = href;
}

export function useSeoMeta() {
  const [pathname, setPathname] = useState<RouteKey>(() => normalizePathname(window.location.pathname));

  useEffect(() => {
    const handlePopState = () => setPathname(normalizePathname(window.location.pathname));
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    const meta = PAGE_META[pathname];
    const canonicalUrl = `${SITE_URL}${pathname === "/" ? "" : pathname}`;

    document.title = meta.title;
    ensureMetaTag('meta[name="description"]', { name: "description" }, meta.description);
    ensureMetaTag('meta[property="og:title"]', { property: "og:title" }, meta.title);
    ensureMetaTag('meta[property="og:description"]', { property: "og:description" }, meta.description);
    ensureMetaTag('meta[property="og:type"]', { property: "og:type" }, "website");
    ensureMetaTag('meta[property="og:url"]', { property: "og:url" }, canonicalUrl);
    ensureCanonicalLink(canonicalUrl);
  }, [pathname]);

  return { pathname };
}
