import { useState } from "react";
import { LogOut, RefreshCw } from "lucide-react";
import vandsLogo from "./assets/vands-logo.png";
import { Dashboard } from "./components/Dashboard";
import { AdminAccounts } from "./components/AdminAccounts";
import { ActivityLog } from "./components/ActivityLog";
import { RoomBedSettings } from "./components/RoomBedSettings";
import { ProcedureHistory } from "./components/ProcedureHistory";
import { LoginScreen } from "./components/LoginScreen";
import { SummaryBar } from "./components/SummaryBar";
import { Toast } from "./components/Toast";
import { useAuth, type AppRole } from "./hooks/useAuth";
import { useBeds } from "./hooks/useBeds";
import { useNow } from "./hooks/useNow";

type AdminTab = "dashboard" | "accounts" | "rooms" | "history" | "activity";

const ADMIN_TABS: Array<{ id: AdminTab; label: string; description?: string }> = [
  { id: "dashboard", label: "대시보드" },
  { id: "accounts", label: "계정 관리", description: "계정 생성과 비밀번호 변경은 Edge Function 연결 후 활성화됩니다." },
  { id: "rooms", label: "룸/베드 설정" },
  { id: "history", label: "시술 기록" },
  { id: "activity", label: "활동 로그" },
];

function DashboardShell({ role, onSignOut }: { role: AppRole; onSignOut: () => Promise<void> }) {
  const now = useNow();
  const beds = useBeds();
  const [activeTab, setActiveTab] = useState<AdminTab>("dashboard");
  const isAdmin = role === "admin";
  const activeAdminTab = ADMIN_TABS.find((tab) => tab.id === activeTab) ?? ADMIN_TABS[0];

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-block" aria-label="Vands 홍대">
          <img src={vandsLogo} alt="Vands 홍대" />
        </div>
        <SummaryBar beds={beds.beds} now={now} />
        <div className="topbar-actions">
          <div className="live-clock">
            <span>{new Intl.DateTimeFormat("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false }).format(now)}</span>
            <small>실시간 업데이트</small>
          </div>
          <button className="icon-button" type="button" onClick={beds.refresh} disabled={beds.loading} title="새로고침" aria-label="새로고침">
            <RefreshCw size={18} aria-hidden="true" />
          </button>
          <button className="icon-button" type="button" onClick={() => void onSignOut()} title="로그아웃" aria-label="로그아웃">
            <LogOut size={18} aria-hidden="true" />
          </button>
        </div>
      </header>

      {isAdmin ? (
        <nav className="admin-tabs" aria-label="관리자 메뉴" role="tablist">
          {ADMIN_TABS.map((tab) => (
            <button
              className={tab.id === activeTab ? "admin-tabs__tab admin-tabs__tab--active" : "admin-tabs__tab"}
              type="button"
              role="tab"
              aria-selected={tab.id === activeTab}
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      ) : null}

      {activeTab === "dashboard" ? (
        <Dashboard
          beds={beds.beds}
          rooms={beds.rooms}
          connection={beds.connection}
          loading={beds.loading}
          now={now}
          onSetStatus={beds.setStatus}
          onSetFollowUp={beds.setFollowUp}
        />
      ) : activeTab === "accounts" ? (
        <AdminAccounts />
      ) : activeTab === "activity" ? (
        <ActivityLog />
      ) : activeTab === "rooms" ? (
        <RoomBedSettings rooms={beds.rooms} beds={beds.beds} loading={beds.loading} refresh={beds.refresh} />
      ) : activeTab === "history" ? (
        <ProcedureHistory />
      ) : (
        <section className="admin-placeholder" role="tabpanel" aria-label={activeAdminTab.label}>
          <h1>{activeAdminTab.label}</h1>
          <p>{activeAdminTab.description}</p>
        </section>
      )}

      {beds.message ? <Toast message={beds.message} tone={beds.messageTone} onClose={beds.clearMessage} /> : null}
    </main>
  );
}

export function App() {
  const auth = useAuth();

  if (!auth.ready) {
    return <main className="auth-shell" aria-busy="true" />;
  }

  if (!auth.session && !auth.isDevelopmentFallback) {
    return <LoginScreen onSignIn={auth.signIn} />;
  }

  return <DashboardShell role={auth.role} onSignOut={auth.signOut} />;
}
