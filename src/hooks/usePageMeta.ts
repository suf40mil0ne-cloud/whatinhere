import { useEffect } from "react";

function setMetaByName(name: string, content: string) {
  let element = document.querySelector(`meta[name="${name}"]`) as HTMLMetaElement | null;
  if (!element) {
    element = document.createElement("meta");
    element.setAttribute("name", name);
    document.head.appendChild(element);
  }
  element.setAttribute("content", content);
}

function setMetaByProperty(property: string, content: string) {
  let element = document.querySelector(`meta[property="${property}"]`) as HTMLMetaElement | null;
  if (!element) {
    element = document.createElement("meta");
    element.setAttribute("property", property);
    document.head.appendChild(element);
  }
  element.setAttribute("content", content);
}

function setCanonical(url: string) {
  let link = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
  if (!link) {
    link = document.createElement("link");
    link.rel = "canonical";
    document.head.appendChild(link);
  }
  link.href = url;
}

export function usePageMeta(input: { title: string; description: string; canonicalPath: string }) {
  useEffect(() => {
    const canonical = `https://whatsinhere.pages.dev${input.canonicalPath}`;

    document.title = input.title;
    setMetaByName("description", input.description);
    setMetaByProperty("og:title", input.title);
    setMetaByProperty("og:description", input.description);
    setMetaByProperty("og:type", "website");
    setMetaByProperty("og:url", canonical);
    setCanonical(canonical);
  }, [input.canonicalPath, input.description, input.title]);
}

export function useJsonLd(id: string, payload: Record<string, unknown>) {
  useEffect(() => {
    const existing = document.getElementById(id);
    if (existing) existing.remove();

    const script = document.createElement("script");
    script.id = id;
    script.type = "application/ld+json";
    script.text = JSON.stringify(payload);
    document.head.appendChild(script);

    return () => {
      script.remove();
    };
  }, [id, payload]);
}
