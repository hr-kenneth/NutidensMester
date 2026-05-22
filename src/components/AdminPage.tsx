import { useEffect, useState } from "react";
import { generateClient } from "aws-amplify/api";
import { signOut } from "aws-amplify/auth";
import { LIST_USERS, CREATE_USER, DELETE_USER } from "../graphql/operations";

const gql = generateClient();

const inputClass =
  "w-full rounded-xl border border-zinc-700 bg-zinc-800/60 px-4 py-3 text-sm text-white placeholder-zinc-500 outline-none transition focus:border-zinc-400 focus:ring-1 focus:ring-zinc-400";

interface Props {
  onBack: () => void;
  onSignOut: () => void;
}

export default function AdminPage({ onBack, onSignOut }: Props) {
  const [users, setUsers] = useState<{ username: string; email: string | null }[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);

  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [createError, setCreateError] = useState("");
  const [createSuccess, setCreateSuccess] = useState("");

  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [deleteSuccess, setDeleteSuccess] = useState("");
  const [pendingDelete, setPendingDelete] = useState("");

  async function loadUsers() {
    try {
      const res = (await gql.graphql({ query: LIST_USERS })) as any;
      setUsers(res.data.listUsers ?? []);
    } finally {
      setUsersLoading(false);
    }
  }

  useEffect(() => { loadUsers(); }, []);

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setCreateSubmitting(true);
    setCreateError("");
    setCreateSuccess("");
    const form = e.currentTarget;
    const username = (form.elements.namedItem("username") as HTMLInputElement).value.trim();
    const email = (form.elements.namedItem("email") as HTMLInputElement).value.trim();
    try {
      await gql.graphql({ query: CREATE_USER, variables: { username, email } });
      setCreateSuccess(`Bruger "${username}" oprettet. En midlertidig adgangskode er sendt til ${email}.`);
      form.reset();
    } catch (err: any) {
      setCreateError(err?.errors?.[0]?.message ?? "Kunne ikke oprette bruger.");
    } finally {
      setCreateSubmitting(false);
    }
  }

  async function handleDelete() {
    setDeleteSubmitting(true);
    setDeleteError("");
    setDeleteSuccess("");
    try {
      await gql.graphql({ query: DELETE_USER, variables: { username: pendingDelete } });
      setDeleteSuccess(`Bruger "${pendingDelete}" er slettet.`);
      setPendingDelete("");
      loadUsers();
    } catch (err: any) {
      setDeleteError(err?.errors?.[0]?.message ?? "Kunne ikke slette bruger.");
    } finally {
      setDeleteSubmitting(false);
    }
  }

  async function handleSignOut() {
    await signOut();
    onSignOut();
  }

  return (
    <main className="min-h-screen bg-[#0d0d0d] px-4 py-10">
      <div className="mx-auto max-w-lg">
        <div className="mb-8 flex items-center justify-between">
          <button onClick={onBack} className="text-xs text-zinc-500 transition hover:text-zinc-300">
            ← Tilbage
          </button>
          <button onClick={handleSignOut} className="text-xs text-zinc-500 transition hover:text-zinc-300">
            Log ud
          </button>
        </div>

        <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400">
          Nutidens Mester
        </p>
        <h1 className="mt-1 mb-8 text-2xl font-bold text-white">Brugeradministration</h1>

        {/* Create user */}
        <div className="mb-6 rounded-2xl border border-zinc-800 bg-zinc-900/80 p-6">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-widest text-zinc-400">Opret bruger</h2>
          <form onSubmit={handleCreate} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <label className="text-xs font-medium uppercase tracking-widest text-zinc-400">Brugernavn</label>
              <input name="username" type="text" required placeholder="vælg et brugernavn" className={inputClass} />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-xs font-medium uppercase tracking-widest text-zinc-400">E-mail</label>
              <input name="email" type="email" required placeholder="brugerens@email.dk" className={inputClass} />
            </div>
            {createError && <p className="text-sm text-red-400">{createError}</p>}
            {createSuccess && <p className="text-sm text-green-400">{createSuccess}</p>}
            <button type="submit" disabled={createSubmitting}
              className="mt-2 w-full rounded-xl bg-zinc-700 py-3 text-sm font-semibold text-white transition hover:bg-zinc-600 disabled:opacity-50">
              {createSubmitting ? "Opretter…" : "Opret bruger"}
            </button>
          </form>
        </div>

        {/* Delete user */}
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-6">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-widest text-zinc-400">Slet bruger</h2>
          {!pendingDelete ? (
            <>
              {deleteSuccess && <p className="mb-3 text-sm text-green-400">{deleteSuccess}</p>}
              {deleteError && <p className="mb-3 text-sm text-red-400">{deleteError}</p>}
              {usersLoading ? (
                <div className="flex justify-center py-6">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-700 border-t-zinc-400" />
                </div>
              ) : users.length === 0 ? (
                <p className="text-sm text-zinc-500">Ingen brugere fundet.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {users.map((u) => (
                    <li key={u.username}>
                      <button
                        onClick={() => { setPendingDelete(u.username); setDeleteError(""); setDeleteSuccess(""); }}
                        className="w-full rounded-xl border border-zinc-700 px-4 py-3 text-left text-sm transition hover:border-red-800 hover:text-red-400"
                      >
                        <span className="font-medium text-white">{u.username}</span>
                        {u.email && <span className="ml-2 text-zinc-500">{u.email}</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <div className="flex flex-col gap-4">
              <p className="text-sm text-zinc-300">
                Er du sikker på, at du vil slette <span className="font-semibold text-white">{pendingDelete}</span>?
              </p>
              {deleteError && <p className="text-sm text-red-400">{deleteError}</p>}
              <div className="flex gap-3">
                <button onClick={() => setPendingDelete("")}
                  className="flex-1 rounded-xl border border-zinc-700 py-3 text-sm font-medium text-zinc-300 transition hover:border-zinc-500">
                  Annuller
                </button>
                <button onClick={() => handleDelete()} disabled={deleteSubmitting}
                  className="flex-1 rounded-xl bg-red-800 py-3 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-50">
                  {deleteSubmitting ? "Sletter…" : "Ja, slet"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
