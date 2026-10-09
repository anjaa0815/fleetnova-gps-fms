import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CreditCard, Download } from 'lucide-react';
import Loading from '../components/Loading.jsx';
import { billingApi } from '../services/api.js';
import { downloadCsv } from '../utils/csv.js';
import { useT } from '../i18n/LanguageContext.jsx';

const STATUSES = ['', 'paid', 'pending', 'expired', 'cancelled'];
const STATUS_BADGE = { paid: 'completed', pending: 'in-progress', expired: 'inactive', cancelled: 'cancelled' };
const mnt = (n) => `₮${Number(n || 0).toLocaleString()}`;
const iso = (value) => (value ? new Date(value).toISOString().slice(0, 10) : '');

// Payments of every organization (platform owner): what has been paid, what is waiting
export default function PlatformInvoices() {
  const { tr } = useT();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await billingApi.platformInvoices(status ? `status=${status}` : '');
      setData(res);
      setError(null);
    } catch (err) {
      setError(tr(err.message || 'Failed to load invoices'));
    }
  }, [status, tr]);

  useEffect(() => { load(); }, [load]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data?.data || []).filter((i) => !q || String(i.organization).toLowerCase().includes(q) || String(i.senderInvoiceNo).toLowerCase().includes(q));
  }, [data, search]);

  const exportCsv = () => {
    downloadCsv(
      `CLIXGPS_INVOICES_${new Date().toISOString().slice(0, 10)}.csv`,
      [tr('Created'), tr('Organization'), tr('Plan'), tr('Months'), tr('Amount (₮)'), tr('Status'), tr('Paid'), tr('Invoice no.'), tr('Method')],
      rows.map((i) => [iso(i.createdAt), i.organization, tr(i.plan), i.months, i.amount, tr(i.status), iso(i.paidAt), i.senderInvoiceNo, i.provider === 'qpay' ? 'QPay' : tr('Simulated')])
    );
  };

  if (!data && !error) return <Loading message={tr('Loading...')} />;
  const s = data?.summary;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.35rem', fontWeight: 800 }}>{tr('Invoices')}</h2>
          <p style={{ fontSize: '0.825rem', color: 'var(--text-secondary)' }}>{tr('Payments of all organizations: what is paid and what is waiting')}</p>
        </div>
        <button className="btn btn-secondary" onClick={exportCsv} disabled={rows.length === 0}>
          <Download size={15} /> {tr('Export CSV')}
        </button>
      </div>

      {error && (
        <div style={{ padding: '0.75rem 1rem', borderRadius: 'var(--radius-md)', backgroundColor: 'rgba(244, 63, 94, 0.15)', color: '#fb7185', fontSize: '0.85rem' }}>{error}</div>
      )}

      {s && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '1rem' }}>
          {[
            [tr('Paid this month'), mnt(s.paidThisMonth)],
            [tr('Paid in total'), mnt(s.paidTotal), tr('{n} payments', { n: s.paidCount })],
            [tr('Waiting for payment'), s.pendingCount],
            [tr('Expired or cancelled'), s.expiredCount + s.cancelledCount]
          ].map(([label, value, sub]) => (
            <div key={label} className="card" style={{ padding: '1rem 1.25rem' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{label}</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--accent-cyan)' }}>{value}</div>
              {sub && <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{sub}</div>}
            </div>
          ))}
        </div>
      )}

      <div className="card">
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: '1rem' }}>
          <h3 className="card-title" style={{ marginRight: 'auto' }}>
            <CreditCard size={18} color="var(--primary)" /> {tr('Invoices')} ({rows.length})
          </h3>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">{tr('Status')}</label>
            <select className="form-control" value={status} onChange={(e) => setStatus(e.target.value)}>
              {STATUSES.map((v) => <option key={v} value={v}>{v ? tr(v) : tr('All statuses')}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">{tr('Search')}</label>
            <input className="form-control" placeholder={tr('Organization or invoice no.')} value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>

        {rows.length === 0 ? (
          <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>{tr('No invoices yet.')}</p>
        ) : (
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{tr('Created')}</th>
                  <th>{tr('Organization')}</th>
                  <th>{tr('Plan')}</th>
                  <th>{tr('Amount')}</th>
                  <th>{tr('Status')}</th>
                  <th>{tr('Paid')}</th>
                  <th>{tr('Invoice no.')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((i) => (
                  <tr key={i._id}>
                    <td>{new Date(i.createdAt).toLocaleDateString()}</td>
                    <td><strong>{i.organization || '—'}</strong></td>
                    <td>{i.plan === 'gps' ? `${tr('{n} GPS', { n: i.devices })} · ` : `${tr(i.plan)} · `}{tr('{n} month(s)', { n: i.months })}</td>
                    <td><strong>{mnt(i.amount)}</strong></td>
                    <td>
                      <span className={`badge badge-${STATUS_BADGE[i.status] || 'inactive'}`}>{tr(i.status)}</span>
                      {i.provider !== 'qpay' && <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{tr('Simulated')}</div>}
                    </td>
                    <td>{i.paidAt ? new Date(i.paidAt).toLocaleDateString() : '—'}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>{i.senderInvoiceNo}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
