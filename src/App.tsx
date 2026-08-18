import { useEffect } from "react";
import { Routes, Route } from "react-router-dom";
import Layout from "@/components/Layout";
import Dashboard from "@/pages/Dashboard";
import WebDashboard from "@/pages/WebDashboard";
import SkillList from "@/pages/SkillList";
import SkillDetail from "@/pages/SkillDetail";
import Settings from "@/pages/Settings";
import ErrorLog from "@/pages/ErrorLog";
import ConflictResolution from "@/pages/ConflictResolution";
import { useSettingsStore } from "@/store/settingsStore";
import { IS_TAURI } from "@/lib/runtime";

function App() {
  const { loaded, loadSettings } = useSettingsStore();

  useEffect(() => {
    if (!loaded) loadSettings();
  }, [loaded, loadSettings]);

  return (
    <Layout>
      <Routes>
        <Route path="/" element={IS_TAURI ? <Dashboard /> : <WebDashboard />} />
        <Route path="/skills" element={<SkillList />} />
        <Route path="/skills/:id" element={<SkillDetail />} />
        {IS_TAURI && <Route path="/settings" element={<Settings />} />}
        {IS_TAURI && <Route path="/error-log" element={<ErrorLog />} />}
        {IS_TAURI && <Route path="/onboarding" element={<Dashboard />} />}
        {IS_TAURI && <Route path="/conflicts" element={<ConflictResolution />} />}
      </Routes>
    </Layout>
  );
}

export default App;
