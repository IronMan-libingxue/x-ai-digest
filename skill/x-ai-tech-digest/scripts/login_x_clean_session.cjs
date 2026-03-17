#!/usr/bin/env node

const fs = require("fs");
const fsp = require("fs/promises");
const os = require("os");
const path = require("path");

function parseArgs(argv) {
  const args = {
    chromePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      args.help = true;
      continue;
    }
    if (!arg.startsWith("--")) continue;
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
      "  node login_x_clean_session.cjs --output /path/to/x-storage-state.json",
      "",
      "Launch a clean temporary Chrome profile, open the standard X login flow,",
      "wait for successful login, then export Playwright storage state.",
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

  const userDataDir = await fsp.mkdtemp(path.join(os.tmpdir(), "x-clean-login-"));
  const { chromium } = require("playwright");
  const context = await chromium.launchPersistentContext(userDataDir, {
    executablePath: args.chromePath,
    headless: false,
    viewport: { width: 1440, height: 1200 },
  });

  const page = context.pages()[0] || (await context.newPage());
  page.setDefaultTimeout(10 * 60 * 1000);

  console.log("Opened clean Chrome profile.");
  console.log("Complete login in the standard X flow. Waiting up to 10 minutes.");

  await page.goto("https://x.com/i/flow/login", { waitUntil: "domcontentloaded" });

  await page.waitForFunction(
    () => {
      const hasTimeline = document.querySelector('article[data-testid="tweet"]');
      const hasCompose = document.querySelector('[data-testid="SideNav_NewTweet_Button"]');
      const onHome = /^https:\/\/x\.com\/home/.test(location.href);
      return Boolean((hasTimeline || hasCompose) && onHome);
    },
    { timeout: 10 * 60 * 1000 },
  );

  await context.storageState({ path: outputPath });
  console.log(`Saved storage state to ${outputPath}`);
  await context.close();
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
});
