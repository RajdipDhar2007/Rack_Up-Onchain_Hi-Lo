// Browser end-to-end test for the local stack (run `npm run local` first).
//   node scripts/e2e-local.mjs [adminBaseUrl] [playerBaseUrl]
// Defaults: admin on http://localhost:3000, players on the host's LAN address (or localhost).
// Needs Google Chrome (or Edge) installed. Plays two full rounds with three players and ends the game.
import os from "node:os";
import { chromium } from "@playwright/test";

const lan = Object.values(os.networkInterfaces())
  .flat()
  .find((net) => net && net.family === "IPv4" && !net.internal)?.address;
const adminUrl = process.argv[2] ?? "http://localhost:3000";
const playerUrl = process.argv[3] ?? (lan ? `http://${lan}:3000` : adminUrl);

const browser = await chromium.launch({ channel: process.env.E2E_BROWSER ?? "chrome" });
const problems = [];
const log = (message) => console.log(`✓ ${message}`);
const check = (condition, message) => {
  if (!condition) throw new Error(`FAILED: ${message}`);
};

async function open(base, path) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 1200 } });
  const page = await context.newPage();
  page.on("pageerror", (error) => problems.push(`pageerror: ${error.message}`));
  page.on("console", (message) => message.type() === "error" && problems.push(`console: ${message.text()}`));
  await page.goto(base + path);
  // Admin desk on the host signs in by itself; players tap the sign-in button to get a wallet of their own.
  const signIn = page.locator("button.button--wide", { hasText: "Sign in / create wallet" });
  if (path === "/") {
    await signIn.waitFor();
    await signIn.click();
  }
  await page.waitForFunction(() => /^0x[0-9a-fA-F]{4}/.test(document.querySelector(".header-actions button:last-child")?.textContent ?? ""), null, { timeout: 30_000 });
  return page;
}

const statusIs = (page, pattern) =>
  page.waitForFunction((source) => new RegExp(source, "i").test(document.querySelector(".status-pill")?.textContent ?? ""), pattern, {
    timeout: 120_000,
  });
const buttonEnabled = (page, label) =>
  page.waitForFunction(
    (text) => {
      const button = [...document.querySelectorAll("button")].find((item) => item.textContent.trim() === text);
      return Boolean(button) && !button.disabled;
    },
    label,
    { timeout: 120_000 },
  );
const caption = async (page) => (await page.locator(".ball-caption").innerText()).trim();

const admin = await open(adminUrl, "/admin");
const players = [];
for (const name of ["Alice", "Bobby", "Carol"]) {
  players.push({ name, page: await open(playerUrl, "/") });
}
log(`admin on ${adminUrl}, players on ${playerUrl}`);

// Security: remote devices must not be able to make the node sign as the admin account.
if (new URL(playerUrl).hostname !== "localhost") {
  const denied = await players[0].page.evaluate(async () => {
    const response = await fetch("/api/rpc", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_sendTransaction", params: [{ from: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266", to: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", value: "0x1" }] }),
    });
    return response.status;
  });
  check(denied === 403, "RPC proxy must refuse admin transactions from other devices");
  log("player devices cannot use the admin account");
}

for (const { name, page } of players) {
  await page.getByRole("button", { name: /Claim .* test ETH/ }).click();
  await page.waitForSelector("text=Starter ETH claimed", { timeout: 60_000 });
  await page.fill("#display-name", name);
  await page.getByRole("button", { name: "Join lobby" }).click();
  await page.waitForSelector(`text=in as ${name}`, { timeout: 60_000 });
  log(`${name} claimed starter ETH and joined`);
}

await buttonEnabled(admin, "Start game");
await admin.getByRole("button", { name: "Start game" }).click();
for (const { page } of players) await statusIs(page, "Betting live");
log(`betting is live: ${await caption(players[0].page)}`);

async function bettingRound(roundNumber, sides) {
  const bettors = [];
  for (const { name, page } of players) {
    const input = page.locator('input[aria-label="Wager amount in ETH"]');
    if (await input.count()) bettors.push({ name, page });
  }
  check(bettors.length > 0, `round ${roundNumber}: someone must be able to bet`);
  for (const [index, { name, page }] of bettors.entries()) {
    const side = sides[index % sides.length];
    await page.fill('input[aria-label="Wager amount in ETH"]', "0.0002");
    await page.getByRole("button", { name: new RegExp(`^${side}`) }).click();
    await page.waitForSelector(`text=wager is locked on ${side}`, { timeout: 60_000 });
    log(`round ${roundNumber}: ${name} bet 0.0002 ETH on ${side}`);
  }
  await buttonEnabled(admin, "Roll ball");
  await admin.getByRole("button", { name: "Roll ball" }).click();
  for (const { page } of players) await statusIs(page, "Round settled");

  // The caption must never show a half-loaded result (no 0 ball, no transient wrong text).
  const seen = new Set();
  for (let i = 0; i < 20; i++) {
    seen.add(await caption(players[0].page));
    await players[0].page.waitForTimeout(150);
  }
  for (const text of seen) check(!/→ 0\b/.test(text), `caption glitch: "${text}"`);
  await players[0].page.waitForFunction(() => !/Settling/i.test(document.querySelector(".ball-caption")?.textContent ?? ""), null, { timeout: 30_000 });
  log(`round ${roundNumber} result: ${await caption(players[0].page)}`);

  for (const { name, page } of bettors) {
    const claim = page.getByRole("button", { name: "Claim next batch" });
    if (await claim.count()) {
      await claim.click();
      await page.waitForSelector("text=Confirmed on-chain", { timeout: 60_000 });
      log(`round ${roundNumber}: ${name} claimed winnings`);
    }
  }
}

await bettingRound(1, ["Hi", "Lo", "Hi"]);

const survivors = await admin.locator(".metric").filter({ hasText: "Still in game" }).locator("strong").innerText();
if (Number(survivors) > 0) {
  await buttonEnabled(admin, "Next round");
  await admin.getByRole("button", { name: "Next round" }).click();
  for (const { page } of players) await statusIs(page, "Betting live");
  await bettingRound(2, ["Lo", "Hi"]);
}

await buttonEnabled(admin, "End game");
await admin.getByRole("button", { name: "End game" }).click();
await admin.waitForSelector("text=Remaining players", { timeout: 60_000 });
log("admin ended the game");

// A fresh lobby must open so the next game can start.
await players[0].page.waitForFunction(() => /Lobby open/i.test(document.querySelector(".status-pill")?.textContent ?? ""), null, { timeout: 30_000 });
log("lobby reopened for the next game");

const real = problems.filter((text) => !/favicon|Download the React DevTools|status of 403/i.test(text));
await browser.close();
if (real.length) {
  console.error("Browser errors:\n" + real.join("\n"));
  process.exit(1);
}
console.log("\nALL CHECKS PASSED — full game played with no browser errors.");
