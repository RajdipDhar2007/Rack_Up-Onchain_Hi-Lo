// One-command local stack: Anvil + contract deployment + mock VRF keeper + Next.js dev server.
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import os from "node:os";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPublicClient, createWalletClient, http, parseAbi } from "viem";
import { foundry } from "viem/chains";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RPC = "http://127.0.0.1:8545";
const ADMIN = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const RELAYER = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
// Public Anvil dev key #1 (relayer). Never use on a real network.
const RELAYER_KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";

const exe = process.platform === "win32" ? ".exe" : "";
function findTool(name) {
  const dirs = [process.env.FOUNDRY_BIN, ...(process.env.PATH ?? "").split(path.delimiter), "P:/tools-foundry"].filter(Boolean);
  for (const dir of dirs) {
    const candidate = path.join(dir, name + exe);
    if (existsSync(candidate)) return candidate;
  }
  throw new Error(`${name} not found. Install Foundry or set FOUNDRY_BIN to its folder.`);
}

const children = [];
function shutdown() {
  for (const child of children) child.kill();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

const client = createPublicClient({ chain: foundry, transport: http(RPC) });
const alive = () => client.getChainId().then(() => true, () => false);

if (!(await alive())) {
  console.log("Starting Anvil…");
  children.push(spawn(findTool("anvil"), ["--host", "127.0.0.1", "--silent"], { stdio: "inherit" }));
  for (let i = 0; i < 50 && !(await alive()); i++) await new Promise((r) => setTimeout(r, 200));
}
if (!(await alive())) throw new Error("Anvil did not start on " + RPC);

console.log("Deploying contracts…");
const deploy = spawnSync(
  findTool("forge"),
  ["script", "script/DeployLocal.s.sol", "--rpc-url", RPC, "--broadcast", "--unlocked", "--sender", ADMIN],
  { cwd: path.join(root, "contracts"), env: { ...process.env, ADMIN_ADDRESS: ADMIN, RELAYER_ADDRESS: RELAYER }, encoding: "utf8" },
);
if (deploy.status !== 0) throw new Error(deploy.stdout + deploy.stderr);
const pick = (label) => new RegExp(`${label}[^0-9a-zA-Z]{0,20}(0x[0-9a-fA-F]{40})`).exec(deploy.stdout)?.[1];
const [coordinator, game, faucet] = ["COORDINATOR", "GAME", "FAUCET"].map(pick);
if (!coordinator || !game || !faucet) throw new Error("Could not read deployed addresses:\n" + deploy.stdout);
console.log({ coordinator, game, faucet });

// Mock VRF keeper: fulfils every pending randomness request with a random word.
const coordinatorAbi = parseAbi([
  "function nextRequestId() view returns (uint256)",
  "function requests(uint256) view returns (address consumer,uint32 numWords,bool fulfilled)",
  "function fulfillRandomWords(uint256 requestId,uint256[] randomWords)",
]);
const keeper = createWalletClient({ account: "0xa0Ee7A142d267C1f36714E4a8F75612F20a79720", chain: foundry, transport: http(RPC) });
let nextToCheck = 1n;
let busy = false;
setInterval(async () => {
  if (busy) return;
  busy = true;
  try {
    const next = await client.readContract({ address: coordinator, abi: coordinatorAbi, functionName: "nextRequestId" });
    while (nextToCheck < next) {
      const [, numWords, fulfilled] = await client.readContract({ address: coordinator, abi: coordinatorAbi, functionName: "requests", args: [nextToCheck] });
      if (!fulfilled) {
        const words = Array.from({ length: numWords }, () => BigInt("0x" + randomBytes(32).toString("hex")));
        // Fulfil after a short pause so the "ball in motion" state is visible in the UI.
        await new Promise((r) => setTimeout(r, 2500));
        const hash = await keeper.writeContract({ address: coordinator, abi: coordinatorAbi, functionName: "fulfillRandomWords", args: [nextToCheck, words] });
        const receipt = await client.waitForTransactionReceipt({ hash });
        if (receipt.status !== "success") throw new Error(`fulfil of request ${nextToCheck} reverted`);
        console.log(`VRF request ${nextToCheck} fulfilled`);
      }
      nextToCheck++;
    }
  } catch (error) {
    console.error("keeper:", error.shortMessage ?? error.message);
  } finally {
    busy = false;
  }
}, 1000);

const lanIps = Object.values(os.networkInterfaces())
  .flat()
  .filter((net) => net && net.family === "IPv4" && !net.internal)
  .map((net) => net.address);
console.log("Starting Next.js …");
const next = spawn(process.execPath, [path.join(root, "node_modules/next/dist/bin/next"), "dev", "-H", "0.0.0.0"], {
  cwd: root,
  stdio: "inherit",
  env: {
    ...process.env,
    NEXT_PUBLIC_LOCAL_CHAIN: "true",
    LOCAL_LAN_IPS: lanIps.join(","),
    LOCAL_RPC_URL: RPC,
    NEXT_PUBLIC_APP_URL: "http://localhost:3000",
    NEXT_PUBLIC_GAME_ADDRESS: game,
    NEXT_PUBLIC_FAUCET_ADDRESS: faucet,
    NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL: RPC,
    BASE_SEPOLIA_RPC_URL: RPC,
    FAUCET_RELAYER_PRIVATE_KEY: RELAYER_KEY,
    FAUCET_AUTH_SECRET: randomBytes(32).toString("hex"),
  },
});
children.push(next);
setTimeout(() => {
  console.log("\n================ RACK UP LOCAL GAME ================");
  console.log("Admin (this computer):  http://localhost:3000/admin");
  for (const ip of lanIps) console.log(`Players (same Wi-Fi):    http://${ip}:3000`);
  console.log("====================================================\n");
}, 4000);
next.on("exit", shutdown);
