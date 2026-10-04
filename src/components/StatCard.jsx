import React from 'react';

export default function StatCard({ title, value, subtext, icon: Icon, color = '#2563eb' }) {
  return (
    <div className="stat-card">
      <div>
        <div className="stat-label">{title}</div>
        <div className="stat-value">{value}</div>
        {subtext && <div className="stat-subtext">{subtext}</div>}
      </div>
      {Icon && (
        <div
          className="stat-icon-wrapper"
          style={{
            backgroundColor: `${color}18`,
            color: color,
            border: `1px solid ${color}30`
          }}
        >
          <Icon size={24} />
        </div>
      )}
    </div>
  );
}
