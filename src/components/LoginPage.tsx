import { signIn, confirmSignIn } from "aws-amplify/auth";
import { FormEvent, useState } from "react";

type Step = "login" | "new-password";

const inputClass =
  "w-full rounded-xl border border-zinc-700 bg-zinc-800/60 px-4 py-3 text-sm text-white placeholder-zinc-500 outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500";

export default function LoginPage({ onSignIn }: { onSignIn: (username: string) => void }) {
  const [step, setStep] = useState<Step>("login");
  const [pendingUsername, setPendingUsername] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const form = e.currentTarget;
    const username = (form.elements.namedItem("username") as HTMLInputElement).value;
    const password = (form.elements.namedItem("password") as HTMLInputElement).value;
    try {
      const { nextStep } = await signIn({ username, password });
      if (nextStep.signInStep === "CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED") {
        setPendingUsername(username);
        setStep("new-password");
      } else {
        onSignIn(username);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Forkert brugernavn eller adgangskode.");
    } finally {
      setLoading(false);
    }
  }

  async function handleNewPassword(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const form = e.currentTarget;
    const newPassword = (form.elements.namedItem("newPassword") as HTMLInputElement).value;
    const confirm = (form.elements.namedItem("confirmPassword") as HTMLInputElement).value;
    const email = (form.elements.namedItem("email") as HTMLInputElement).value;
    if (newPassword !== confirm) {
      setError("Adgangskoderne er ikke ens.");
      setLoading(false);
      return;
    }
    try {
      await confirmSignIn({
        challengeResponse: newPassword,
        options: { userAttributes: { email } },
      });
      onSignIn(pendingUsername);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Kunne ikke gemme ny adgangskode.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#0d0d0d] px-4">
      <div className="w-full max-w-sm rounded-2xl border border-zinc-800 bg-zinc-900/80 p-8 shadow-2xl backdrop-blur-sm">
        <p className="mb-6 text-center text-xs font-semibold uppercase tracking-widest text-blue-500">
          Nutidens Mester
        </p>

        {step === "login" ? (
          <>
            <h1 className="mb-1 text-center text-2xl font-bold tracking-tight text-white">
              Velkommen
            </h1>
            <p className="mb-8 text-center text-sm text-zinc-500">Log ind for at fortsætte</p>
            <form onSubmit={handleLogin} className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <label htmlFor="username" className="text-xs font-medium uppercase tracking-widest text-zinc-400">
                  Brugernavn
                </label>
                <input
                  id="username"
                  name="username"
                  type="text"
                  required
                  autoComplete="username"
                  placeholder="dit brugernavn"
                  className={inputClass}
                />
              </div>
              <div className="flex flex-col gap-2">
                <label htmlFor="password" className="text-xs font-medium uppercase tracking-widest text-zinc-400">
                  Adgangskode
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  required
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className={inputClass}
                />
              </div>
              {error && <p className="text-sm text-red-400">{error}</p>}
              <button
                type="submit"
                disabled={loading}
                className="mt-2 w-full rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:opacity-50"
              >
                {loading ? "Logger ind…" : "Log ind"}
              </button>
            </form>
          </>
        ) : (
          <>
            <h1 className="mb-1 text-center text-2xl font-bold tracking-tight text-white">
              Vælg ny adgangskode
            </h1>
            <p className="mb-8 text-center text-sm text-zinc-500">
              Din midlertidige adgangskode er udløbet. Vælg en ny.
            </p>
            <form onSubmit={handleNewPassword} className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <label htmlFor="email" className="text-xs font-medium uppercase tracking-widest text-zinc-400">
                  E-mail
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="din@email.dk"
                  className={inputClass}
                />
              </div>
              <div className="flex flex-col gap-2">
                <label htmlFor="newPassword" className="text-xs font-medium uppercase tracking-widest text-zinc-400">
                  Ny adgangskode
                </label>
                <input
                  id="newPassword"
                  name="newPassword"
                  type="password"
                  required
                  autoComplete="new-password"
                  placeholder="••••••••"
                  className={inputClass}
                />
              </div>
              <div className="flex flex-col gap-2">
                <label htmlFor="confirmPassword" className="text-xs font-medium uppercase tracking-widest text-zinc-400">
                  Bekræft adgangskode
                </label>
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  required
                  autoComplete="new-password"
                  placeholder="••••••••"
                  className={inputClass}
                />
              </div>
              {error && <p className="text-sm text-red-400">{error}</p>}
              <button
                type="submit"
                disabled={loading}
                className="mt-2 w-full rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:opacity-50"
              >
                {loading ? "Gemmer…" : "Gem adgangskode"}
              </button>
            </form>
          </>
        )}
      </div>
    </main>
  );
}
