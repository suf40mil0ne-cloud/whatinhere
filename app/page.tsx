import Map from "@/components/Map";

export const dynamic = "force-dynamic";
const DEFAULT_KAKAO_MAP_JS_KEY = "1cb090f11a07b5856a7fe756877f9718";

export default function Page(): JSX.Element {
  const appKey =
    process.env.NEXT_PUBLIC_KAKAO_MAP_JS_KEY ||
    process.env.KAKAO_MAP_JS_KEY ||
    DEFAULT_KAKAO_MAP_JS_KEY;

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
