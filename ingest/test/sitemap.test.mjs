// Unit tests for the sitemap lastmod helpers in scripts/sitemap.mjs (HLW-061). No git, no network.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileForLoc, parseSitemap, stampSitemap, changedUrls } from "../../scripts/sitemap.mjs";

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://havasulakeweather.com/</loc>
    <lastmod>2026-08-24</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>https://havasulakeweather.com/water.html</loc>
    <lastmod>2026-08-24</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.9</priority>
  </url>
</urlset>
`;

test("fileForLoc: root maps to index.html, pages to their file, foreign hosts to null", () => {
  assert.equal(fileForLoc("https://havasulakeweather.com/"), "web/index.html");
  assert.equal(fileForLoc("https://havasulakeweather.com/wind.html"), "web/wind.html");
  assert.equal(fileForLoc("https://example.com/wind.html"), null);
});

test("parseSitemap: loc → lastmod in document order", () => {
  assert.deepEqual(parseSitemap(XML), {
    "https://havasulakeweather.com/": "2026-08-24",
    "https://havasulakeweather.com/water.html": "2026-08-24",
  });
  assert.deepEqual(parseSitemap(""), {});
});

test("stampSitemap: sets lastmod per page and drops changefreq/priority", () => {
  const out = stampSitemap(XML, (loc) => (loc.endsWith("water.html") ? "2026-11-06" : "2026-10-22"));
  assert.deepEqual(parseSitemap(out), {
    "https://havasulakeweather.com/": "2026-10-22",
    "https://havasulakeweather.com/water.html": "2026-11-06",
  });
  assert.doesNotMatch(out, /changefreq|priority/);
  assert.match(out, /^<\?xml[\s\S]*<urlset[^>]*>\n  <url>\n    <loc>/);
  assert.match(out, /<\/url>\n<\/urlset>\n$/);
});

test("stampSitemap: keeps the existing lastmod when no git date is known", () => {
  const out = stampSitemap(XML, () => null);
  assert.equal(parseSitemap(out)["https://havasulakeweather.com/"], "2026-08-24");
});

test("stampSitemap: idempotent on its own output", () => {
  const date = () => "2026-11-06";
  const once = stampSitemap(XML, date);
  assert.equal(stampSitemap(once, date), once);
});

test("changedUrls: only new URLs or moved dates", () => {
  const live = stampSitemap(XML, () => "2026-10-22");
  const next = stampSitemap(XML, (loc) => (loc.endsWith("water.html") ? "2026-11-06" : "2026-10-22"))
    .replace("</urlset>", "  <url>\n    <loc>https://havasulakeweather.com/faq.html</loc>\n    <lastmod>2026-11-06</lastmod>\n  </url>\n</urlset>");
  assert.deepEqual(changedUrls(live, next), [
    "https://havasulakeweather.com/water.html",
    "https://havasulakeweather.com/faq.html",
  ]);
  assert.deepEqual(changedUrls(next, next), []);
});

test("changedUrls: no live copy → every URL counts as changed", () => {
  assert.equal(changedUrls("", XML).length, 2);
  assert.equal(changedUrls(null, XML).length, 2);
});
