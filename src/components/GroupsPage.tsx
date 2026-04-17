import { useEffect, useState } from "react";
import { generateClient } from "aws-amplify/api";
import { signOut } from "aws-amplify/auth";
import { LIST_MY_GROUPS, CREATE_GROUP, JOIN_GROUP } from "../graphql/operations";

const gql = generateClient();

interface Group {
  groupId: string;
  name: string;
  memberCount: number;
  mesterName: string | null;
  currentCycleNumber: number;
  roundsPlayedInCycle: number;
}

interface Props {
  onSelectGroup: (
    groupId: string, groupName: string, mesterName: string | null,
    currentCycleNumber: number, roundsPlayedInCycle: number, memberCount: number
  ) => void;
  onSignOut: () => void;
}

const inputClass =
  "w-full rounded-xl border border-zinc-700 bg-zinc-800/60 px-4 py-3 text-sm text-white placeholder-zinc-500 outline-none transition focus:border-zinc-400 focus:ring-1 focus:ring-zinc-400";

export default function GroupsPage({ onSelectGroup, onSignOut }: Props) {
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modal, setModal] = useState<"none" | "create" | "join">("none");
  const [submitting, setSubmitting] = useState(false);

  async function loadGroups() {
    try {
      const res = (await gql.graphql({ query: LIST_MY_GROUPS })) as any;
      setGroups(res.data.listMyGroups ?? []);
    } catch {
      setError("Kunne ikke hente grupper.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadGroups(); }, []);

  function openModal(m: "create" | "join") {
    setError("");
    setModal(m);
  }

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    const form = e.currentTarget;
    const name = (form.elements.namedItem("name") as HTMLInputElement).value;
    const displayName = (form.elements.namedItem("displayName") as HTMLInputElement).value;
    try {
      const res = (await gql.graphql({ query: CREATE_GROUP, variables: { name, displayName } })) as any;
      setGroups((prev) => [res.data.createGroup, ...prev]);
      setModal("none");
    } catch (err: any) {
      console.error("createGroup error", err?.errors ?? err);
      setError("Kunne ikke oprette gruppe.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleJoin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    const form = e.currentTarget;
    const groupId = (form.elements.namedItem("groupId") as HTMLInputElement).value.trim();
    const displayName = (form.elements.namedItem("displayName") as HTMLInputElement).value;
    try {
      await gql.graphql({ query: JOIN_GROUP, variables: { groupId, displayName } });
      await loadGroups();
      setModal("none");
    } catch {
      setError("Kunne ikke tilmelde. Tjek gruppe-ID.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSignOut() {
    await signOut();
    onSignOut();
  }

  return (
    <main className="min-h-screen bg-[#0d0d0d] px-4 py-10">
      <div className="mx-auto max-w-lg">
        <div className="mb-8 flex items-start justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400">
              Nutidens Mester
            </p>
            <h1 className="mt-1 text-2xl font-bold text-white">Mine grupper</h1>
          </div>
          <button
            onClick={handleSignOut}
            className="text-xs text-zinc-500 transition hover:text-zinc-300"
          >
            Log ud
          </button>
        </div>

        {error && !modal && <p className="mb-4 text-sm text-red-400">{error}</p>}

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-700 border-t-zinc-400" />
          </div>
        ) : groups.length === 0 ? (
          <p className="py-16 text-center text-sm text-zinc-500">
            Du er endnu ikke en del af nogen grupper.
          </p>
        ) : (
          <ul className="mb-6 flex flex-col gap-3">
            {groups.map((g) => (
              <li key={g.groupId}>
                <button
                  onClick={() => onSelectGroup(g.groupId, g.name, g.mesterName, g.currentCycleNumber, g.roundsPlayedInCycle, g.memberCount)}
                  className="w-full rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5 text-left transition hover:border-zinc-600"
                >
                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-white">{g.name}</p>
                    <p className="text-xs text-zinc-500">
                      {g.memberCount} {g.memberCount === 1 ? "spiller" : "spillere"}
                    </p>
                  </div>
                  {g.mesterName && (
                    <p className="mt-1.5 text-xs text-zinc-400">
                      Mester: <span className="text-zinc-200">{g.mesterName}</span>
                    </p>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex gap-3">
          <button
            onClick={() => openModal("create")}
            className="flex-1 rounded-xl bg-zinc-700 py-3 text-sm font-semibold text-white transition hover:bg-zinc-600"
          >
            + Opret gruppe
          </button>
          <button
            onClick={() => openModal("join")}
            className="flex-1 rounded-xl border border-zinc-700 py-3 text-sm font-semibold text-zinc-300 transition hover:border-zinc-500 hover:text-white"
          >
            Tilmeld gruppe
          </button>
        </div>
      </div>

      {modal !== "none" && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-zinc-800 bg-zinc-900 p-8 shadow-2xl">
            <h2 className="mb-6 text-lg font-bold text-white">
              {modal === "create" ? "Opret ny gruppe" : "Tilmeld gruppe"}
            </h2>
            <form
              onSubmit={modal === "create" ? handleCreate : handleJoin}
              className="flex flex-col gap-4"
            >
              {modal === "create" && (
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-medium uppercase tracking-widest text-zinc-400">
                    Gruppenavn
                  </label>
                  <input
                    name="name"
                    type="text"
                    required
                    placeholder="f.eks. Familien"
                    className={inputClass}
                  />
                </div>
              )}
              {modal === "join" && (
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-medium uppercase tracking-widest text-zinc-400">
                    Gruppe-ID
                  </label>
                  <input
                    name="groupId"
                    type="text"
                    required
                    placeholder="indsæt gruppe-ID her"
                    className={inputClass}
                  />
                </div>
              )}
              <div className="flex flex-col gap-2">
                <label className="text-xs font-medium uppercase tracking-widest text-zinc-400">
                  Dit navn i gruppen
                </label>
                <input
                  name="displayName"
                  type="text"
                  required
                  placeholder="dit navn"
                  className={inputClass}
                />
              </div>
              {error && <p className="text-sm text-red-400">{error}</p>}
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setModal("none")}
                  className="flex-1 rounded-xl border border-zinc-700 py-3 text-sm font-medium text-zinc-300 transition hover:border-zinc-500"
                >
                  Annuller
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 rounded-xl bg-zinc-600 py-3 text-sm font-semibold text-white transition hover:bg-zinc-500 disabled:opacity-50"
                >
                  {submitting ? "…" : modal === "create" ? "Opret" : "Tilmeld"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
