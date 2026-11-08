"use client";

// Contributor app (BUILD_PLAN.md T6, solo version): wallet, market, live camera, shutter, result.
// There is deliberately no <input type="file"> anywhere: photos only come from the live camera.
import { useCallback, useEffect, useRef, useState } from "react";
import { Keypair, PublicKey } from "@solana/web3.js";
import type { BalanceResponse, Market, NonceResponse, SubmitResponse } from "@/lib/types";

const WALLET_KEY = "gt.wallet";
const SECRET_KEY = "gt.secret"; // JSON array of the 64-byte secret, only for created wallets
const MARKET_KEY = "gt.market";

const MAX_SIDE_PX = 1600;
const JPEG_QUALITY = 0.85;
// Nonces live 120 s on the server. Fetch a fresh one before shooting if ours is older than this.
const NONCE_REFRESH_MS = 100_000;
const PAYOUT_USDC = 0.05;
// After a payout, re-read the balance at these delays (ms) until devnet shows the new amount.
const BALANCE_RECHECK_MS = [0, 2000, 5000];

// Camera requests, tried in order. "ideal" values are preferences; a device that refuses a
// request (OverconstrainedError, or a driver that rejects the size) falls through to the next.
const CAMERA_REQUESTS: MediaStreamConstraints[] = [
  { audio: false, video: { facingMode: { ideal: "environment" }, width: { ideal: 2560 }, height: { ideal: 1440 } } },
  { audio: false, video: { facingMode: { ideal: "environment" } } },
  { audio: false, video: true },
];

type CameraState = "off" | "starting" | "on" | "error";
type Result = { kind: "response"; body: SubmitResponse } | { kind: "error"; message: string };

function shortAddress(a: string): string {
  return `${a.slice(0, 4)}…${a.slice(-4)}`;
}

function isValidAddress(value: string): boolean {
  try {
    new PublicKey(value);
    return true;
  } catch {
    return false;
  }
}

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Private mode or blocked storage: the app still works for this session.
  }
}

async function errorMessage(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    if (body.error) return body.error;
  } catch {}
  return `Server returned ${res.status}`;
}

export default function ContributorApp() {
  const [loaded, setLoaded] = useState(false);
  const [wallet, setWallet] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [backupShown, setBackupShown] = useState(false);
  const [pasteValue, setPasteValue] = useState("");
  const [pasteError, setPasteError] = useState<string | null>(null);

  const [markets, setMarkets] = useState<Market[] | null>(null);
  const [marketsError, setMarketsError] = useState<string | null>(null);
  const [marketId, setMarketId] = useState("");

  const [balance, setBalance] = useState<number | null>(null);
  const [balanceError, setBalanceError] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [camera, setCamera] = useState<CameraState>("off");
  const [cameraError, setCameraError] = useState<string | null>(null);

  const nonceRef = useRef<{ nonce: string; wallet: string; at: number } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  // Restore saved wallet and market after mount (localStorage is browser-only).
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- one-time read of browser storage */
    setWallet(readStorage(WALLET_KEY));
    const savedSecret = readStorage(SECRET_KEY);
    setSecret(savedSecret);
    setBackupShown(savedSecret !== null);
    setMarketId(readStorage(MARKET_KEY) ?? "");
    setLoaded(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/markets")
      .then(async (res) => {
        if (!res.ok) throw new Error(await errorMessage(res));
        return (await res.json()) as Market[];
      })
      .then((list) => {
        if (cancelled) return;
        setMarkets(list);
        setMarketId((current) => (list.some((m) => m.id === current) ? current : (list[0]?.id ?? "")));
      })
      .catch((err: unknown) => {
        if (!cancelled) setMarketsError(err instanceof Error ? err.message : "Could not load markets");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const readBalance = useCallback(async (address: string): Promise<number> => {
    const res = await fetch(`/api/balance?wallet=${encodeURIComponent(address)}`, { cache: "no-store" });
    if (!res.ok) throw new Error(await errorMessage(res));
    return ((await res.json()) as BalanceResponse).usdc;
  }, []);

  const refreshBalance = useCallback(
    async (address: string) => {
      try {
        setBalance(await readBalance(address));
        setBalanceError(false);
      } catch {
        setBalanceError(true);
      }
    },
    [readBalance],
  );

  // After a verified result: show the paid amount at once, then re-read devnet until it agrees,
  // in case the RPC node answering /api/balance lags behind the node that confirmed the payout.
  const confirmPayoutBalance = useCallback(
    async (address: string, before: number | null) => {
      const expected = before === null ? null : before + PAYOUT_USDC;
      if (expected !== null) setBalance(expected);
      let last: number | null = null;
      let waited = 0;
      for (const at of BALANCE_RECHECK_MS) {
        await new Promise((r) => setTimeout(r, at - waited));
        waited = at;
        try {
          last = await readBalance(address);
          setBalanceError(false);
          if (expected === null || last >= expected - 1e-9) break;
        } catch {
          // keep the optimistic value and try again
        }
      }
      if (last !== null) setBalance(last);
    },
    [readBalance],
  );

  useEffect(() => {
    if (!wallet) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- clear the previous wallet's balance
    setBalance(null);
    void refreshBalance(wallet);
  }, [wallet, refreshBalance]);

  const fetchNonce = useCallback(async (address: string): Promise<string> => {
    const res = await fetch("/api/nonce", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ wallet: address }),
    });
    if (!res.ok) throw new Error(await errorMessage(res));
    const body = (await res.json()) as NonceResponse;
    nonceRef.current = { nonce: body.nonce, wallet: address, at: Date.now() };
    return body.nonce;
  }, []);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCamera("off");
  }, []);

  useEffect(() => stopCamera, [stopCamera]);

  async function startCamera() {
    if (!wallet) return;
    setCamera("starting");
    setCameraError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setCamera("error");
      setCameraError("This browser cannot open the camera. Use HTTPS or localhost, in Chrome or Safari.");
      return;
    }
    // Rear camera at 2560x1440 preferred; falls back to any size, then to any camera (laptops).
    let stream: MediaStream | null = null;
    let lastError: unknown = null;
    for (const request of CAMERA_REQUESTS) {
      try {
        stream = await navigator.mediaDevices.getUserMedia(request);
        break;
      } catch (err) {
        lastError = err;
        // Permission denied applies to every request; stop asking.
        if (err instanceof DOMException && err.name === "NotAllowedError") break;
      }
    }
    if (!stream) {
      setCamera("error");
      setCameraError(
        lastError instanceof DOMException && lastError.name === "NotAllowedError"
          ? "Camera permission was denied. Allow camera access in the browser settings and try again."
          : "Could not open a camera on this device.",
      );
      return;
    }
    streamRef.current = stream;
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      await videoRef.current.play().catch(() => {});
    }
    setCamera("on");
    setResult(null);
    fetchNonce(wallet).catch(() => {
      /* retried at the shutter */
    });
  }

  async function captureJpeg(): Promise<Blob> {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) throw new Error("The camera is not ready yet");
    const scale = Math.min(1, MAX_SIDE_PX / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not capture the photo");
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return new Promise((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not encode the photo"))), "image/jpeg", JPEG_QUALITY),
    );
  }

  async function shoot() {
    if (!wallet || !marketId || submitting || camera !== "on") return;
    setSubmitting(true);
    setResult(null);
    try {
      const image = await captureJpeg();
      const current = nonceRef.current;
      const nonce =
        current && current.wallet === wallet && Date.now() - current.at < NONCE_REFRESH_MS
          ? current.nonce
          : await fetchNonce(wallet);
      nonceRef.current = null; // single use

      const form = new FormData();
      form.set("image", image, "capture.jpg");
      form.set("nonce", nonce);
      form.set("wallet", wallet);
      form.set("marketId", marketId);
      const res = await fetch("/api/submit", { method: "POST", body: form });
      if (!res.ok) {
        setResult({ kind: "error", message: await errorMessage(res) });
      } else {
        const body = (await res.json()) as SubmitResponse;
        setResult({ kind: "response", body });
        if (body.status === "verified") void confirmPayoutBalance(wallet, balance);
      }
    } catch (err) {
      setResult({ kind: "error", message: err instanceof Error ? err.message : "Something went wrong, try again" });
    } finally {
      setSubmitting(false);
      fetchNonce(wallet).catch(() => {
        /* retried at the next shutter */
      });
    }
  }

  function createWallet() {
    const kp = Keypair.generate();
    const address = kp.publicKey.toBase58();
    const secretJson = JSON.stringify(Array.from(kp.secretKey));
    writeStorage(SECRET_KEY, secretJson);
    writeStorage(WALLET_KEY, address);
    setSecret(secretJson);
    setWallet(address);
    setBackupShown(true);
  }

  function usePasted() {
    const value = pasteValue.trim();
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value) || !isValidAddress(value)) {
      setPasteError("That is not a valid Solana address");
      return;
    }
    writeStorage(WALLET_KEY, value);
    writeStorage(SECRET_KEY, null);
    setSecret(null);
    setWallet(value);
    setPasteValue("");
    setPasteError(null);
  }

  function signOut() {
    if (secret && !window.confirm("This wallet was created here. Without a backup of the secret key, its funds are lost. Continue?")) {
      return;
    }
    stopCamera();
    writeStorage(WALLET_KEY, null);
    writeStorage(SECRET_KEY, null);
    setWallet(null);
    setSecret(null);
    setBalance(null);
    setResult(null);
    setBackupShown(false);
    nonceRef.current = null;
  }

  function chooseMarket(id: string) {
    setMarketId(id);
    writeStorage(MARKET_KEY, id);
  }

  if (!loaded) return <main className="min-h-dvh bg-neutral-950" />;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-4 bg-neutral-950 px-4 pt-5 pb-10 text-neutral-100">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-bold tracking-tight">Ground Truth</h1>
        <span className="rounded-full bg-neutral-800 px-3 py-1 text-xs font-medium text-neutral-400">devnet</span>
      </header>

      {!wallet ? (
        <section className="flex flex-col gap-4 rounded-2xl bg-neutral-900 p-5">
          <div>
            <h2 className="text-lg font-semibold">Get paid for price photos</h2>
            <p className="mt-1 text-sm text-neutral-400">Each verified photo of a price board pays 0.05 USDC.</p>
          </div>
          <button
            onClick={createWallet}
            className="min-h-14 rounded-xl bg-emerald-500 px-4 text-lg font-semibold text-neutral-950 active:bg-emerald-400"
          >
            Create a wallet for me
          </button>
          <div className="flex items-center gap-3 text-xs text-neutral-500">
            <span className="h-px flex-1 bg-neutral-800" /> or paste your address <span className="h-px flex-1 bg-neutral-800" />
          </div>
          <input
            value={pasteValue}
            onChange={(e) => setPasteValue(e.target.value)}
            placeholder="Solana address"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            className="min-h-14 rounded-xl border border-neutral-700 bg-neutral-950 px-4 font-mono text-base outline-none focus:border-emerald-500"
          />
          {pasteError && <p className="text-sm text-red-400">{pasteError}</p>}
          <button
            onClick={usePasted}
            disabled={!pasteValue.trim()}
            className="min-h-14 rounded-xl bg-neutral-800 px-4 text-lg font-semibold active:bg-neutral-700 disabled:opacity-40"
          >
            Use this address
          </button>
        </section>
      ) : (
        <>
          <section className="flex items-center justify-between gap-3 rounded-2xl bg-neutral-900 p-4">
            <div>
              <p className="text-xs uppercase tracking-wide text-neutral-500">Wallet</p>
              <p className="font-mono text-lg">{shortAddress(wallet)}</p>
            </div>
            <div className="text-right">
              <p className="text-xs uppercase tracking-wide text-neutral-500">Balance</p>
              <p className="text-lg font-semibold tabular-nums">
                {balance !== null ? `${balance.toFixed(2)} USDC` : balanceError ? "unavailable" : "…"}
              </p>
            </div>
          </section>

          {secret && backupShown && (
            <section className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-200">
              <p className="font-semibold">Back up this wallet</p>
              <p className="mt-1">
                The secret key exists only in this browser. Clearing site data or switching phones loses the wallet and its USDC.
                This is a devnet test wallet; do not send real funds to it.
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  onClick={() => void navigator.clipboard?.writeText(secret).catch(() => {})}
                  className="min-h-12 rounded-xl bg-amber-500/20 font-semibold active:bg-amber-500/30"
                >
                  Copy secret key
                </button>
                <button
                  onClick={() => setBackupShown(false)}
                  className="min-h-12 rounded-xl bg-neutral-800 font-semibold text-neutral-200 active:bg-neutral-700"
                >
                  I saved it
                </button>
              </div>
            </section>
          )}

          <section className="flex flex-col gap-2">
            <label htmlFor="market" className="text-xs uppercase tracking-wide text-neutral-500">
              Market
            </label>
            {marketsError ? (
              <p className="rounded-xl bg-red-500/10 p-4 text-red-300">{marketsError}</p>
            ) : (
              <select
                id="market"
                value={marketId}
                onChange={(e) => chooseMarket(e.target.value)}
                disabled={!markets || submitting}
                className="min-h-14 rounded-xl border border-neutral-700 bg-neutral-900 px-4 text-lg outline-none focus:border-emerald-500"
              >
                {!markets && <option>Loading markets…</option>}
                {markets?.length === 0 && <option value="">No markets yet. Run npm run seed-markets</option>}
                {markets?.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            )}
          </section>

          <section className="flex flex-col gap-3">
            <div className="relative aspect-[3/4] w-full overflow-hidden rounded-2xl bg-black">
              <video ref={videoRef} playsInline muted autoPlay className="h-full w-full object-cover" />
              {camera !== "on" && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center">
                  {cameraError && <p className="text-red-300">{cameraError}</p>}
                  <button
                    onClick={startCamera}
                    disabled={camera === "starting"}
                    className="min-h-14 rounded-xl bg-neutral-100 px-6 text-lg font-semibold text-neutral-950 active:bg-white disabled:opacity-50"
                  >
                    {camera === "starting" ? "Opening camera…" : "Open camera"}
                  </button>
                </div>
              )}
              {submitting && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/70">
                  <span className="h-10 w-10 animate-spin rounded-full border-4 border-neutral-600 border-t-emerald-400" />
                  <p className="text-xl font-semibold">Reading prices</p>
                  <p className="text-sm text-neutral-400">This can take up to 30 seconds</p>
                </div>
              )}
            </div>
            <button
              onClick={shoot}
              disabled={camera !== "on" || submitting || !marketId}
              className="min-h-16 rounded-2xl bg-emerald-500 text-xl font-bold text-neutral-950 active:bg-emerald-400 disabled:bg-neutral-800 disabled:text-neutral-500"
            >
              {submitting ? "Reading prices…" : "Take photo"}
            </button>
          </section>

          {result && <ResultCard result={result} />}

          <button onClick={signOut} className="mt-2 min-h-12 text-sm text-neutral-500 underline-offset-4 active:underline">
            Use a different wallet
          </button>
        </>
      )}
    </main>
  );
}

function ResultCard({ result }: { result: Result }) {
  if (result.kind === "error") {
    return (
      <section className="rounded-2xl border border-red-500/40 bg-red-500/10 p-5">
        <p className="text-sm font-semibold uppercase tracking-wide text-red-300">Not sent</p>
        <p className="mt-2 text-xl font-semibold text-red-100">{result.message}</p>
      </section>
    );
  }
  const r = result.body;
  const items = r.items.length > 0 && (
    <ul className="mt-3 divide-y divide-white/10">
      {r.items.map((it, i) => (
        <li key={i} className="flex items-baseline justify-between gap-3 py-2">
          <span className="capitalize">{it.item}</span>
          <span className="font-semibold tabular-nums">
            {it.price.toLocaleString(undefined, { maximumFractionDigits: 2 })} {it.currency}
            <span className="font-normal text-neutral-400"> / {it.unit}</span>
          </span>
        </li>
      ))}
    </ul>
  );

  switch (r.status) {
    case "verified":
      return (
        <section className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-5">
          <p className="text-sm font-semibold uppercase tracking-wide text-emerald-300">Verified</p>
          <p className="mt-1 text-2xl font-bold text-emerald-100">0.05 USDC paid</p>
          {items}
          {r.explorerUrl && (
            <a
              href={r.explorerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 flex min-h-12 items-center justify-center rounded-xl bg-emerald-500/20 font-semibold text-emerald-100 active:bg-emerald-500/30"
            >
              View payment on Solana Explorer
            </a>
          )}
        </section>
      );
    case "review":
      return (
        <section className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-5">
          <p className="text-sm font-semibold uppercase tracking-wide text-amber-300">In review, no payout yet</p>
          <p className="mt-1 text-lg text-amber-100">{r.reason}</p>
          {items}
          <p className="mt-3 rounded-xl bg-amber-500/10 p-3 text-base font-medium text-amber-100">
            Next time, hold the camera closer and fill the frame with the price label.
          </p>
        </section>
      );
    case "payout_failed":
      return (
        <section className="rounded-2xl border border-sky-500/40 bg-sky-500/10 p-5">
          <p className="text-sm font-semibold uppercase tracking-wide text-sky-300">Photo saved</p>
          <p className="mt-1 text-lg text-sky-100">Your payout is pending and will be retried.</p>
          {items}
        </section>
      );
    case "rejected":
      return (
        <section className="rounded-2xl border border-red-500/40 bg-red-500/10 p-5">
          <p className="text-sm font-semibold uppercase tracking-wide text-red-300">Rejected</p>
          <p className="mt-2 text-2xl font-bold leading-snug text-red-100">{r.reason}</p>
        </section>
      );
  }
}
