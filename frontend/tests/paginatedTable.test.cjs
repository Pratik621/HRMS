const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('node:module');
const React = require('../node_modules/react');
const { renderToStaticMarkup } = require('../node_modules/react-dom/server');
const { buildSync } = require('../node_modules/esbuild');
const bundled = buildSync({ entryPoints: [path.join(__dirname, '../src/components/Common/PaginatedTable.jsx')], bundle: true, write: false, platform: 'node', format: 'cjs', external: ['react', 'react-dom'], loader: { '.css': 'empty' } });
const runtime = new Module(path.join(__dirname, 'table-runtime.cjs'));
runtime.paths = Module._nodeModulePaths(__dirname);
runtime.filename = path.join(__dirname, 'table-runtime.cjs');
runtime._compile(bundled.outputFiles[0].text, runtime.filename);
const Table = runtime.exports.default;
const h = React.createElement;
function render(count, props = {}, grouped = false) {
  const rows = Array.from({ length: count }, (_, i) => grouped ? h(React.Fragment, { key: i },
    h('tr', { 'data-row': i }, h('td', null, i)), h('tr', { 'data-detail': i }, h('td', { colSpan: 2 }, 'Details')))
    : h('tr', { key: i, 'data-row': i }, h('td', null, h('input', { defaultValue: i })), h('td', null, 'Employee')));
  return renderToStaticMarkup(h(Table, props, h('thead', null, h('tr', null, h('th', null, 'Name'))),
    h('tbody', null, rows), h('tfoot', null, h('tr', null, h('td', null, 'Total')))));
}
test('large tables show 10 rows with navigation and row-size options', () => {
  const html = render(31);
  assert.equal((html.match(/data-row=/g) || []).length, 10);
  assert.ok(html.includes('1–10 of 31'));
  assert.ok(html.includes('Page 1 of 4'));
  assert.ok(html.includes('value="100"'));
  assert.ok(html.includes('Total'));
});
test('small and empty tables do not add unnecessary pagination', () => {
  assert.ok(!render(5).includes('<nav'));
  assert.ok(!render(0).includes('<nav'));
});
test('existing server pagination shows every supplied row without duplicate controls', () => {
  const html = render(25, { paginate: false });
  assert.equal((html.match(/data-row=/g) || []).length, 25);
  assert.ok(!html.includes('<nav'));
  assert.ok(html.includes('max-height:none'));
});
test('page size of 25 displays 25 records', () => {
  const html = render(60, { defaultPageSize: 25 });
  assert.equal((html.match(/data-row=/g) || []).length, 25);
  assert.ok(html.includes('Page 1 of 3'));
});
test('expanded row fragments stay together and inputs stay editable', () => {
  const html = render(20, {}, true);
  assert.equal((html.match(/data-row=/g) || []).length, 10);
  assert.equal((html.match(/data-detail=/g) || []).length, 10);
  assert.ok(render(20).includes('<input'));
});
