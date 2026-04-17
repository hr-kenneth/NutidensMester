import { useEffect, useState } from "react";
import { getCurrentUser } from "aws-amplify/auth";
import LoginPage from "./components/LoginPage";
import GroupsPage from "./components/GroupsPage";
import GroupPage from "./components/GroupPage";

type AuthState = "loading" | "authenticated" | "unauthenticated";

interface GroupView {
  groupId: string;
  groupName: string;
  mesterName: string | null;
  currentCycleNumber: number;
  roundsPlayedInCycle: number;
  memberCount: number;
}

type View = { page: "groups" } | ({ page: "group" } & GroupView);

export default function App() {
  const [authState, setAuthState] = useState<AuthState>("loading");
  const [username, setUsername] = useState("");
  const [view, setView] = useState<View>({ page: "groups" });

  useEffect(() => {
    getCurrentUser()
      .then((user) => { setUsername(user.username); setAuthState("authenticated"); })
      .catch(() => setAuthState("unauthenticated"));
  }, []);

  if (authState === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0d0d0d]">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-700 border-t-zinc-400" />
      </div>
    );
  }

  if (authState === "unauthenticated") {
    return (
      <LoginPage onSignIn={(u) => { setUsername(u); setAuthState("authenticated"); }} />
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

  return (
    <GroupsPage
      onSelectGroup={(groupId, groupName, mesterName, currentCycleNumber, roundsPlayedInCycle, memberCount) =>
        setView({ page: "group", groupId, groupName, mesterName, currentCycleNumber, roundsPlayedInCycle, memberCount })
      }
      onSignOut={() => setAuthState("unauthenticated")}
    />
  );
}
