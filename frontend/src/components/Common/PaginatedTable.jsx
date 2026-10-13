import React, { Children, cloneElement, isValidElement, useEffect, useState } from 'react';
import { flushSync } from 'react-dom';
import './PaginatedTable.css';

// Pagination stays in React so row inputs, selection and expand/collapse keep their state.
export default function PaginatedTable({ as: tableComponent = 'table', children, paginate = true, defaultPageSize = 10, ...props }) {
  const Table = tableComponent;
  const [pageState, setPageState] = useState({ keys: '', page: 1 });
  const [pageSize, setPageSize] = useState(defaultPageSize);
  const [printing, setPrinting] = useState(false);
  const sections = Children.toArray(children);
  const body = sections.find(child => isValidElement(child) && child.type === 'tbody');
  const rows = body ? Children.toArray(body.props.children).filter(isValidElement) : [];
  const rowKeys = rows.map(row => row.key).join('|');
  const page = pageState.keys === rowKeys ? pageState.page : 1;
  const setPage = value => setPageState({ keys: rowKeys, page: value });
  useEffect(() => {
    const before = () => flushSync(() => setPrinting(true)), after = () => setPrinting(false);
    window.addEventListener('beforeprint', before);
    window.addEventListener('afterprint', after);
    return () => { window.removeEventListener('beforeprint', before); window.removeEventListener('afterprint', after); };
  }, []);
  const enabled = paginate && !!body && !printing;
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const current = Math.min(page, pages);
  const start = (current - 1) * pageSize;
  const content = enabled ? sections.map(section => section === body
    ? cloneElement(body, {}, rows.slice(start, start + pageSize)) : section) : children;
  return <div className="hrms-table-frame">
    <div className="hrms-table-scroll" style={paginate ? undefined : { maxHeight: 'none' }} tabIndex={0} role="region" aria-label="Scrollable table">
      <Table {...props}>{content}</Table>
    </div>
    {enabled && rows.length > defaultPageSize && <nav className="hrms-table-pagination" aria-label="Table pagination">
      <label>Rows per page <select value={pageSize} onChange={event => { setPageSize(Number(event.target.value)); setPage(1); }}>
        {[10, 25, 50, 100].map(size => <option key={size} value={size}>{size}</option>)}
      </select></label>
      <span>{start + 1}–{Math.min(start + pageSize, rows.length)} of {rows.length}</span>
      <div className="hrms-table-page-buttons">
        <button type="button" aria-label="First page" disabled={current === 1} onClick={() => setPage(1)}>«</button>
        <button type="button" disabled={current === 1} onClick={() => setPage(current - 1)}>Previous</button>
        <span>Page {current} of {pages}</span>
        <button type="button" disabled={current === pages} onClick={() => setPage(current + 1)}>Next</button>
        <button type="button" aria-label="Last page" disabled={current === pages} onClick={() => setPage(pages)}>»</button>
      </div>
    </nav>}
  </div>;
}
