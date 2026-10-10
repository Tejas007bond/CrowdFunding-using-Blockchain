# 🌱 CrowdFunding dApp

A crowdfunding dApp built on Ethereum. Fundraisers register and raise fund
tickets (campaigns), donors register and donate ETH to an open ticket, and the
fund manager releases the collected funds to the fundraiser once the campaign
is over.

The project is a [Remix IDE](https://remix.ethereum.org/) workspace extended
with a local Node.js toolchain, so everything (compile → test → deploy → UI) can
be run from the terminal without leaving the repo.

- **Smart contract:** `contracts/CrowdFundingContract.sol` (`CrowdFunding`), structs in `contracts/BlockAccount.sol`
- **Frontend:** React + Vite + ethers.js v6 dApp in `frontend/`
- **Toolchain:** `solc` compiler, in-process `ganache` chain, `ethers`, headless-Chrome smoke tests

---

## Project structure

```
.
├── contracts/
│   ├── CrowdFundingContract.sol   # The CrowdFunding contract (main contract)
│   ├── BlockAccount.sol           # Fundraiser / Donor / FundTicket structs
│   └── 1_Storage.sol, 2_Owner.sol, 3_Ballot.sol   # Remix template samples
├── scripts/
│   ├── compile.mjs                # solc compile -> artifacts/ (+ copy to frontend/src)
│   ├── deploy_local.mjs           # Deploy + seed state on a local node
│   └── smoke_frontend.mjs         # Headless-Chrome UI smoke test
├── tests/
│   ├── crowdfund.test.mjs         # 21 functional tests for CrowdFunding (npm test)
│   ├── Ballot_test.sol            # Remix Solidity test (Ballot sample)
│   └── storage.test.js            # Remix JS test (Storage sample)
├── frontend/                      # React dApp (Vite)
│   └── src/App.jsx                # UI: connect wallet, register, donate, release
├── artifacts/
│   └── CrowdFunding.abi.json      # ABI + bytecode used by tests & frontend
└── package.json                   # compile / test / chain scripts
```

---

## Prerequisites

- **Node.js 18+** (tested on Node 24) and npm
- Optional, for the browser smoke test: **Google Chrome**
- Optional, for manual UI transactions: **MetaMask**

---

## Quick start

```bash
npm install          # root toolchain (solc, ganache, ethers, puppeteer-core)
npm run compile      # compile CrowdFundingContract.sol -> artifacts/CrowdFunding.abi.json
npm test             # run the 21 functional tests against an in-process ganache chain
```

`npm run compile` also copies the artifact to `frontend/src/CrowdFunding.abi.json`
so the UI always talks to the freshly compiled ABI. Run it again after any
contract change.

---

## Running the project

You need three things: a **local chain**, a **deployed contract**, and the
**frontend**.

### 1. Start a local chain

```bash
npm run chain
# = ganache --wallet.totalAccounts 10 --chain.chainId 1337
```

This starts an unlocked dev chain at `http://127.0.0.1:8545` (chain id **1337**)
with 10 accounts holding 1000 ETH each. It prints the accounts, private keys and
mnemonic — keep it running in its own terminal.

> The µWS "not compatible with your Node.js build" warning is harmless; ganache
> falls back to a pure-JS transport.

### 2. Deploy and seed the contract

In a second terminal:

```bash
RPC_URL=http://127.0.0.1:8545 node scripts/deploy_local.mjs
```

(deploys in-process if `RPC_URL` is unset, but that chain dies when the script
exits — use `RPC_URL` to target the running node.)

It deploys `CrowdFunding` and seeds a demo scenario, then prints:

```text
{
  "address":   0x7EDB…184C    <-- paste this into the frontend
  "deployer":  0x06a3…258e    <-- fund manager (account #0)
  "fundraiser":0x8542…8B44    <-- Alice  (account #1)
  "donor":     0x0C8f…59F9c   <-- Bob    (account #2)
}
```

Seeded state: Alice registers as fundraiser, Bob registers as donor, a
**"Clean water well"** ticket is raised with a **3 ETH** goal, and Bob donates
**1 ETH** to it.

> On Windows cmd.exe use `set RPC_URL=http://127.0.0.1:8545 && node scripts/deploy_local.mjs`
> instead (the examples in this README use bash syntax).

### 3. Start the frontend

```bash
cd frontend
npm install
npm run dev          # Vite dev server -> http://localhost:5173
```

Open `http://localhost:5173` and:

1. Paste the contract address from step 2 and click **Save & load**
   (the RPC URL defaults to `http://127.0.0.1:8545`).
   You can also deep-link everything:
   `http://localhost:5173/?contract=0x7EDB…184C&rpc=http%3A%2F%2F127.0.0.1%3A8545`
2. Click **Connect wallet** (MetaMask) to transact. Without MetaMask the page
   runs in **read-only** mode and still shows live on-chain state.
3. Register as a fundraiser/donor, raise a ticket, donate, and — as the
   deploying account — release the collected funds.

**MetaMask on the local chain:** add network `http://127.0.0.1:8545`, chain id
`1337`, currency `ETH`, then import one of the ganache private keys printed in
step 1.

### 4. Optional: production build

```bash
cd frontend
npm run build        # -> frontend/dist/
npm run preview      # serves the build at http://localhost:4173
```

---

## Test cases

### Unit / functional tests — `npm test`

Runs `tests/crowdfund.test.mjs` against an **in-process ganache chain** (no
external services needed). It deploys a fresh `CrowdFunding` contract and
executes these 21 cases:

| # | Test | What it asserts |
|---|------|-----------------|
| 1 | deployer becomes fund manager | constructor sets `fund_manager` to `msg.sender` |
| 2 | non-manager cannot call admin functions | `ReleaseFundAmount` reverts with `Action Deny` |
| 3 | fundraiser can register | `FundRaiserRegister` sets `isFundraiser`, counter and getter data |
| 4 | duplicate fundraiser registration is rejected | reverts with `Fundraiser account exist` |
| 5 | donor can register, duplicate rejected | `DonorRegister` works once, reverts on the 2nd time |
| 6 | unregistered user cannot raise a ticket | reverts with `Fundraiser account does not exist` |
| 7 | registered fundraiser raises a ticket | ticket title/status/goal/raiser stored correctly |
| 8 | second ticket cannot be raised while first is active | reverts with `already exist` |
| 9 | zero-value ticket rejected | `fund_amount == 0` reverts |
| 10 | unregistered donor cannot donate | reverts with `Donor account does not exist` |
| 11 | donation with wrong msg.value rejected | `wei_amount != msg.value` reverts |
| 12 | zero donation rejected | reverts with `more than 0` |
| 13 | valid donation is credited and forwarded to fund manager | balance delta == amount, `current_collection` credited, `DonationReceived` emitted |
| 14 | reaching the goal closes the ticket | at 3/3 ETH `active_status` flips to `false` |
| 15 | donations rejected after ticket closes | reverts once the ticket is closed |
| 16 | non-manager cannot release funds | only the deployer can call `ReleaseFundAmount` |
| 17 | release with wrong amount rejected | `msg.value != current_collection` reverts |
| 18 | fund manager releases collected funds to fundraiser | fundraiser balance grows by the collected amount, `funds_released` is true |
| 19 | same ticket cannot be released twice | reverts with `already released` |
| 20 | a new ticket can be raised after release | a fresh ticket starts active with 0 collected |
| 21 | registration counters and getters stay consistent | counts match, out-of-range getters revert |

Real output:

```text
CrowdFunding deployed at 0x1b98F1a95e0A086C545625b2d8979C621637bd48

  ok - deployer becomes fund manager
  ok - non-manager cannot call admin functions
  ok - fundraiser can register
  ok - duplicate fundraiser registration is rejected
  ok - donor can register, duplicate rejected
  ok - unregistered user cannot raise a ticket
  ok - registered fundraiser raises a ticket
  ok - second ticket cannot be raised while first is active
  ok - zero-value ticket rejected
  ok - unregistered donor cannot donate
  ok - donation with wrong msg.value rejected
  ok - zero donation rejected
  ok - valid donation is credited and forwarded to fund manager
  ok - reaching the goal closes the ticket
  ok - donations rejected after ticket closes
  ok - non-manager cannot release funds
  ok - release with wrong amount rejected
  ok - fund manager releases collected funds to fundraiser
  ok - same ticket cannot be released twice
  ok - a new ticket can be raised after release
  ok - registration counters and getters stay consistent

21 passed, 0 failed
```

The process exits non-zero if any test fails.

### Browser smoke test — `scripts/smoke_frontend.mjs`

Drives the **real UI** in headless Chrome against a built frontend and a local
chain (a minimal `window.ethereum` shim forwards to ganache, whose dev accounts
are unlocked, so no MetaMask is required). It checks:

1. **page loads with ticket data** — the seeded "Clean water well" ticket renders
2. **donor account auto-connects and shows registration badge** — the `✓ you` badge appears
3. **donate through the UI credits the ticket** — typing 0.5 ETH and clicking *Donate now* confirms and moves the bar to `1.5 / 3.0 ETH`
4. **donate button is disabled for unregistered account** — an unregistered account cannot donate
5. **register a new donor through the UI** — registering "Carol" confirms and the counter becomes `2 donors`
6. **newly registered donor appears in the donors list** — Carol is listed

Setup (three terminals):

```bash
# 1. chain
npm run chain

# 2. deploy + seed (keep the printed address)
RPC_URL=http://127.0.0.1:8545 node scripts/deploy_local.mjs

# 3. build & serve the frontend
cd frontend && npm install && npm run build && npx vite preview --port 4173
```

Then run the smoke test (bash syntax):

```bash
CONTRACT=0xYOUR_ADDRESS node scripts/smoke_frontend.mjs
```

Optional environment overrides:

- `CHROME_PATH` — path to Chrome/Chromium if it is not at
  `C:\Program Files\Google\Chrome\Application\chrome.exe`
- `APP_URL` — frontend URL, defaults to `http://localhost:4173`
- `RPC_URL` inside the page defaults to `http://127.0.0.1:8545`

Real output:

```text
  ok - page loads with ticket data
  ok - donor account auto-connects and shows registration badge
  ok - donate through the UI credits the ticket
  ok - donate button is disabled for unregistered account
  ok - register a new donor through the UI
  ok - newly registered donor appears in the donors list

6 passed, 0 failed
```

---

## Contract reference

### Lifecycle

```
deploy  ──►  FundRaiserRegister / DonorRegister
        ──►  RaiseFundTicket (goal > 0, no other open ticket)
        ──►  DonateNow  (registered donor, msg.value == wei_amount)
              • each donation is forwarded straight to the fund manager
              • reaching the goal closes the ticket automatically
        ──►  ReleaseFundAmount  (fund manager only, sends collected funds
                                 to the fundraiser, one release per ticket)
        ──►  RaiseFundTicket  (a new ticket can be raised afterwards)
```

### Units

Every amount (`fund_amount`, `current_collection`, donations, releases) is in
**wei**. The frontend converts ETH ⇄ wei with `ethers.parseEther()` /
`formatEther()`.

### Functions

| Function | Access | Description |
|----------|--------|-------------|
| `FundRaiserRegister(name, id)` | anyone not yet registered | Registers the caller as a fundraiser |
| `DonorRegister(name, id)` | anyone not yet registered | Registers the caller as a donor |
| `RaiseFundTicket(title, details, fund_amount)` | registered fundraiser, no open ticket | Creates an active campaign ticket |
| `DonateNow(wei_amount)` `payable` | registered donor, active ticket | Credits the donation and forwards the ETH to the fund manager |
| `ReleaseFundAmount()` `payable` | fund manager only | Sends `current_collection` to the fundraiser; marks the funds released |
| `getFundraiserCount()` / `getDonorCount()` | view | Registration counters |
| `getFundraiser(i)` / `getDonor(i)` | view | `(name, address, id_card)` at index `i` |
| `fund_manager`, `ticket`, `funds_released`, `isFundraiser`, `isDonor` | public | State getters |

### Events

`FundraiserRegistered`, `DonorRegistered`, `FundTicketRaised`,
`DonationReceived`, `FundTicketCapped`, `FundsReleased` — the frontend and
tests subscribe to these to react to on-chain activity.

### Guards

Access/validity modifiers (`CheckFundManager`, `CheckFundRaiser`,
`CheckDonorRegister`, `IsFundraiserRegisterExists`, `IsDonorRegisterExists`,
`CheckFundTicketStatus`, `IsFundTicketExists`, `IsFundTicketActive`,
`CheckDonateAmount`, `CheckReleaseFundAmount`) plus a `NonReentrant` lock on
every function that moves ether.

---

## npm scripts

| Command | What it does |
|---------|--------------|
| `npm run compile` | Compile the contract with solc (optimizer 200 runs, `shanghai` EVM) and write `artifacts/CrowdFunding.abi.json` + `frontend/src/CrowdFunding.abi.json` |
| `npm test` | Run the 21 functional tests on an in-process ganache chain |
| `npm run chain` | Start a local ganache chain (10 accounts, chain id 1337) at `127.0.0.1:8545` |

Frontend scripts (`cd frontend`): `npm run dev`, `npm run build`, `npm run preview`.

---

## Remix usage (original workspace)

The workspace can still be used directly in Remix IDE: compile
`contracts/CrowdFundingContract.sol` in the Solidity compiler tab, deploy it in
the Deploy & Run tab, and interact from there. Right-click a file in the File
Explorer → **Run** to execute a script; output appears in the Remix terminal.
`tests/Ballot_test.sol` and `tests/storage.test.js` are Remix-only sample tests
(run them from Remix's Solidity Testing / Unit Testing plugins) — the portable
test suite for this project is `npm test`.
