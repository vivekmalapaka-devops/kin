const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const domain = require('../../frontend/results.js');

const localRequire = name => name === '../../frontend/results.js' ? domain : name === '../lib/api' ? { dateLabel: date => date || 'Date not available' } : require(name);
function load(name) {
  const source = fs.readFileSync(path.join(__dirname,name),'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const moduleObject = { exports: {} };
  vm.runInNewContext(compiled, { require: localRequire, exports: moduleObject.exports, module: moduleObject, console });
  return moduleObject.exports;
}
const { Overview } = load('Overview.tsx');
const { TestHistory } = load('TestHistory.tsx');
const { ReportDetail } = load('ReportDetail.tsx');
const { Reports } = load('Views.tsx');
const report = { id:'r1', member_id:'m1', collection_date:'2026-01-01', status:'confirmed', lab_name:null, created_at:'2026-01-01' };
const result = { id:'x1', report_id:'r1', source_page:1, name:'Example', raw_value:'3', unit:'mg/dL', reference_lines:['4-6'], result_type:'numeric', date:'2026-01-01' };

test('React overview renders real report counts and noteworthy values', () => {
  const html = renderToStaticMarkup(React.createElement(Overview, { reports:[report], results:[result], memberName:'Member', open(){}, navigate(){} }));
  assert.match(html, /Worth a closer look/); assert.match(html, /Example/); assert.match(html, /mg\/dL/); assert.match(html, /Above|Below/);
});
test('overview shows a prior comparable value without labelling the change as improvement', () => {
  const previous = { ...result, id:'old', report_id:'r0', raw_value:'4', date:'2025-01-01' };
  const html = renderToStaticMarkup(React.createElement(Overview, { reports:[report], results:[result,previous], memberName:'Member', open(){}, navigate(){} }));
  assert.match(html, /Previous:/); assert.match(html, /Change:/); assert.doesNotMatch(html, /improved|worsened/i);
});
test('React history renders a single numeric dot and accessible result', () => {
  const html = renderToStaticMarkup(React.createElement(TestHistory, { results:[result], open(){} }));
  assert.match(html, /history-chart/); assert.match(html, /chart-point chart-red/); assert.match(html, /One report so far/); assert.match(html, /aria-pressed="true"/);
});
test('report details offer a path to test history without altering the source report', () => {
  const html = renderToStaticMarkup(React.createElement(ReportDetail, { report, results:[result], original(){}, back(){}, viewHistory(){} }));
  assert.match(html, /View history for Example/); assert.match(html, /View original PDF/); assert.match(html, /4-6/);
});
test('report range indicator places values relative to a finite lab interval', () => {
  const html = renderToStaticMarkup(React.createElement(ReportDetail, { report, results:[result], original(){}, back(){}, viewHistory(){} }));
  assert.match(html, /class="result-range"/); assert.match(html, /marker-red/); assert.match(html, /lab range 4-6/);
  assert.equal(domain.rangePosition({ ...result, raw_value:'5' }).position, 50);
  assert.equal(domain.rangePosition({ ...result, raw_value:'100' }).clipped, true);
  assert.equal(domain.rangePosition({ ...result, reference_lines:['<4'] }), null);
  assert.equal(domain.rangePosition({ ...result, reference_lines:['4-6','7-9'] }), null);
});
test('React report list uses real records and an empty state', () => {
  assert.match(renderToStaticMarkup(React.createElement(Reports, { reports:[report], open(){}, upload(){} })), /Reviewed/);
  assert.match(renderToStaticMarkup(React.createElement(Reports, { reports:[], open(){}, upload(){} })), /No reports yet/);
});
