import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import EmptyState from './EmptyState.jsx';
import { useT } from '../i18n/LanguageContext.jsx';

export default function DataTable({
  columns = [],
  data = [],
  loading = false,
  emptyMessage = 'No records found',
  emptySubtext = 'Try clearing your filters or adding a new record',
  page = 1,
  totalPages = 1,
  totalRecords = 0,
  onPageChange
}) {
  const { tr } = useT();
  if (loading) {
    return (
      <div className="table-responsive" style={{ minHeight: '280px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}>
          <div className="spinner spinner-lg"></div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>{tr("Loading fleet records...")}</p>
        </div>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="table-responsive">
        <EmptyState title={emptyMessage} description={emptySubtext} />
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div className="table-responsive">
        <table className="data-table">
          <thead>
            <tr>
              {columns.map((col, idx) => (
                <th key={idx} style={col.width ? { width: col.width } : {}}>
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, rowIdx) => (
              <tr key={row._id || row.id || rowIdx}>
                {columns.map((col, colIdx) => (
                  <td key={colIdx}>
                    {col.render ? col.render(row) : row[col.accessor]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 0.5rem', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            {tr("Page")} <strong style={{ color: 'var(--text-primary)' }}>{page}</strong> / <strong style={{ color: 'var(--text-primary)' }}>{totalPages}</strong> ({totalRecords} {tr("records")})
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              className="btn btn-secondary btn-sm"
              disabled={page <= 1}
              onClick={() => onPageChange && onPageChange(page - 1)}
            >
              <ChevronLeft size={16} /> {tr("Previous")}
            </button>
            <button
              className="btn btn-secondary btn-sm"
              disabled={page >= totalPages}
              onClick={() => onPageChange && onPageChange(page + 1)}
            >
              {tr("Next")} <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
