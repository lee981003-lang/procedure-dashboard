import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, extname, join } from "node:path";

const PWA_DIR = "dist-pwa";
const ICON_FILES = ["icon-192.png", "icon-512.png", "maskable-512.png"];
const CACHE_PREFIX = "dashboard-shell-";
const buildVersion = (process.env.BUILD_VERSION || process.env.GITHUB_SHA || "dev").slice(0, 12);

const distIndex = await readFile("dist/index.html", "utf8");
const scriptMatch = distIndex.match(/<script[^>]+src="(.+?)"><\/script>/);
const styleMatch = distIndex.match(/<link[^>]+href="(.+?)"[^>]*>/);

if (!scriptMatch || !styleMatch) {
  throw new Error("dist/index.html에서 JS/CSS 파일을 찾지 못했습니다.");
}

const scriptPath = scriptMatch[1].replace(/^\.\//, "");
const stylePath = styleMatch[1].replace(/^\.\//, "");
const js = await readFile(join("dist", scriptPath), "utf8");
const css = await readFile(join("dist", stylePath), "utf8");

const assetPattern = /["']\.\/assets\/([^"']+\.(?:png|jpg|jpeg|webp|svg))["']/g;
const importMetaAssetPattern = /new URL\(["']([^"']+\.(?:png|jpg|jpeg|webp|svg))["'],import\.meta\.url\)\.href/g;
let bundledJs = js;
let bundledCss = css;

async function assetDataUrl(fileName) {
  const asset = await readFile(join("dist", "assets", fileName));
  const ext = extname(fileName).slice(1).toLowerCase();
  const mime = ext === "svg" ? "image/svg+xml" : `image/${ext === "jpg" ? "jpeg" : ext}`;
  return `data:${mime};base64,${asset.toString("base64")}`;
}

for (const match of js.matchAll(assetPattern)) {
  const dataUrl = await assetDataUrl(match[1]);
  bundledJs = bundledJs.replaceAll(match[0], `"${dataUrl}"`);
}

for (const match of js.matchAll(importMetaAssetPattern)) {
  const dataUrl = await assetDataUrl(match[1]);
  bundledJs = bundledJs.replaceAll(match[0], `"${dataUrl}"`);
}

const fontPattern = /url\((['"]?)(\.\/[^)'"\s]+\.woff2)\1\)/g;
for (const match of css.matchAll(fontPattern)) {
  const font = await readFile(join("dist", dirname(stylePath), match[2]));
  bundledCss = bundledCss.replaceAll(match[0], `url("data:font/woff2;base64,${font.toString("base64")}")`);
}

function pageHtml({ head = "", body = "" } = {}) {
  return `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>실시간 시술 현황 대시보드</title>
${head}    <style>${bundledCss}</style>
  </head>
  <body>
    <div id="root"></div>
    <script type="module">${bundledJs}</script>
${body}  </body>
</html>
`;
}

await writeFile("대시보드.html", pageHtml(), "utf8");
console.log("대시보드.html 생성 완료");

const pwaHead = `    <meta name="theme-color" content="#0284c7" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="default" />
    <meta name="apple-mobile-web-app-title" content="시술 현황" />
    <link rel="manifest" href="./manifest.webmanifest" />
    <link rel="icon" href="./icon-192.png" />
    <link rel="apple-touch-icon" href="./icon-192.png" />
    <style>
      .pwa-update {
        position: fixed;
        left: 50%;
        bottom: 24px;
        z-index: 9999;
        display: flex;
        gap: 12px;
        align-items: center;
        transform: translateX(-50%);
        padding: 12px 16px;
        border-radius: 12px;
        background: #0f172a;
        color: #ffffff;
        font-size: 15px;
        box-shadow: 0 10px 30px rgba(15, 23, 42, 0.35);
      }
      .pwa-update button {
        padding: 8px 14px;
        border: 0;
        border-radius: 8px;
        background: #0284c7;
        color: #ffffff;
        font-size: 15px;
        cursor: pointer;
      }
    </style>
`;

const pwaBody = `    <script>
      (function () {
        if (!("serviceWorker" in navigator)) return;

        function showUpdateBanner(worker) {
          if (document.querySelector(".pwa-update")) return;
          var box = document.createElement("div");
          box.className = "pwa-update";
          var text = document.createElement("span");
          text.textContent = "새 버전이 준비되었습니다";
          var button = document.createElement("button");
          button.type = "button";
          button.textContent = "새로고침";
          button.addEventListener("click", function () {
            button.disabled = true;
            worker.postMessage("SKIP_WAITING");
          });
          box.appendChild(text);
          box.appendChild(button);
          document.body.appendChild(box);
        }

        window.addEventListener("load", function () {
          navigator.serviceWorker
            .register("./sw.js")
            .then(function (registration) {
              if (registration.waiting) showUpdateBanner(registration.waiting);
              registration.addEventListener("updatefound", function () {
                var installing = registration.installing;
                if (!installing) return;
                installing.addEventListener("statechange", function () {
                  if (installing.state === "installed" && navigator.serviceWorker.controller) {
                    showUpdateBanner(installing);
                  }
                });
              });
            })
            .catch(function () {});
        });

        var refreshing = false;
        navigator.serviceWorker.addEventListener("controllerchange", function () {
          if (refreshing) return;
          refreshing = true;
          window.location.reload();
        });
      })();
    </script>
`;

const manifest = {
  name: "실시간 시술 현황 대시보드",
  short_name: "시술 현황",
  start_url: ".",
  scope: "./",
  display: "standalone",
  background_color: "#ffffff",
  theme_color: "#0284c7",
  icons: [
    { src: "./icon-192.png", sizes: "192x192", type: "image/png" },
    { src: "./icon-512.png", sizes: "512x512", type: "image/png" },
    { src: "./maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
  ],
};

const sw = `const CACHE_NAME = "${CACHE_PREFIX}${buildVersion}";
const SHELL_FILES = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
${ICON_FILES.map((file) => `  "./${file}",`).join("\n")}
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.startsWith("${CACHE_PREFIX}") && key !== CACHE_NAME)
          .map((key) => caches.delete(key)),
      ),
    ),
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

// 앱 셸(같은 출처의 문서 navigation)만 오프라인 폴백한다.
// Supabase API·Auth·Realtime을 포함한 데이터 요청은 캐시하지 않고 네트워크에 그대로 맡긴다.
self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || request.mode !== "navigate") return;
  if (new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(
    fetch(request).catch(() => caches.match("./index.html", { cacheName: CACHE_NAME })),
  );
});
`;

await mkdir(PWA_DIR, { recursive: true });
await writeFile(join(PWA_DIR, "index.html"), pageHtml({ head: pwaHead, body: pwaBody }), "utf8");
await writeFile(join(PWA_DIR, "manifest.webmanifest"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
await writeFile(join(PWA_DIR, "sw.js"), sw, "utf8");
for (const file of ICON_FILES) {
  await copyFile(join("pwa", "icons", file), join(PWA_DIR, file));
}
console.log(`${PWA_DIR}/ PWA 배포 묶음 생성 완료 (cache: ${CACHE_PREFIX}${buildVersion})`);
