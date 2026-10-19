import React, { Children, cloneElement, isValidElement, useEffect, useId, useState } from 'react';
import { flushSync } from 'react-dom';
import './PaginatedTable.css';
import { filterTableRows } from './tableSearch';

// Pagination stays in React so row inputs, selection and expand/collapse keep their state.
export default function PaginatedTable({ as: tableComponent = 'table', children, paginate = true, defaultPageSize = 10, searchable = false, searchPlaceholder = 'Search this table…', ...props }) {
  const Table = tableComponent;
  const [query, setQuery] = useState('');
  const searchId = useId();
  const [pageState, setPageState] = useState({ keys: '', page: 1 });
  const [pageSize, setPageSize] = useState(defaultPageSize);
  const [printing, setPrinting] = useState(false);
  const sections = Children.toArray(children);
  const body = sections.find(child => isValidElement(child) && child.type === 'tbody');
  const allRows = body ? Children.toArray(body.props.children).filter(isValidElement) : [];
  const rows = searchable ? filterTableRows(allRows, query) : allRows;
  const rowKeys = JSON.stringify([searchable ? query : '', rows.map(row => row.key)]);
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
  const header = sections.find(section => isValidElement(section) && section.type === 'thead');
  const headerRows = header ? Children.toArray(header.props.children).filter(isValidElement) : [];
  const columns = Math.max(1, ...headerRows.map(row => Children.toArray(row.props.children)
    .reduce((count, cell) => count + (isValidElement(cell) ? Number(cell.props.colSpan || 1) : 0), 0)));
  const displayedRows = enabled ? rows.slice(start, start + pageSize) : rows;
  const noMatches = searchable && query.trim() && rows.length === 0;
  const content = body && (enabled || searchable) ? sections.map(section => section === body
    ? cloneElement(body, {}, noMatches
      ? <tr><td colSpan={columns} className="hrms-table-no-results">No matching records. Try another search.</td></tr>
      : displayedRows) : section) : children;
  return <div className="hrms-table-frame">
    {searchable && body && !printing && <div className="hrms-table-search">
      <label htmlFor={searchId}>Search</label>
      <input id={searchId} type="search" value={query} placeholder={searchPlaceholder}
        onChange={event => setQuery(event.target.value)} />
      {query && <button type="button" onClick={() => setQuery('')}>Clear search</button>}
      <span role="status">{rows.length} of {allRows.length} records</span>
    </div>}
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
