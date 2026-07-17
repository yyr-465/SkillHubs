import { useEffect } from "react";
import { Routes, Route } from "react-router-dom";
import Layout from "@/components/Layout";
import Dashboard from "@/pages/Dashboard";
import SkillList from "@/pages/SkillList";
import SkillDetail from "@/pages/SkillDetail";
import Settings from "@/pages/Settings";
import ErrorLog from "@/pages/ErrorLog";
import ConflictResolution from "@/pages/ConflictResolution";
import { useSettingsStore } from "@/store/settingsStore";

function App() {
  const { loaded, loadSettings } = useSettingsStore();

  useEffect(() => {
    if (!loaded) loadSettings();
  }, [loaded, loadSettings]);

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/skills" element={<SkillList />} />
        <Route path="/skills/:id" element={<SkillDetail />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/error-log" element={<ErrorLog />} />
        <Route path="/onboarding" element={<Dashboard />} />
        <Route path="/conflicts" element={<ConflictResolution />} />
      </Routes>
    </Layout>
  );
}

export default App;
