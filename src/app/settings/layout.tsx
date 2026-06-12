import { SettingsTabs } from "../../components/SettingsTabs";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="page-title">Settings</h1>
        <SettingsTabs />
      </div>
      {children}
    </div>
  );
}
