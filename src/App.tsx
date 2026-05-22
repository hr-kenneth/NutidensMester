import { useEffect, useState } from "react";
import { getCurrentUser, fetchAuthSession } from "aws-amplify/auth";
import LoginPage from "./components/LoginPage";
import GroupsPage from "./components/GroupsPage";
import GroupPage from "./components/GroupPage";
import AdminPage from "./components/AdminPage";

type AuthState = "loading" | "authenticated" | "unauthenticated";

interface GroupView {
  groupId: string;
  groupName: string;
  mesterName: string | null;
  currentCycleNumber: number;
  roundsPlayedInCycle: number;
  memberCount: number;
}

type View = { page: "groups" } | { page: "admin" } | ({ page: "group" } & GroupView);

export default function App() {
  const [authState, setAuthState] = useState<AuthState>("loading");
  const [username, setUsername] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [view, setView] = useState<View>({ page: "groups" });

  async function loadSession() {
    try {
      const [user, session] = await Promise.all([getCurrentUser(), fetchAuthSession({ forceRefresh: true })]);
      setUsername(user.username);
      const groups = (session.tokens?.accessToken?.payload?.["cognito:groups"] as string[]) ?? [];
      setIsAdmin(groups.includes("Admins"));
      setAuthState("authenticated");
    } catch {
      setAuthState("unauthenticated");
    }
  }

  useEffect(() => { loadSession(); }, []);

  if (authState === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0d0d0d]">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-700 border-t-zinc-400" />
      </div>
    );
  }

  if (authState === "unauthenticated") {
    return (
      <LoginPage onSignIn={() => loadSession()} />
    );
  }

  if (view.page === "group") {
    return (
      <GroupPage
        groupId={view.groupId}
        groupName={view.groupName}
        initialMesterName={view.mesterName}
        initialCycleNumber={view.currentCycleNumber}
        initialRoundsPlayed={view.roundsPlayedInCycle}
        memberCount={view.memberCount}
        onBack={() => setView({ page: "groups" })}
        onSignOut={() => { setAuthState("unauthenticated"); setView({ page: "groups" }); }}
      />
    );
  }

  if (view.page === "admin") {
    return (
      <AdminPage
        onBack={() => setView({ page: "groups" })}
        onSignOut={() => { setAuthState("unauthenticated"); setView({ page: "groups" }); }}
      />
    );
  }

  return (
    <GroupsPage
      isAdmin={isAdmin}
      onAdmin={() => setView({ page: "admin" })}
      onSelectGroup={(groupId, groupName, mesterName, currentCycleNumber, roundsPlayedInCycle, memberCount) =>
        setView({ page: "group", groupId, groupName, mesterName, currentCycleNumber, roundsPlayedInCycle, memberCount })
      }
      onSignOut={() => setAuthState("unauthenticated")}
    />
  );
}
