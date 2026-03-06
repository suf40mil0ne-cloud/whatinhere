const fs = require("fs");
const path = require("path");

const key =
  process.env.NEXT_PUBLIC_KAKAO_MAP_JS_KEY ||
  process.env.KAKAO_MAP_JS_KEY ||
  "";
const allowEmpty = process.env.ALLOW_EMPTY_KAKAO_MAP_KEY === "1";

if (!key && !allowEmpty) {
  console.error(
    "[build-pages] Missing Kakao Maps key. Set NEXT_PUBLIC_KAKAO_MAP_JS_KEY or KAKAO_MAP_JS_KEY."
  );
  process.exit(1);
}

const configJs =
  "window.__APP_CONFIG__ = Object.assign({}, window.__APP_CONFIG__, { KAKAO_MAP_JS_KEY: " +
  JSON.stringify(key) +
  " });\n";

for (const rel of ["public/config.js", "config.js"]) {
  const file = path.join(__dirname, "..", rel);
  fs.writeFileSync(file, configJs, "utf8");
}

console.log("[build-pages] wrote config.js");
