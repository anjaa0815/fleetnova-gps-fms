import React, { useState } from 'react';
import Sidebar from '../components/Sidebar.jsx';
import Navbar from '../components/Navbar.jsx';
import FleetAIChat from '../components/FleetAIChat.jsx';
import { Sparkles } from 'lucide-react';

export default function DashboardLayout({ currentTab, onSelectTab, currentTitle, children }) {
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

        <main className="page-body">
          {children}
        </main>
      </div>

      {/* Floating AI Assistant Trigger Button (when not on full fleet-ai page) */}
      {currentTab !== 'fleet-ai' && (
        <button
          className="floating-ai-btn"
          onClick={() => setIsAIChatOpen(!isAIChatOpen)}
          title="Open FleetAI Assistant"
          aria-label="Open FleetAI Assistant"
        >
          <Sparkles size={24} />
        </button>
      )}

      {/* Floating AI Chat Drawer */}
      {isAIChatOpen && currentTab !== 'fleet-ai' && (
        <div className="floating-chat-drawer">
          <FleetAIChat isDrawer={true} onClose={() => setIsAIChatOpen(false)} />
        </div>
      )}
    </div>
  );
}
