import { useEffect, useState } from "react";
import { getCurrentUser } from "aws-amplify/auth";
import LoginPage from "./components/LoginPage";
import WelcomePage from "./components/WelcomePage";

type AuthState = "loading" | "authenticated" | "unauthenticated";

export default function App() {
  const [authState, setAuthState] = useState<AuthState>("loading");
  const [username, setUsername] = useState("");

  useEffect(() => {
    getCurrentUser()
      .then((user) => {
        setUsername(user.username);
        setAuthState("authenticated");
      })
      .catch(() => setAuthState("unauthenticated"));
  }, []);

  if (authState === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0d0d0d]">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-600 border-t-blue-500" />
      </div>
    );
  }

  if (authState === "authenticated") {
    return (
      <WelcomePage
        username={username}
        onSignOut={() => setAuthState("unauthenticated")}
      />
    );
  }

  return (
    <LoginPage
      onSignIn={(u) => {
        setUsername(u);
        setAuthState("authenticated");
      }}
    />
  );
}
