import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BrowserProvider,
  Contract,
  JsonRpcProvider,
  formatEther,
  parseEther,
} from "ethers";
import artifact from "./CrowdFunding.abi.json";

// Optional URL params: ?contract=0x…&rpc=http://127.0.0.1:8545
const params = new URLSearchParams(window.location.search);
const initialRpc =
  params.get("rpc") ||
  localStorage.getItem("cf_rpc") ||
  "http://127.0.0.1:8545";
const initialAddress =
  params.get("contract") || localStorage.getItem("cf_address") || "";

const EMPTY_TICKET = {
  title: "",
  details: "",
  active_status: false,
  fund_amount: 0n,
  current_collection: 0n,
  fundraiser_address: "0x0000000000000000000000000000000000000000",
};

export default function App() {
  const [account, setAccount] = useState(null);
  const [chainId, setChainId] = useState(null);
  const [contractAddress, setContractAddress] = useState(initialAddress);
  const [rpcUrl, setRpcUrl] = useState(initialRpc);
  const [status, setStatus] = useState(null); // { kind: 'info' | 'ok' | 'error', text }
  const [busy, setBusy] = useState(false);

  // on-chain state
  const [manager, setManager] = useState(null);
  const [ticket, setTicket] = useState(EMPTY_TICKET);
  const [fundsReleased, setFundsReleased] = useState(false);
  const [isFundraiser, setIsFundraiser] = useState(false);
  const [isDonor, setIsDonor] = useState(false);
  const [fundraiserCount, setFundraiserCount] = useState(0n);
  const [donorCount, setDonorCount] = useState(0n);
  const [fundraisers, setFundraisers] = useState([]);
  const [donors, setDonors] = useState([]);

  // forms
  const [rfName, setRfName] = useState("");
  const [rfId, setRfId] = useState("");
  const [dnName, setDnName] = useState("");
  const [dnId, setDnId] = useState("");
  const [tkTitle, setTkTitle] = useState("");
  const [tkDetails, setTkDetails] = useState("");
  const [tkGoal, setTkGoal] = useState("");
  const [donateEth, setDonateEth] = useState("");

  const hasMetaMask = typeof window !== "undefined" && !!window.ethereum;
  const validAddress =
    /^0x[0-9a-fA-F]{40}$/.test(contractAddress.trim()) || null;

  // Wallet is used for signing; the plain RPC endpoint is used for reads so
  // the page also works in read-only mode without MetaMask (e.g. against a
  // local ganache/hardhat node or Remix's localhost environment).
  const readProvider = useMemo(() => {
    if (typeof window === "undefined") return null;
    if (window.ethereum) return new BrowserProvider(window.ethereum);
    try {
      return new JsonRpcProvider(rpcUrl);
    } catch {
      return null;
    }
  }, [hasMetaMask, rpcUrl]);

  const getContract = useCallback(
    async (withSigner = false) => {
      if (!readProvider) throw new Error("No provider available.");
      if (!validAddress)
        throw new Error("Paste a valid CrowdFunding contract address first.");
      if (withSigner) {
        if (!window.ethereum)
          throw new Error("Signing needs MetaMask (page is in read-only mode).");
        const signer = await readProvider.getSigner();
        return new Contract(contractAddress.trim(), artifact.abi, signer);
      }
      return new Contract(contractAddress.trim(), artifact.abi, readProvider);
    },
    [readProvider, contractAddress, validAddress]
  );

  // Monotonic token so a slow refresh can never overwrite a newer one.
  const refreshSeq = useRef(0);

  const refresh = useCallback(async () => {
    if (!validAddress || !readProvider) return;
    const seq = ++refreshSeq.current;
    try {
      const cf = await getContract(false);
      const [
        mgr,
        t,
        released,
        rfCount,
        dnCount,
        rfFlag,
        dnFlag,
      ] = await Promise.all([
        cf.fund_manager(),
        cf.ticket(),
        cf.funds_released(),
        cf.getFundraiserCount(),
        cf.getDonorCount(),
        account ? cf.isFundraiser(account) : Promise.resolve(false),
        account ? cf.isDonor(account) : Promise.resolve(false),
      ]);
      // Fetch *everything* (lists included) before touching state, so the
      // UI never renders half-updated data (e.g. "2 donors" over a 1-entry
      // list) and no await sits between two related setState calls.
      const rfList = [];
      for (let i = 0n; i < rfCount; i++) {
        const [name, addr, idCard] = await cf.getFundraiser(i);
        rfList.push({ name, addr, idCard });
      }
      const dnList = [];
      for (let i = 0n; i < dnCount; i++) {
        const [name, addr, idCard] = await cf.getDonor(i);
        dnList.push({ name, addr, idCard });
      }

      if (seq !== refreshSeq.current) return; // superseded by a newer refresh

      setManager(mgr);
      setTicket({
        title: t.title,
        details: t.details,
        active_status: t.active_status,
        fund_amount: t.fund_amount,
        current_collection: t.current_collection,
        fundraiser_address: t.fundraiser_address,
      });
      setFundsReleased(released);
      setFundraiserCount(rfCount);
      setDonorCount(dnCount);
      setIsFundraiser(rfFlag);
      setIsDonor(dnFlag);
      setFundraisers(rfList);
      setDonors(dnList);
    } catch (err) {
      if (seq !== refreshSeq.current) return;
      setStatus({ kind: "error", text: shortErr(err) });
    }
  }, [validAddress, readProvider, account, getContract]);

  const connect = async () => {
    try {
      if (!window.ethereum)
        throw new Error("Install MetaMask to connect a wallet.");
      const accounts = await window.ethereum.request({
        method: "eth_requestAccounts",
      });
      setAccount(accounts[0]);
      const net = await window.ethereum.request({ method: "eth_chainId" });
      setChainId(parseInt(net, 16));
      setStatus({ kind: "ok", text: `Connected ${accounts[0]}` });
    } catch (err) {
      setStatus({ kind: "error", text: shortErr(err) });
    }
  };

  useEffect(() => {
    if (!hasMetaMask) return;
    const onAccounts = (accs) => setAccount(accs[0] ?? null);
    const onChain = (id) => setChainId(parseInt(id, 16));
    window.ethereum.on("accountsChanged", onAccounts);
    window.ethereum.on("chainChanged", onChain);
    window.ethereum
      .request({ method: "eth_accounts" })
      .then((accs) => accs[0] && setAccount(accs[0]))
      .catch(() => {});
    return () => {
      window.ethereum.removeListener("accountsChanged", onAccounts);
      window.ethereum.removeListener("chainChanged", onChain);
    };
  }, [hasMetaMask]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const saveAddress = () => {
    localStorage.setItem("cf_address", contractAddress.trim());
    localStorage.setItem("cf_rpc", rpcUrl.trim());
    setStatus({ kind: "info", text: "Contract address saved." });
    refresh();
  };

  // Generic tx runner: sets busy/status, waits for confirmation, refreshes.
  const run = async (label, buildTx) => {
    setBusy(true);
    setStatus({ kind: "info", text: `${label}: waiting for wallet...` });
    try {
      const cf = await getContract(true);
      const tx = await buildTx(cf);
      setStatus({ kind: "info", text: `${label}: tx ${tx.hash.slice(0, 10)}… pending` });
      await tx.wait();
      setStatus({ kind: "ok", text: `${label}: confirmed ✓` });
      await refresh();
    } catch (err) {
      setStatus({ kind: "error", text: `${label} failed: ${shortErr(err)}` });
    } finally {
      setBusy(false);
    }
  };

  const registerFundraiser = () =>
    run("Register fundraiser", (cf) =>
      cf.FundRaiserRegister(rfName.trim(), rfId.trim())
    );

  const registerDonor = () =>
    run("Register donor", (cf) => cf.DonorRegister(dnName.trim(), dnId.trim()));

  const raiseTicket = () =>
    run("Raise ticket", (cf) =>
      cf.RaiseFundTicket(tkTitle.trim(), tkDetails.trim(), parseEther(tkGoal || "0"))
    );

  const donate = () =>
    run("Donate", (cf) => {
      const value = parseEther(donateEth || "0");
      return cf.DonateNow(value, { value });
    });

  const release = () =>
    run("Release funds", (cf) =>
      cf.ReleaseFundAmount({ value: ticket.current_collection })
    );

  const goal = ticket.fund_amount;
  const collected = ticket.current_collection;
  const progress =
    goal > 0n ? Number((collected * 10000n) / goal) / 100 : 0;
  const ticketExists = ticket.fundraiser_address !== ZERO;
  const isManager =
    account && manager && account.toLowerCase() === manager.toLowerCase();

  return (
    <div className="app">
      <header>
        <h1>🌱 CrowdFunding dApp</h1>
        <div className="wallet">
          {account ? (
            <span className="pill">
              {short(account)} {chainId ? `· chain ${chainId}` : ""}
            </span>
          ) : (
            <button className="primary" onClick={connect} disabled={!hasMetaMask}>
              {hasMetaMask ? "Connect wallet" : "MetaMask not found"}
            </button>
          )}
        </div>
      </header>

      <section className="card">
        <h2>Contract</h2>
        <div className="row">
          <input
            placeholder="0x… CrowdFunding contract address"
            value={contractAddress}
            onChange={(e) => setContractAddress(e.target.value)}
            spellCheck={false}
          />
          <button onClick={saveAddress} disabled={busy || !validAddress}>
            Save &amp; load
          </button>
        </div>
        <div className="row">
          <input
            placeholder="RPC URL (read-only mode)"
            value={rpcUrl}
            onChange={(e) => setRpcUrl(e.target.value)}
            spellCheck={false}
          />
        </div>
        <p className="meta">
          {hasMetaMask
            ? "Wallet: MetaMask"
            : "No MetaMask detected — read-only mode via RPC above. Transactions need MetaMask."}
        </p>
        {manager && (
          <p className="meta">
            Fund manager: <code>{short(manager)}</code>
          </p>
        )}
      </section>

      <section className="card">
        <h2>Active ticket</h2>
        {ticketExists ? (
          <>
            <div className="ticket-head">
              <strong>{ticket.title}</strong>
              <span className={`badge ${ticket.active_status ? "open" : "closed"}`}>
                {ticket.active_status
                  ? "OPEN"
                  : fundsReleased
                  ? "RELEASED"
                  : "GOAL REACHED"}
              </span>
            </div>
            <p>{ticket.details}</p>
            <div className="bar">
              <div
                className="bar-fill"
                style={{ width: `${Math.min(progress, 100)}%` }}
              />
            </div>
            <p className="meta">
              {formatEther(collected)} / {formatEther(goal)} ETH ({progress.toFixed(1)}%)
              {" · "}raised by <code>{short(ticket.fundraiser_address)}</code>
            </p>
          </>
        ) : (
          <p className="meta">No ticket yet — a registered fundraiser can raise one.</p>
        )}
        <button className="ghost" onClick={refresh} disabled={busy}>
          ↻ Refresh
        </button>
      </section>

      <div className="grid">
        <section className="card">
          <h2>Register</h2>
          <h3>Fundraiser {isFundraiser && <span className="badge open">✓ you</span>}</h3>
          <input
            placeholder="Name"
            value={rfName}
            onChange={(e) => setRfName(e.target.value)}
          />
          <input
            placeholder="ID card"
            value={rfId}
            onChange={(e) => setRfId(e.target.value)}
          />
          <button
            onClick={registerFundraiser}
            disabled={busy || !account || !validAddress}
          >
            Register as fundraiser
          </button>

          <h3>Donor {isDonor && <span className="badge open">✓ you</span>}</h3>
          <input
            placeholder="Name"
            value={dnName}
            onChange={(e) => setDnName(e.target.value)}
          />
          <input
            placeholder="ID card"
            value={dnId}
            onChange={(e) => setDnId(e.target.value)}
          />
          <button onClick={registerDonor} disabled={busy || !account || !validAddress}>
            Register as donor
          </button>
        </section>

        <section className="card">
          <h2>Fundraiser actions</h2>
          <input
            placeholder="Campaign title"
            value={tkTitle}
            onChange={(e) => setTkTitle(e.target.value)}
          />
          <textarea
            placeholder="Details"
            rows={3}
            value={tkDetails}
            onChange={(e) => setTkDetails(e.target.value)}
          />
          <input
            placeholder="Goal in ETH (e.g. 3)"
            value={tkGoal}
            onChange={(e) => setTkGoal(e.target.value)}
            inputMode="decimal"
          />
          <button
            onClick={raiseTicket}
            disabled={busy || !account || !isFundraiser || ticket.active_status}
          >
            Raise fund ticket
          </button>
          <p className="hint">
            {!isFundraiser
              ? "Register as fundraiser first."
              : ticket.active_status
              ? "A ticket is already open."
              : fundsReleased || !ticketExists
              ? "Creates a new campaign ticket."
              : "Goal reached — fund manager must release the funds first."}
          </p>
        </section>

        <section className="card">
          <h2>Donor actions</h2>
          <input
            placeholder="Amount in ETH (e.g. 0.5)"
            value={donateEth}
            onChange={(e) => setDonateEth(e.target.value)}
            inputMode="decimal"
          />
          <button
            onClick={donate}
            disabled={busy || !account || !isDonor || !ticket.active_status}
          >
            Donate now
          </button>
          <p className="hint">
            {!isDonor
              ? "Register as donor first."
              : !ticket.active_status
              ? "No open ticket to donate to."
              : "Donation is forwarded straight to the fund manager."}
          </p>

          <h3>Fund manager</h3>
          <button
            className="danger"
            onClick={release}
            disabled={busy || !isManager || !ticketExists || fundsReleased || collected === 0n}
          >
            Release {collected > 0n ? formatEther(collected) : ""} ETH to fundraiser
          </button>
          <p className="hint">
            {!isManager
              ? "Only the deploying account (fund manager) can release."
              : fundsReleased
              ? "Funds already released."
              : !ticketExists
              ? "No ticket yet."
              : "Sends the collected amount to the fundraiser."}
          </p>
        </section>
      </div>

      <section className="card">
        <h2>Registered users ({Number(fundraiserCount)} fundraisers · {Number(donorCount)} donors)</h2>
        <div className="grid">
          <div>
            <h3>Fundraisers</h3>
            <ul className="list">
              {fundraisers.map((f, i) => (
                <li key={i}>
                  <strong>{f.name}</strong> <code>{short(f.addr)}</code>{" "}
                  <span className="meta">{f.idCard}</span>
                </li>
              ))}
              {fundraisers.length === 0 && <li className="meta">None yet.</li>}
            </ul>
          </div>
          <div>
            <h3>Donors</h3>
            <ul className="list">
              {donors.map((d, i) => (
                <li key={i}>
                  <strong>{d.name}</strong> <code>{short(d.addr)}</code>{" "}
                  <span className="meta">{d.idCard}</span>
                </li>
              ))}
              {donors.length === 0 && <li className="meta">None yet.</li>}
            </ul>
          </div>
        </div>
      </section>

      {status && <div className={`status ${status.kind}`}>{status.text}</div>}
    </div>
  );
}

const ZERO = "0x0000000000000000000000000000000000000000";

function short(addr) {
  if (!addr) return "";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function shortErr(err) {
  return (
    err?.reason ||
    err?.shortMessage ||
    err?.info?.error?.message ||
    err?.message ||
    String(err)
  );
}
