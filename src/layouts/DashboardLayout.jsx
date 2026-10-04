import React, { useState } from 'react';
import Sidebar from '../components/Sidebar.jsx';
import Navbar from '../components/Navbar.jsx';
import FleetAIChat from '../components/FleetAIChat.jsx';
import TrialBanner from '../components/TrialBanner.jsx';
import { Sparkles } from 'lucide-react';
import { useT } from '../i18n/LanguageContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';

export default function DashboardLayout({ currentTab, onSelectTab, currentTitle, children }) {
  const { tr } = useT();
  const { role } = useAuth();
  const showAI = role !== 'super_admin';
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isAIChatOpen, setIsAIChatOpen] = useState(false);

  return (
    <div className="app-container">
      {/* Sidebar */}
      <Sidebar
        currentTab={currentTab}
        onSelectTab={onSelectTab}
        isMobileOpen={isMobileOpen}
        onCloseMobile={() => setIsMobileOpen(false)}
      />

      {/* Main Content Area */}
      <div className="main-content-wrapper">
        <Navbar
          currentTitle={currentTitle}
          onToggleMobile={() => setIsMobileOpen(!isMobileOpen)}
          onNavigate={onSelectTab}
          onOpenFleetAI={() => setIsAIChatOpen(true)}
        />

        <TrialBanner onNavigate={onSelectTab} />

        <main className="page-body">
          {children}
        </main>
      </div>

      {/* Floating AI Assistant Trigger Button (when not on full fleet-ai page) */}
      {showAI && currentTab !== 'fleet-ai' && (
        <button
          className="floating-ai-btn"
          onClick={() => setIsAIChatOpen(!isAIChatOpen)}
          title={tr("Open FleetAI Assistant")}
          aria-label={tr("Open FleetAI Assistant")}
        >
          <Sparkles size={24} />
        </button>
      )}

      {/* Floating AI Chat Drawer */}
      {showAI && isAIChatOpen && currentTab !== 'fleet-ai' && (
        <div className="floating-chat-drawer">
          <FleetAIChat isDrawer={true} onClose={() => setIsAIChatOpen(false)} />
        </div>
      )}
    </div>
  );
}
