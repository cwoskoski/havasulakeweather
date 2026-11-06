/**
 * Havasu Lake Weather — sitemap lastmod stamping (HLW-061).
 *
 * Run by the site deploy job before the S3 sync:
 *   node scripts/sitemap.mjs stamp web/sitemap.xml            → rewrites each <lastmod> from git
 *   node scripts/sitemap.mjs changed old.xml web/sitemap.xml  → prints URLs whose lastmod moved
 *
 * A page's date is the last first-parent commit on the current branch that touched its file,
 * so a merge counts on the day it landed on main. Needs full history (checkout fetch-depth: 0).
 */

import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const ORIGIN = "https://havasulakeweather.com";
const URL_RE = /<url>[\s\S]*?<\/url>/g;
const LOC_RE = /<loc>\s*([^<\s]+)\s*<\/loc>/;
const LASTMOD_RE = /<lastmod>\s*([^<\s]*)\s*<\/lastmod>/;

// "https://havasulakeweather.com/" → "web/index.html"; ".../wind.html" → "web/wind.html".
export function fileForLoc(loc) {
  if (!loc.startsWith(ORIGIN + "/")) return null;
  const path = loc.slice(ORIGIN.length + 1);
  return "web/" + (path === "" ? "index.html" : path);
}

// { loc: lastmod|null } for every <url> entry, in document order.
export function parseSitemap(xml) {
  const out = {};
  for (const block of xml.match(URL_RE) || []) {
    const loc = block.match(LOC_RE)?.[1];
    if (loc) out[loc] = block.match(LASTMOD_RE)?.[1] || null;
  }
  return out;
}

// Rewrite each <url>: lastmod = dateFor(loc) (kept as-is when that returns null), and
// changefreq / priority dropped (Google ignores both).
export function stampSitemap(xml, dateFor) {
  return xml.replace(URL_RE, (block) => {
    const loc = block.match(LOC_RE)?.[1];
    if (!loc) return block;
    const date = dateFor(loc) || block.match(LASTMOD_RE)?.[1] || null;
    const lines = [`  <url>`, `    <loc>${loc}</loc>`];
    if (date) lines.push(`    <lastmod>${date}</lastmod>`);
    lines.push(`  </url>`);
    return lines.join("\n").trimStart();
  });
}

// URLs in newXml that are new or whose lastmod differs from oldXml. An unreadable/empty old
// sitemap means every URL counts as changed.
export function changedUrls(oldXml, newXml) {
  const before = parseSitemap(oldXml || "");
  const after = parseSitemap(newXml);
  return Object.keys(after).filter((loc) => !(loc in before) || before[loc] !== after[loc]);
}

// UTC YYYY-MM-DD of the last first-parent commit touching `file`, or null if it has none.
export function gitDate(file) {
  const out = execFileSync("git", ["log", "-1", "--first-parent", "--format=%cd", "--date=format-local:%Y-%m-%d", "--", file], {
    encoding: "utf8",
    env: { ...process.env, TZ: "UTC" },
  }).trim();
  return out || null;
}

const [cmd, a, b] = process.argv.slice(2);
if (cmd === "stamp" && a) {
  const xml = readFileSync(a, "utf8");
  const next = stampSitemap(xml, (loc) => {
    const file = fileForLoc(loc);
    return file ? gitDate(file) : null;
  });
  writeFileSync(a, next);
  for (const [loc, date] of Object.entries(parseSitemap(next))) console.log(`${date}  ${loc}`);
} else if (cmd === "changed" && b) {
  let old = "";
  try { old = readFileSync(a, "utf8"); } catch { /* no live copy → everything changed */ }
  for (const loc of changedUrls(old, readFileSync(b, "utf8"))) console.log(loc);
} else if (cmd) {
  console.error("usage: node scripts/sitemap.mjs stamp <sitemap.xml> | changed <old.xml> <new.xml>");
  process.exit(2);
}
