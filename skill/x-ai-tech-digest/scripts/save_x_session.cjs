#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

function parseArgs(argv) {
  const args = {};
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
      "  node save_x_session.cjs --output /path/to/x-storage-state.json",
      "",
      "Opens a headed Chromium window for one-time X login, then saves Playwright storage state.",
    ].join("\n"),
  );
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help || !args.output) {
    usage();
    process.exit(args.help ? 0 : 1);
  }

  const outputPath = path.resolve(args.output);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  const { chromium } = require("playwright");
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  console.log("Open browser for X login.");
  console.log("Finish login in the opened browser window. Waiting up to 5 minutes.");

  await page.goto("https://x.com/home", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(
    () => {
      const hasTimeline = document.querySelector('article[data-testid="tweet"]');
      const hasCompose = document.querySelector('[data-testid="SideNav_NewTweet_Button"]');
      return Boolean(hasTimeline || hasCompose);
    },
    { timeout: 5 * 60 * 1000 },
  );

  await context.storageState({ path: outputPath });
  console.log(`Saved storage state to ${outputPath}`);
  await browser.close();
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
});
