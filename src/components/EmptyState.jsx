import React from 'react';
import { Inbox } from 'lucide-react';

export default function EmptyState({
  title = 'No records found',
  description = 'There is currently no data available in this section.',
  actionText,
  onAction,
  icon: Icon = Inbox
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon-box">
        <Icon size={28} />
      </div>
      <h4 className="empty-title">{title}</h4>
      <p className="empty-desc">{description}</p>
      {actionText && onAction && (
        <button className="btn btn-primary btn-sm" onClick={onAction}>
          {actionText}
        </button>
      )}
    </div>
  );
}
