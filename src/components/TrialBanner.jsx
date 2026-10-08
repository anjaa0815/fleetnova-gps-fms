import React from 'react';
import { Clock } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useT } from '../i18n/LanguageContext.jsx';

const DAY = 24 * 60 * 60 * 1000;
const GRACE_DAYS = 3; // the server's default grace period after a paid plan ends

// Reminds organization users that the trial or the paid plan is running out (or has ended)
export default function TrialBanner({ onNavigate }) {
  const { tr } = useT();
  const { organization, role } = useAuth();
  if (!organization) return null;

  let end = null;
  let paid = false;
  if (organization.plan === 'trial' && organization.trialEndsAt) end = new Date(organization.trialEndsAt).getTime();
  else if (['basic', 'pro'].includes(organization.plan) && organization.planExpiresAt) {
    end = new Date(organization.planExpiresAt).getTime();
    paid = true;
  }
  if (end === null) return null;

  const msLeft = end - Date.now();
  const daysLeft = Math.ceil(msLeft / DAY);
  const ended = msLeft <= 0;
  const readOnly = ended && (!paid || -msLeft > GRACE_DAYS * DAY);
  if (!ended && daysLeft > 7) return null;

  let message;
  if (!paid) message = ended ? tr('Your trial has ended. The account is read-only until a plan is chosen.') : tr('Your trial ends in {n} day(s).', { n: daysLeft });
  else if (readOnly) message = tr('Your subscription has ended. The account is read-only until the plan is renewed.');
  else if (ended) message = tr('Your subscription has ended. Please renew it within {n} day(s) to keep full access.', { n: Math.max(1, GRACE_DAYS - Math.floor(-msLeft / DAY)) });
  else message = tr('Your plan ends in {n} day(s).', { n: daysLeft });

  const bad = readOnly;
  return (
    <div
      className="no-print"
      style={{
        padding: '0.65rem 1rem',
        backgroundColor: bad ? 'rgba(244, 63, 94, 0.15)' : 'rgba(245, 158, 11, 0.15)',
        border: `1px solid ${bad ? 'rgba(244, 63, 94, 0.35)' : 'rgba(245, 158, 11, 0.35)'}`,
        color: bad ? '#fb7185' : '#fbbf24',
        fontSize: '0.825rem',
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        flexWrap: 'wrap'
      }}
    >
      <Clock size={16} />
      <span>{message}</span>
      {role === 'admin' && (
        <button className="btn btn-secondary btn-sm" style={{ marginLeft: 'auto' }} onClick={() => onNavigate('billing')}>
          {paid ? tr('Renew plan') : tr('Choose a plan')}
        </button>
      )}
    </div>
  );
}
