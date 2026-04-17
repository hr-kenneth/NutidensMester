import { signOut } from "aws-amplify/auth";
import { useState } from "react";

export default function WelcomePage({
  username,
  onSignOut,
}: {
  username: string;
  onSignOut: () => void;
}) {
  const [loading, setLoading] = useState(false);

  async function handleSignOut() {
    setLoading(true);
    try {
      await signOut();
      onSignOut();
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[#0d0d0d] px-4">
      <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900/80 p-10 text-center shadow-2xl backdrop-blur-sm">
        <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-blue-500">
          Nutidens Mester
        </p>
        <h1 className="mb-3 text-3xl font-bold tracking-tight text-white">
          Velkommen, {username}
        </h1>
        <p className="mb-8 text-zinc-400">Du er nu logget ind.</p>
        <button
          onClick={handleSignOut}
          disabled={loading}
          className="rounded-xl border border-zinc-700 bg-zinc-800 px-6 py-2.5 text-sm font-medium text-zinc-300 transition hover:border-zinc-500 hover:text-white disabled:opacity-50"
        >
          {loading ? "Logger ud…" : "Log ud"}
        </button>
      </div>
    </main>
  );
}
