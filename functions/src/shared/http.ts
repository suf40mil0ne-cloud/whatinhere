export async function httpGetJson(url: string, init?: RequestInit) {
  const res = await fetch(url, init);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} ${res.statusText}: ${text.slice(0, 300)}`);
  }
  return res.json();
}

export function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
