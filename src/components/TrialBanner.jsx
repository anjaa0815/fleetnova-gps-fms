import React from 'react';
import { Clock } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useT } from '../i18n/LanguageContext.jsx';

// Reminds organization users that their free trial is running out (or has ended)
export default function TrialBanner({ onNavigate }) {
  const { tr } = useT();
  const { organization, role } = useAuth();

  if (!organization || organization.plan !== 'trial' || !organization.trialEndsAt) return null;

  const msLeft = new Date(organization.trialEndsAt).getTime() - Date.now();
  const daysLeft = Math.ceil(msLeft / (24 * 60 * 60 * 1000));
  const expired = msLeft <= 0;
  if (!expired && daysLeft > 7) return null;

  return (
    <div
      style={{
        padding: '0.65rem 1rem',
        backgroundColor: expired ? 'rgba(244, 63, 94, 0.15)' : 'rgba(245, 158, 11, 0.15)',
        border: `1px solid ${expired ? 'rgba(244, 63, 94, 0.35)' : 'rgba(245, 158, 11, 0.35)'}`,
        color: expired ? '#fb7185' : '#fbbf24',
        fontSize: '0.825rem',
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        flexWrap: 'wrap'
      }}
    >
      <Clock size={16} />
      <span>
        {expired
          ? tr('Your trial has ended. The account is read-only until a plan is chosen.')
          : tr('Your trial ends in {n} day(s).', { n: daysLeft })}
      </span>
      {role === 'admin' && (
        <button
          className="btn btn-secondary btn-sm"
          style={{ marginLeft: 'auto' }}
          onClick={() => onNavigate('settings')}
        >
          {tr('View plan')}
        </button>
      )}
    </div>
  );
}
