#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

function parseArgs(argv) {
  const args = {
    source: "both",
    limit: "40",
    scrolls: "6",
    "profile-reposts": "today",
  };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      args.help = true;
      continue;
    }
    if (!arg.startsWith("--")) {
      continue;
    }
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
      continue;
    }
    args[key] = next;
    i += 1;
  }
  return args;
}

function usage() {
  console.log(
    [
      "Usage:",
      "  node capture_x_feed.cjs --storage-state /path/to/state.json --handle myhandle --source both --output candidates.json",
      "",
      "Options:",
      "  --source  home | profile | both",
      "  --limit   max unique items to keep per source, default 40",
      "  --scrolls number of incremental scrolls per page, default 6",
      "  --profile-reposts today | all, default today",
    ].join("\n"),
  );
}

function ensureOutput(outputPath) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
}

function uniqByUrl(items) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    if (!item.url || seen.has(item.url)) {
      continue;
    }
    seen.add(item.url);
    out.push(item);
  }
  return out;
}

function isSameLocalDay(isoString, now = new Date()) {
  if (!isoString) return false;
  const value = new Date(isoString);
  if (Number.isNaN(value.getTime())) return false;
  return (
    value.getFullYear() === now.getFullYear() &&
    value.getMonth() === now.getMonth() &&
    value.getDate() === now.getDate()
  );
}

async function detectHandle(page) {
  const handle = await page.evaluate(() => {
    const candidates = [];
    const fromText = (value) => {
      const text = value || "";
      const match = text.match(/@([A-Za-z0-9_]{1,15})/);
      return match ? match[1] : null;
    };

    const accountSwitcher = document.querySelector('[data-testid="SideNav_AccountSwitcher_Button"]');
    if (accountSwitcher) {
      const hit = fromText(accountSwitcher.innerText);
      if (hit) candidates.push(hit);
    }

    const profileLink = document.querySelector('a[data-testid="AppTabBar_Profile_Link"]');
    if (profileLink) {
      const href = profileLink.getAttribute("href") || "";
      const match = href.match(/^\/([A-Za-z0-9_]{1,15})$/);
      if (match) candidates.push(match[1]);
    }

    return candidates[0] || null;
  });

  return handle;
}

async function tryClickForYou(page) {
  const selectors = [
    'a[role="tab"]',
    'div[role="tab"]',
  ];
  for (const selector of selectors) {
    const tabs = await page.locator(selector).all();
    for (const tab of tabs) {
      const text = (await tab.textContent()) || "";
      if (/for you|为你推荐|推薦|추천/i.test(text)) {
        await tab.click().catch(() => {});
        await page.waitForTimeout(1200);
        return;
      }
    }
  }
}

async function extractArticles(page, source, handle) {
  return page.evaluate(
    ({ source, handle }) => {
      const articles = Array.from(document.querySelectorAll("article"));
      const uniq = (values) => Array.from(new Set(values.filter(Boolean)));
      const normalizeUrl = (href) => {
        if (!href) return null;
        try {
          const url = new URL(href, location.origin);
          const match = url.pathname.match(/^\/([^/]+)\/status\/(\d+)/);
          if (match) {
            url.pathname = `/${match[1]}/status/${match[2]}`;
            url.search = "";
            url.hash = "";
          }
          return url.toString();
        } catch {
          return null;
        }
      };
      const results = [];
      for (const article of articles) {
        const statusLinks = Array.from(article.querySelectorAll('a[href*="/status/"]'));
        const directStatusLink =
          statusLinks.find((node) => !/\/analytics(?:\/|$|\?)/.test(node.getAttribute("href") || "")) ||
          statusLinks[0];
        const link =
          directStatusLink ||
          article.querySelector('a time')?.closest("a");
        const url = normalizeUrl(link && link.getAttribute("href"));
        const text = Array.from(article.querySelectorAll('[data-testid="tweetText"]'))
          .map((node) => node.innerText.trim())
          .filter(Boolean)
          .join("\n");
        const userName = article.querySelector('[data-testid="User-Name"]');
        const userText = userName ? userName.innerText.trim() : "";
        const handles = userText.match(/@[A-Za-z0-9_]+/g) || [];
        const authorHandle = handles.length > 0 ? handles[0].slice(1) : null;
        const author =
          userText
            .split("\n")
            .map((part) => part.trim())
            .find((part) => part && !part.startsWith("@") && !/^\d/.test(part)) || null;
        const publishedAt = article.querySelector("time")?.getAttribute("datetime") || null;
        const articleText = article.innerText || "";
        const socialContext =
          articleText
            .split("\n")
            .find((line) => /(reposted|转发了|已转发|轉發|repost)/i.test(line)) || null;
        const media = uniq(
          Array.from(
            article.querySelectorAll(
              '[data-testid="tweetPhoto"] img, [data-testid="videoPlayer"] img, [poster]',
            ),
          )
            .map((node) => node.getAttribute("src") || node.getAttribute("poster"))
            .map((src) => {
              try {
                return src ? new URL(src, location.origin).toString() : null;
              } catch {
                return null;
              }
            }),
        );
        const externalLinks = uniq(
          Array.from(article.querySelectorAll("a[href]"))
            .map((node) => node.getAttribute("href"))
            .map((href) => normalizeUrl(href))
            .filter((href) => {
              if (!href) return false;
              if (href === url) return false;
              if (/\/analytics(?:\/|$|\?)/.test(href)) return false;
              if (/^https:\/\/x\.com\/[^/]+\/status\/\d+\/photo\/\d+/.test(href)) return false;
              if (/^https:\/\/x\.com\/hashtag\//.test(href)) return false;
              return !/^https:\/\/x\.com\//.test(href);
            }),
        );
        const isLikelyRepost =
          source !== "profile"
            ? true
            : Boolean(socialContext) ||
              (authorHandle && handle && authorHandle.toLowerCase() !== handle.toLowerCase());
        if (!url || !text) {
          continue;
        }
        if (source === "profile" && !isLikelyRepost) {
          continue;
        }
        results.push({
          source,
          url,
          text,
          author,
          authorHandle,
          publishedAt,
          socialContext,
          media,
          externalLinks,
          capturedAt: new Date().toISOString(),
        });
      }
      return results;
    },
    { source, handle },
  );
}

async function collectFromPage(page, url, source, handle, scrolls) {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  if (source === "home") {
    await tryClickForYou(page);
  }
  const items = [];
  for (let i = 0; i < scrolls; i += 1) {
    await page.waitForTimeout(1500);
    items.push(...(await extractArticles(page, source, handle)));
    await page.mouse.wheel(0, 2200);
  }
  return items;
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help || !args["storage-state"] || !args.output) {
    usage();
    process.exit(args.help ? 0 : 1);
  }

  const outputPath = path.resolve(args.output);
  ensureOutput(outputPath);

  const { chromium } = require("playwright");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    storageState: path.resolve(args["storage-state"]),
    viewport: { width: 1440, height: 1200 },
  });
  const page = await context.newPage();

  const scrolls = Number(args.scrolls) || 6;
  const limit = Number(args.limit) || 40;

  let handle = args.handle || null;
  if (args.source === "profile" || args.source === "both") {
    await page.goto("https://x.com/home", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2500);
    handle = handle || (await detectHandle(page));
    if (!handle) {
      console.error("Could not detect the logged-in X handle. Pass --handle explicitly.");
      process.exit(1);
    }
  }

  let items = [];
  if (args.source === "home" || args.source === "both") {
    const homeItems = uniqByUrl(
      await collectFromPage(page, "https://x.com/home", "home", handle, scrolls),
    ).slice(0, limit);
    items.push(...homeItems);
  }
  if (args.source === "profile" || args.source === "both") {
    let profileItems = uniqByUrl(
      await collectFromPage(page, `https://x.com/${handle}`, "profile", handle, scrolls),
    );
    if (args["profile-reposts"] === "today") {
      profileItems = profileItems.filter((item) => isSameLocalDay(item.publishedAt));
    }
    items.push(...profileItems.slice(0, limit));
  }

  items = uniqByUrl(items);
  const payload = {
    generatedAt: new Date().toISOString(),
    handle,
    source: args.source,
    count: items.length,
    items,
  };
  fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2));
  console.log(`Saved ${items.length} items to ${outputPath}`);

  await browser.close();
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
});
