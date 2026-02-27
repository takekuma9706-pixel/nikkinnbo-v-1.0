import { supabase } from "./supabase";
import { useEffect, useState } from "react";
import ShiftApp from "./ShiftApp";

function App() {
  const [session, setSession] = useState(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  // 未ログイン：ログイン画面
  if (!session) {
    const login = async () => {
      setBusy(true);
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      setBusy(false);

      if (error) alert(error.message);
    };

    return (
      <div style={{ padding: 20, maxWidth: 360, margin: "0 auto" }}>
        <h2>ログイン</h2>

        <div style={{ display: "grid", gap: 10 }}>
          <input
            type="email"
            placeholder="メール"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ padding: 10, fontSize: 16 }}
          />
          <input
            type="password"
            placeholder="パスワード"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ padding: 10, fontSize: 16 }}
          />
          <button
            onClick={login}
            disabled={busy || !email || !password}
            style={{ padding: 12, fontSize: 16 }}
          >
            ログイン
          </button>
        </div>
      </div>
    );
  }

  // ログイン済み：シフト表
  return (
    <div>
      <div style={{ textAlign: "right", padding: 10 }}>
        <button
          onClick={() => supabase.auth.signOut()}
          style={{ padding: 10 }}
        >
          ログアウト
        </button>
      </div>

      <ShiftApp />
    </div>
  );
}

export default App;