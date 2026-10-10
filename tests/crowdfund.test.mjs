// Functional tests for the CrowdFunding contract.
// Runs against an in-process ganache chain (no external services needed).
// Run with: npm test
import ganache from "ganache";
import { ethers } from "ethers";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const artifact = JSON.parse(
  fs.readFileSync(path.join(root, "artifacts", "CrowdFunding.abi.json"), "utf8")
);

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ok - ${name}`);
  } catch (err) {
    failed++;
    console.error(`  FAIL - ${name}`);
    console.error(`    ${err.message}`);
  }
}

// Expect a call to revert with a specific reason.
// Pass a thunk that performs a staticCall (ganache returns the revert
// reason reliably on eth_call, but often not during estimateGas).
async function expectRevert(doCall, reason) {
  try {
    await doCall();
  } catch (err) {
    const text =
      (err?.reason ?? "") +
      JSON.stringify(err?.info ?? {}) +
      (err?.message ?? "") +
      (err?.data ?? "");
    if (reason && !text.includes(reason)) {
      throw new Error(
        `reverted, but with wrong reason. expected "${reason}", got: ${err.message}`
      );
    }
    return;
  }
  throw new Error(`expected revert with "${reason}", but the call succeeded`);
}

const gProvider = ganache.provider({
  wallet: { totalAccounts: 10, defaultBalance: 1000 },
  logging: { quiet: true },
});
// cacheTimeout: -1 disables ethers' 250ms balance/cache batching, which
// otherwise returns stale balances right after a transaction
const provider = new ethers.BrowserProvider(gProvider, undefined, {
  cacheTimeout: -1,
});

const [deployer, fundraiser, donor, stranger] = await Promise.all(
  [0, 1, 2, 3].map((i) => provider.getSigner(i))
);

const factory = new ethers.ContractFactory(
  artifact.abi,
  artifact.bytecode,
  deployer
);
const cf = await factory.deploy();
await cf.waitForDeployment();
const cfAddress = await cf.getAddress();

console.log(`CrowdFunding deployed at ${cfAddress}\n`);

await test("deployer becomes fund manager", async () => {
  assert.equal(
    await cf.fund_manager(),
    await deployer.getAddress(),
    "fund_manager should be the deployer"
  );
});

await test("non-manager cannot call admin functions", async () => {
  await expectRevert(
    () => cf.connect(stranger).ReleaseFundAmount.staticCall({ value: 0n }),
    "Action Deny"
  );
});

await test("fundraiser can register", async () => {
  const tx = await cf
    .connect(fundraiser)
    .FundRaiserRegister("Alice", "ID-123");
  await tx.wait();
  assert.equal(await cf.isFundraiser(await fundraiser.getAddress()), true);
  assert.equal(await cf.getFundraiserCount(), 1n);
  const [name, addr, id] = await cf.getFundraiser(0);
  assert.equal(name, "Alice");
  assert.equal(addr, await fundraiser.getAddress());
  assert.equal(id, "ID-123");
});

await test("duplicate fundraiser registration is rejected", async () => {
  await expectRevert(
    () => cf.connect(fundraiser).FundRaiserRegister.staticCall("Alice2", "ID-456"),
    "Fundraiser account exist"
  );
});

await test("donor can register, duplicate rejected", async () => {
  const tx = await cf.connect(donor).DonorRegister("Bob", "ID-789");
  await tx.wait();
  assert.equal(await cf.isDonor(await donor.getAddress()), true);
  assert.equal(await cf.getDonorCount(), 1n);
  await expectRevert(
    () => cf.connect(donor).DonorRegister.staticCall("Bob2", "ID-000"),
    "Donor account exist"
  );
});

await test("unregistered user cannot raise a ticket", async () => {
  await expectRevert(
    () => cf.connect(stranger).RaiseFundTicket.staticCall("T", "D", 10n),
    "Fundraiser account does not exist"
  );
});

await test("registered fundraiser raises a ticket", async () => {
  const goal = ethers.parseEther("3");
  const tx = await cf
    .connect(fundraiser)
    .RaiseFundTicket("Clean water well", "Build a well", goal);
  await tx.wait();
  const ticket = await cf.ticket();
  assert.equal(ticket.title, "Clean water well");
  assert.equal(ticket.active_status, true);
  assert.equal(ticket.fund_amount, goal);
  assert.equal(ticket.current_collection, 0n);
  assert.equal(
    ticket.fundraiser_address,
    await fundraiser.getAddress()
  );
});

await test("second ticket cannot be raised while first is active", async () => {
  await expectRevert(
    () => cf.connect(fundraiser).RaiseFundTicket.staticCall("T2", "D2", 1n),
    "already exist"
  );
});

await test("zero-value ticket rejected", async () => {
  // active ticket exists, so the modifier fires before the amount check
  await expectRevert(
    () => cf.connect(fundraiser).RaiseFundTicket.staticCall("T3", "D3", 0n),
    "already exist"
  );
});

await test("unregistered donor cannot donate", async () => {
  await expectRevert(
    () =>
      cf.connect(stranger).DonateNow.staticCall(ethers.parseEther("1"), {
        value: ethers.parseEther("1"),
      }),
    "Donor account does not exist"
  );
});

await test("donation with wrong msg.value rejected", async () => {
  await expectRevert(
    () =>
      cf.connect(donor).DonateNow.staticCall(ethers.parseEther("1"), {
        value: ethers.parseEther("0.5"),
      }),
    "donation amount"
  );
});

await test("zero donation rejected", async () => {
  await expectRevert(
    () => cf.connect(donor).DonateNow.staticCall(0n, { value: 0n }),
    "more than 0"
  );
});

await test("valid donation is credited and forwarded to fund manager", async () => {
  const amount = ethers.parseEther("1");
  const managerBefore = await provider.getBalance(await deployer.getAddress());
  const tx = await cf.connect(donor).DonateNow(amount, { value: amount });
  const receipt = await tx.wait();
  const managerAfter = await provider.getBalance(await deployer.getAddress());

  // fund manager received the donation (minus nothing: balance delta == amount)
  assert.equal(managerAfter - managerBefore, amount, "manager should receive ETH");

  const ticket = await cf.ticket();
  assert.equal(ticket.current_collection, amount, "collection should be credited");
  assert.equal(ticket.active_status, true, "ticket still active below goal");

  // event emitted
  const event = receipt.logs
    .map((l) => {
      try {
        return cf.interface.parseLog(l);
      } catch {
        return null;
      }
    })
    .find((e) => e && e.name === "DonationReceived");
  assert.ok(event, "DonationReceived event should be emitted");
  assert.equal(event.args.amount, amount);
});

await test("reaching the goal closes the ticket", async () => {
  const amount = ethers.parseEther("2");
  await (
    await cf.connect(donor).DonateNow(amount, { value: amount })
  ).wait();
  const ticket = await cf.ticket();
  assert.equal(ticket.current_collection, ethers.parseEther("3"));
  assert.equal(ticket.active_status, false, "ticket should close at goal");
});

await test("donations rejected after ticket closes", async () => {
  await expectRevert(
    () =>
      cf.connect(donor).DonateNow.staticCall(ethers.parseEther("1"), {
        value: ethers.parseEther("1"),
      }),
    "does not exist"
  );
});

await test("non-manager cannot release funds", async () => {
  const collected = await cf.ticket().then((t) => t.current_collection);
  await expectRevert(
    () => cf.connect(stranger).ReleaseFundAmount.staticCall({ value: collected }),
    "Action Deny"
  );
});

await test("release with wrong amount rejected", async () => {
  await expectRevert(
    () => cf.connect(deployer).ReleaseFundAmount.staticCall({ value: 1n }),
    "fund release amount"
  );
});

await test("fund manager releases collected funds to fundraiser", async () => {
  const collected = await cf.ticket().then((t) => t.current_collection);
  assert.ok(collected > 0n, "there should be funds to release");

  const raiserBefore = await provider.getBalance(await fundraiser.getAddress());
  const tx = await cf.connect(deployer).ReleaseFundAmount({ value: collected });
  await tx.wait();
  const raiserAfter = await provider.getBalance(await fundraiser.getAddress());

  assert.equal(raiserAfter - raiserBefore, collected, "fundraiser receives ETH");
  assert.equal(await cf.funds_released(), true);
  const ticket = await cf.ticket();
  assert.equal(ticket.active_status, false);
});

await test("same ticket cannot be released twice", async () => {
  const collected = await cf.ticket().then((t) => t.current_collection);
  await expectRevert(
    () => cf.connect(deployer).ReleaseFundAmount.staticCall({ value: collected }),
    "already released"
  );
});

await test("a new ticket can be raised after release", async () => {
  const goal = ethers.parseEther("1");
  await (
    await cf.connect(fundraiser).RaiseFundTicket("Second round", "More", goal)
  ).wait();
  const ticket = await cf.ticket();
  assert.equal(ticket.active_status, true);
  assert.equal(ticket.current_collection, 0n);
  assert.equal(await cf.funds_released(), false);
});

await test("registration counters and getters stay consistent", async () => {
  assert.equal(await cf.getFundraiserCount(), 1n);
  assert.equal(await cf.getDonorCount(), 1n);
  await expectRevert(() => cf.getFundraiser.staticCall(5), "Invalid fundraiser index");
  await expectRevert(() => cf.getDonor.staticCall(5), "Invalid donor index");
});

console.log(`\n${passed} passed, ${failed} failed`);
await gProvider.disconnect();
process.exit(failed > 0 ? 1 : 0);
