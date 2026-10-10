// Browser smoke test for the frontend.
//
// Launches headless Chrome against the built app (vite preview), injects a
// minimal window.ethereum shim that forwards to the local ganache node
// (whose dev accounts are unlocked, so no key handling is needed), and then
// exercises the real UI: connect, register, donate, and verify the rendered
// on-chain state updates.
//
// Prereqs:  npx ganache --port 8545   |   node scripts/deploy_local.mjs (RPC_URL set)
//           cd frontend && npx vite preview --port 4173
// Run:      node scripts/smoke_frontend.mjs
import puppeteer from "puppeteer-core";

const RPC = "http://127.0.0.1:8545";
const APP = process.env.APP_URL || "http://localhost:4173";
const CHROME =
  process.env.CHROME_PATH ||
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe";

// contract address from the deploy step (or env override)
const CONTRACT = process.env.CONTRACT || "";
if (!CONTRACT) {
  console.error("Set CONTRACT=0x... (from scripts/deploy_local.mjs output)");
  process.exit(2);
}

const PAGE = `${APP}/?contract=${CONTRACT}&rpc=${encodeURIComponent(RPC)}`;

let passed = 0;
let failed = 0;
async function check(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ok - ${name}`);
  } catch (err) {
    failed++;
    console.error(`  FAIL - ${name}: ${err.message}`);
  }
}

// --- helpers ---------------------------------------------------------------

const SHIM = `
(function () {
  const RPC = ${JSON.stringify(RPC)};
  function rpc(method, params) {
    return fetch(RPC, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params: params || [] }),
    }).then(function (r) { return r.json(); }).then(function (j) {
      if (j.error) {
        var e = new Error(j.error.message);
        e.code = j.error.code;
        e.data = j.error.data;
        throw e;
      }
      return j.result;
    });
  }
  function selectedAccounts() {
    try {
      var stored = JSON.parse(localStorage.getItem("smoke_accs") || "null");
      if (stored && stored.length) return Promise.resolve(stored);
    } catch (e) {}
    return rpc("eth_accounts").then(function (a) { return a.slice(0, 1); });
  }
  window.ethereum = {
    isMetaMask: true,
    request: function (args) {
      var m = args.method, p = args.params || [];
      if (m === "eth_requestAccounts" || m === "eth_accounts") return selectedAccounts();
      return rpc(m, p);
    },
    on: function () {}, removeListener: function () {}, removeAllListeners: function () {},
    emit: function () { return false; },
  };
})();
`;

async function rpcCall(method, params) {
  const res = await fetch(RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: params || [] }),
  });
  const json = await res.json();
  if (json.error) throw new Error(JSON.stringify(json.error));
  return json.result;
}

async function waitForText(page, text, timeout = 20000) {
  await page.waitForFunction(
    (t) => (document.body.textContent || "").includes(t),
    { timeout },
    text
  );
}

async function clickWhenEnabled(page, selector, text, timeout = 10000) {
  const start = Date.now();
  for (;;) {
    const done = await page.evaluate(
      ({ selector, text }) => {
        const el = [...document.querySelectorAll(selector)].find((e) =>
          (e.textContent || "").includes(text)
        );
        if (!el || el.disabled) return false;
        el.click();
        return true;
      },
      { selector, text }
    );
    if (done) return;
    if (Date.now() - start > timeout)
      throw new Error(`button never enabled: "${text}"`);
    await new Promise((r) => setTimeout(r, 250));
  }
}

// --- test ------------------------------------------------------------------

const accounts = await rpcCall("eth_accounts");
const donor = accounts[2];
const fresh = accounts[3];
console.log(`donor account:  ${donor}`);
console.log(`fresh account:  ${fresh}`);
console.log(`page:           ${PAGE}\n`);

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ["--no-sandbox", "--disable-gpu", "--window-size=1280,900"],
});
const page = await browser.newPage();
page.on("pageerror", (e) => console.error(`  [pageerror] ${e.message}`));
await page.evaluateOnNewDocument(SHIM);

const asAccount = async (addr) => {
  await page.goto(PAGE, { waitUntil: "networkidle2" });
  await page.evaluate(
    (a) => localStorage.setItem("smoke_accs", JSON.stringify([a])),
    addr
  );
  await page.goto(PAGE, { waitUntil: "networkidle2" });
};

try {
  await check("page loads with ticket data", async () => {
    await asAccount(donor);
    await waitForText(page, "Clean water well");
  });

  await check("donor account auto-connects and shows registration badge", async () => {
    await waitForText(page, "\u2713 you");
  });

  await check("donate through the UI credits the ticket", async () => {
    await page.waitForSelector('input[placeholder="Amount in ETH (e.g. 0.5)"]');
    await page.type('input[placeholder="Amount in ETH (e.g. 0.5)"]', "0.5");
    await clickWhenEnabled(page, "button", "Donate now");
    await waitForText(page, "confirmed", 30000);
    await waitForText(page, "1.5 / 3.0 ETH", 20000);
  });

  await check("donate button is disabled for unregistered account", async () => {
    await asAccount(fresh);
    await waitForText(page, "Clean water well");
    const disabled = await page.evaluate(() => {
      const el = [...document.querySelectorAll("button")].find((b) =>
        (b.textContent || "").includes("Donate now")
      );
      return !!el && el.disabled;
    });
    if (!disabled) throw new Error("Donate now should be disabled");
  });

  await check("register a new donor through the UI", async () => {
    const nameInputs = await page.$$('input[placeholder="Name"]');
    const idInputs = await page.$$('input[placeholder="ID card"]');
    if (nameInputs.length < 2 || idInputs.length < 2)
      throw new Error("registration form inputs not found");
    await nameInputs[1].type("Carol");
    await idInputs[1].type("ID-999");
    await clickWhenEnabled(page, "button", "Register as donor");
    await waitForText(page, "confirmed", 30000);
    await waitForText(page, "2 donors", 20000);
  });

  await check("newly registered donor appears in the donors list", async () => {
    const listOk = await page.evaluate(() => {
      const items = [...document.querySelectorAll(".list li")].map(
        (li) => li.textContent || ""
      );
      return items.some((t) => t.includes("Carol"));
    });
    if (!listOk) throw new Error("Carol not in donors list");
  });
} finally {
  await browser.close();
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
