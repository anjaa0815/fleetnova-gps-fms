import React from 'react';
import FleetAIChat from '../components/FleetAIChat.jsx';
import { Sparkles, Bot, ShieldCheck, Database, Zap } from 'lucide-react';

export default function FleetAI() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', height: 'calc(100vh - 120px)' }}>
      {/* Informational Sub-header */}
      <div
        style={{
          padding: '0.85rem 1.25rem',
          borderRadius: 'var(--radius-lg)',
          backgroundColor: 'rgba(37, 99, 235, 0.1)',
          border: '1px solid rgba(37, 99, 235, 0.25)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '0.75rem'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div
            style={{
              width: '32px',
              height: '32px',
              borderRadius: 'var(--radius-md)',
              background: 'linear-gradient(135deg, #2563eb, #06b6d4)',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <Sparkles size={18} />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)' }}>
              FleetAI Intelligent Fleet Assistant — Google Gemini 3.8
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              Live read-only analysis directly grounded in your MongoDB fleet database.
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '1rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            <Database size={13} color="var(--accent-cyan)" /> Live DB Telemetry
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            <ShieldCheck size={13} color="var(--accent-emerald)" /> Zero Key Exposure
          </span>
        </div>
      </div>

      {/* Main Full-Height Chat Component */}
      <div style={{ flex: 1, minHeight: 0 }}>
        <FleetAIChat isDrawer={false} />
      </div>
    </div>
  );
}
