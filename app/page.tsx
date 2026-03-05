import Map from "@/components/Map";

export const dynamic = "force-dynamic";

export default function Page(): JSX.Element {
  const appKey =
    process.env.NEXT_PUBLIC_KAKAO_MAP_JS_KEY ||
    process.env.KAKAO_MAP_JS_KEY ||
    "";

  return (
    <>
      <script
        // Pass key from server env to client runtime.
        dangerouslySetInnerHTML={{
          __html: `window.__KAKAO_MAP_JS_KEY__ = ${JSON.stringify(appKey)};`,
        }}
      />
      <Map />
    </>
  );
}
