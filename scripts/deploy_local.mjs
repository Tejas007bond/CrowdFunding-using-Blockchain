// Deploys CrowdFunding to a local node and seeds a little state, so the
// frontend can be smoke-tested against real chain data.
// Usage: node scripts/deploy_local.mjs   (requires a node at http://127.0.0.1:8545)
import ganache from "ganache";
import { ethers } from "ethers";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const artifact = JSON.parse(
  fs.readFileSync(path.join(root, "artifacts", "CrowdFunding.abi.json"), "utf8")
);

// Use an external RPC if given, otherwise start an in-process chain
const rpc = process.env.RPC_URL;
const provider = rpc
  ? new ethers.JsonRpcProvider(rpc)
  : new ethers.BrowserProvider(
      ganache.provider({
        wallet: { totalAccounts: 10, defaultBalance: 1000 },
        logging: { quiet: true },
        chain: { chainId: 1337 },
      }),
      undefined,
      { cacheTimeout: -1 }
    );
const [deployer, fundraiser, donor] = await Promise.all(
  [0, 1, 2].map((i) => provider.getSigner(i))
);

const factory = new ethers.ContractFactory(
  artifact.abi,
  artifact.bytecode,
  deployer
);
const cf = await factory.deploy();
await cf.waitForDeployment();
const address = await cf.getAddress();

await (
  await cf.connect(fundraiser).FundRaiserRegister("Alice", "ID-123")
).wait();
await (await cf.connect(donor).DonorRegister("Bob", "ID-789")).wait();
await (
  await cf
    .connect(fundraiser)
    .RaiseFundTicket("Clean water well", "Build a well in Kenya", ethers.parseEther("3"))
).wait();
await (
  await cf
    .connect(donor)
    .DonateNow(ethers.parseEther("1"), { value: ethers.parseEther("1") })
).wait();

console.log(
  JSON.stringify(
    {
      address,
      deployer: await deployer.getAddress(),
      fundraiser: await fundraiser.getAddress(),
      donor: await donor.getAddress(),
      note: "in-process chain dies when this script exits; set RPC_URL to target an external node",
    },
    null,
    2
  )
);

if (!rpc) await provider.destroy?.();
