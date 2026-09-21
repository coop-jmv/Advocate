// Notify IndexNow-participating search engines (Bing, Yandex, Seznam, Naver…)
// that the pages in public/sitemap.xml exist or changed. Google does not use
// IndexNow — submit the sitemap in Google Search Console instead.
//
// Run AFTER deploying: the engines fetch https://lexdiary.online/<key>.txt to
// prove we own the host, so the key file must already be live.
//
//   bun run seo:indexnow
import { readFileSync } from "node:fs";

const HOST = "lexdiary.online";
const KEY = "a8f5fa853297489ec521761dbe82b775"; // also served as public/a8f5fa853297489ec521761dbe82b775.txt

const sitemap = readFileSync(new URL("../public/sitemap.xml", import.meta.url), "utf8");
const urlList = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
if (urlList.length === 0) throw new Error("No <loc> entries found in public/sitemap.xml");

const keyCheck = await fetch(`https://${HOST}/${KEY}.txt`);
const served = keyCheck.ok ? (await keyCheck.text()).trim() : "";
if (served !== KEY) {
  throw new Error(
    `Key file not live at https://${HOST}/${KEY}.txt (HTTP ${keyCheck.status}) — deploy first.`,
  );
}

const response = await fetch("https://api.indexnow.org/indexnow", {
  method: "POST",
  headers: { "Content-Type": "application/json; charset=utf-8" },
  body: JSON.stringify({
    host: HOST,
    key: KEY,
    keyLocation: `https://${HOST}/${KEY}.txt`,
    urlList,
  }),
});
// 200 = accepted, 202 = accepted, key validation pending.
console.log(`IndexNow: HTTP ${response.status} for ${urlList.length} URLs`);
if (!response.ok) {
  console.error(await response.text());
  process.exit(1);
}
