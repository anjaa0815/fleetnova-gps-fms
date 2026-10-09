import React from 'react';

// onIconClick: the icon becomes a button (iconTitle says what it does)
export default function StatCard({ title, value, subtext, icon: Icon, color = '#2563eb', onIconClick, iconTitle }) {
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
          {...(onIconClick
            ? { role: 'button', tabIndex: 0, title: iconTitle, 'aria-label': iconTitle, onClick: onIconClick, onKeyDown: (e) => (e.key === 'Enter' || e.key === ' ') && onIconClick() }
            : {})}
          style={{
            backgroundColor: `${color}18`,
            color: color,
            border: `1px solid ${color}30`,
            ...(onIconClick ? { cursor: 'pointer' } : {})
          }}
        >
          <Icon size={24} />
        </div>
      )}
    </div>
  );
}
