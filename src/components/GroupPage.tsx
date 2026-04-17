import { useCallback, useEffect, useRef, useState } from "react";
import { generateClient } from "aws-amplify/api";
import { signOut } from "aws-amplify/auth";
import {
  LIST_MEMBERS,
  LIST_ROUNDS_IN_CYCLE,
  RECORD_ROUND,
  ON_ROUND_ADDED,
} from "../graphql/operations";

const gql = generateClient();

interface Member { username: string; displayName: string }
interface Round {
  cycleNumber: number; roundNumber: number;
  winner: string; winnerDisplayName: string; recordedAt: string;
}
interface CycleState {
  cycleNumber: number;
  roundsPlayedInCycle: number;
  memberCount: number;
  mesterName: string | null;
}

interface Props {
  groupId: string;
  groupName: string;
  initialMesterName: string | null;
  initialCycleNumber: number;
  initialRoundsPlayed: number;
  memberCount: number;
  onBack: () => void;
  onSignOut: () => void;
}

const inputClass =
  "w-full rounded-xl border border-zinc-700 bg-zinc-800/60 px-4 py-3 text-sm text-white outline-none transition focus:border-zinc-400 focus:ring-1 focus:ring-zinc-400";

export default function GroupPage({
  groupId, groupName, initialMesterName, initialCycleNumber,
  initialRoundsPlayed, memberCount, onBack, onSignOut,
}: Props) {
  const [members, setMembers] = useState<Member[]>([]);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [cycle, setCycle] = useState<CycleState>({
    cycleNumber: initialCycleNumber,
    roundsPlayedInCycle: initialRoundsPlayed,
    memberCount,
    mesterName: initialMesterName,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [recording, setRecording] = useState(false);
  const [selectedWinner, setSelectedWinner] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const cycleRef = useRef(cycle);
  cycleRef.current = cycle;

  const loadData = useCallback(async (cycleNumber: number) => {
    try {
      const [membersRes, roundsRes] = await Promise.all([
        gql.graphql({ query: LIST_MEMBERS, variables: { groupId } }) as any,
        gql.graphql({ query: LIST_ROUNDS_IN_CYCLE, variables: { groupId, cycleNumber } }) as any,
      ]);
      setMembers(membersRes.data.listMembers ?? []);
      setRounds(
        (roundsRes.data.listRoundsInCycle ?? []).sort(
          (a: Round, b: Round) => a.roundNumber - b.roundNumber
        )
      );
    } catch {
      setError("Kunne ikke hente gruppedata.");
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useEffect(() => {
    loadData(cycle.cycleNumber);

    const sub = (gql.graphql({
      query: ON_ROUND_ADDED,
      variables: { groupId },
    }) as any).subscribe({
      next: ({ data }: any) => {
        const round: Round = data?.onRoundAdded;
        if (!round) return;

        const current = cycleRef.current;
        const isLastRound = round.roundNumber === current.memberCount;

        if (isLastRound) {
          // Cycle completed — update mester, start new cycle, clear rounds
          setCycle((prev) => ({
            ...prev,
            cycleNumber: prev.cycleNumber + 1,
            roundsPlayedInCycle: 0,
            mesterName: round.winnerDisplayName,
          }));
          setRounds([]);
        } else {
          setRounds((prev) => {
            const exists = prev.some(
              (r) => r.cycleNumber === round.cycleNumber && r.roundNumber === round.roundNumber
            );
            return exists ? prev : [...prev, round];
          });
          setCycle((prev) => ({ ...prev, roundsPlayedInCycle: round.roundNumber }));
        }
      },
      error: (e: unknown) => console.error("Subscription error", e),
    });

    return () => sub.unsubscribe();
  }, [groupId, loadData]);

  async function handleRecordRound(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedWinner) return;
    setSubmitting(true);
    setError("");
    try {
      await gql.graphql({
        query: RECORD_ROUND,
        variables: { groupId, winner: selectedWinner },
      });
      setRecording(false);
      setSelectedWinner("");
    } catch {
      setError("Kunne ikke registrere runden.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSignOut() {
    await signOut();
    onSignOut();
  }

  const progress = cycle.memberCount > 0
    ? (cycle.roundsPlayedInCycle / cycle.memberCount) * 100
    : 0;

  return (
    <main className="min-h-screen bg-[#0d0d0d] px-4 py-10">
      <div className="mx-auto max-w-lg">
        {/* Header */}
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
        <h1 className="mt-1 mb-6 text-2xl font-bold text-white">{groupName}</h1>

        {error && <p className="mb-4 text-sm text-red-400">{error}</p>}

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-700 border-t-zinc-400" />
          </div>
        ) : (
          <>
            {/* Mester card */}
            <div className="mb-4 rounded-2xl border border-zinc-800 bg-zinc-900/80 p-6 text-center">
              <p className="mb-1 text-xs font-medium uppercase tracking-widest text-zinc-500">
                Nutidens Mester
              </p>
              <p className="text-3xl font-bold text-white">
                {cycle.mesterName ?? "—"}
              </p>
            </div>

            {/* Cycle progress */}
            <div className="mb-4 rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-semibold text-white">
                  Cyklus {cycle.cycleNumber}
                </p>
                <p className="text-xs text-zinc-500">
                  {cycle.roundsPlayedInCycle} / {cycle.memberCount} runder
                </p>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
                <div
                  className="h-full rounded-full bg-zinc-400 transition-all duration-500"
                  style={{ width: `${progress}%` }}
                />
              </div>

              {rounds.length > 0 && (
                <ul className="mt-4 flex flex-col gap-2 border-t border-zinc-800 pt-4">
                  {rounds.map((r) => (
                    <li key={r.roundNumber} className="flex items-center justify-between text-sm">
                      <span className="text-zinc-500">Runde {r.roundNumber}</span>
                      <span className="font-medium text-white">{r.winnerDisplayName}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Record round */}
            {!recording ? (
              <button
                onClick={() => setRecording(true)}
                className="mb-4 w-full rounded-xl bg-zinc-700 py-3 text-sm font-semibold text-white transition hover:bg-zinc-600"
              >
                Registrer runde
              </button>
            ) : (
              <form
                onSubmit={handleRecordRound}
                className="mb-4 rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5"
              >
                <p className="mb-4 text-sm font-semibold text-white">Hvem vandt runden?</p>
                <select
                  value={selectedWinner}
                  onChange={(e) => setSelectedWinner(e.target.value)}
                  required
                  className={inputClass}
                >
                  <option value="" disabled>Vælg vinder</option>
                  {members.map((m) => (
                    <option key={m.username} value={m.username}>
                      {m.displayName}
                    </option>
                  ))}
                </select>
                <div className="mt-4 flex gap-3">
                  <button
                    type="button"
                    onClick={() => { setRecording(false); setSelectedWinner(""); }}
                    className="flex-1 rounded-xl border border-zinc-700 py-3 text-sm font-medium text-zinc-300 transition hover:border-zinc-500"
                  >
                    Annuller
                  </button>
                  <button
                    type="submit"
                    disabled={submitting || !selectedWinner}
                    className="flex-1 rounded-xl bg-zinc-600 py-3 text-sm font-semibold text-white transition hover:bg-zinc-500 disabled:opacity-50"
                  >
                    {submitting ? "…" : "Gem"}
                  </button>
                </div>
              </form>
            )}

            {/* Members + group ID */}
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5">
              <p className="mb-3 text-xs font-medium uppercase tracking-widest text-zinc-400">
                Medlemmer
              </p>
              <ul className="mb-4 flex flex-col gap-2">
                {members.map((m) => (
                  <li key={m.username} className="text-sm text-white">
                    {m.displayName}
                  </li>
                ))}
              </ul>
              <div className="rounded-lg bg-zinc-800 px-3 py-2">
                <p className="text-xs text-zinc-500">Gruppe-ID — del med andre spillere</p>
                <p className="mt-0.5 break-all font-mono text-xs text-zinc-300">{groupId}</p>
              </div>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
