#!/usr/bin/env node

const fs = require("fs");
const fsp = require("fs/promises");
const os = require("os");
const path = require("path");

function parseArgs(argv) {
  const args = {
    sourceRoot: path.join(os.homedir(), "Library/Application Support/Google/Chrome"),
    profile: "Default",
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
      "  node import_chrome_x_session.cjs --output /path/to/x-storage-state.json",
      "  node import_chrome_x_session.cjs --output /path/to/x-storage-state.json --use-live-profile",
      "",
      "Copies the local Chrome profile metadata needed for login reuse, launches a temporary persistent browser,",
      "opens X home, and exports a Playwright storage-state file.",
    ].join("\n"),
  );
}

async function exists(target) {
  try {
    await fsp.access(target);
    return true;
  } catch {
    return false;
  }
}

async function copyIfExists(from, to) {
  if (!(await exists(from))) return;
  await fsp.cp(from, to, { recursive: true, force: true });
}

async function prepareUserDataDir(sourceRoot, profileName) {
  const tempRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "x-chrome-profile-"));
  await copyIfExists(path.join(sourceRoot, "Local State"), path.join(tempRoot, "Local State"));
  await copyIfExists(path.join(sourceRoot, profileName), path.join(tempRoot, profileName));
  return tempRoot;
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help || !args.output) {
    usage();
    process.exit(args.help ? 0 : 1);
  }

  const outputPath = path.resolve(args.output);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  const sourceRoot = path.resolve(args.sourceRoot);
  const userDataDir = args["use-live-profile"]
    ? sourceRoot
    : await prepareUserDataDir(sourceRoot, args.profile);
  console.log(
    args["use-live-profile"]
      ? `Using live Chrome user data dir: ${userDataDir}`
      : `Prepared temporary Chrome user data dir: ${userDataDir}`,
  );

  const { chromium } = require("playwright");
  const context = await chromium.launchPersistentContext(userDataDir, {
    executablePath: args.chromePath,
    headless: false,
    args: [`--profile-directory=${args.profile}`],
    viewport: { width: 1440, height: 1200 },
  });

  const existingPages = context.pages();
  const page = await context.newPage();
  for (const existingPage of existingPages) {
    if (existingPage !== page) {
      await existingPage.close().catch(() => {});
    }
  }
  page.setDefaultTimeout(10 * 60 * 1000);
  await page.goto("https://x.com/home", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(4000);

  const currentUrl = page.url();
  if (/login|i\/flow\/login/i.test(currentUrl)) {
    console.log("No active X session found in local Chrome profile copy.");
    console.log("Log in in the opened Chrome window. Waiting up to 5 minutes.");
    await page.waitForFunction(
      () => {
        const hasTimeline = document.querySelector('article[data-testid="tweet"]');
        const hasCompose = document.querySelector('[data-testid="SideNav_NewTweet_Button"]');
        return Boolean(hasTimeline || hasCompose);
      },
      { timeout: 10 * 60 * 1000 },
    );
  }

  await context.storageState({ path: outputPath });
  console.log(`Saved storage state to ${outputPath}`);
  await context.close();
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
});
