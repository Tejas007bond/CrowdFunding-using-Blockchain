// Compiles contracts/CrowdFundingContract.sol with solc and writes
// - artifacts/CrowdFunding.abi.json  (ABI + bytecode, used by tests and the frontend)
// Run with: npm run compile
import solc from "solc";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const sourcePath = path.join(root, "contracts", "CrowdFundingContract.sol");
const source = fs.readFileSync(sourcePath, "utf8");

const input = {
  language: "Solidity",
  sources: {
    // Key matches the import path used inside the contract ("contracts/BlockAccount.sol")
    "contracts/CrowdFundingContract.sol": { content: source },
  },
  settings: {
    optimizer: { enabled: true, runs: 200 },
    // ganache 7 does not support the cancun hardfork; shanghai keeps PUSH0
    // but avoids MCOPY/TSTORE, so the bytecode runs on ganache, Remix VM and MetaMask
    evmVersion: "shanghai",
    outputSelection: {
      "*": { "*": ["abi", "evm.bytecode.object"] },
    },
  },
};

// Resolve imports relative to the workspace root so
// `import "contracts/BlockAccount.sol"` resolves to ./contracts/BlockAccount.sol
function findImports(importPath) {
  const resolved = path.join(root, importPath);
  if (fs.existsSync(resolved)) {
    return { contents: fs.readFileSync(resolved, "utf8") };
  }
  return { error: `File not found: ${importPath}` };
}

const output = JSON.parse(
  solc.compile(JSON.stringify(input), { import: findImports })
);

const diagnostics = output.errors || [];
for (const d of diagnostics) {
  const line = `${d.severity.toUpperCase()}: ${d.formattedMessage ?? d.message}`;
  if (d.severity === "error") console.error(line);
  else console.warn(line);
}

if (diagnostics.some((d) => d.severity === "error")) {
  console.error("\nCompilation failed.");
  process.exit(1);
}

const contract = output.contracts["contracts/CrowdFundingContract.sol"].CrowdFunding;
const artifact = {
  contractName: "CrowdFunding",
  abi: contract.abi,
  bytecode: "0x" + contract.evm.bytecode.object,
};

const outPath = path.join(root, "artifacts", "CrowdFunding.abi.json");
fs.writeFileSync(outPath, JSON.stringify(artifact, null, 2) + "\n");
console.log(`Compiled CrowdFunding -> ${path.relative(root, outPath)}`);

// The frontend imports a copy of the artifact from its own src/ folder
const feDir = path.join(root, "frontend", "src");
if (fs.existsSync(feDir)) {
  const fePath = path.join(feDir, "CrowdFunding.abi.json");
  fs.writeFileSync(fePath, JSON.stringify(artifact, null, 2) + "\n");
  console.log(`Copied artifact -> ${path.relative(root, fePath)}`);
}
