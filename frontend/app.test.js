const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

class Element {
  constructor(id = '') { this.id = id; this.value = ''; this.hidden = false; this.children = []; this.listeners = {}; this.dataset = {}; this.classList = { toggle() {}, add() {}, remove() {} }; this.textContent = ''; }
  addEventListener(name, callback) { this.listeners[name] = callback; }
  append(...elements) { this.children.push(...elements); }
  setAttribute(name, value) { this[name] = String(value); }
  before() {}
  replaceChildren(...elements) { this.children = elements; this.textContent = ''; }
  removeAttribute() {}
  scrollIntoView() { this.scrolled = true; }
  focus() { this.focused = true; }
  querySelectorAll() { return []; }
}

test('signed-in dashboard uses selected profile and clears data on switching', async () => {
  const ids = ['message','login-form','email','password','member','login','workspace','logout','upload-label','reports','report-search','report-status','result-search','result-status','count-within','count-borderline','count-outside','count-unknown','latest-day','summary-caption','noteworthy','history-tests','history-search','history-detail','pdf','review','candidates','breadcrumb','file','review-form','close-review','report-date','confirm','original-pdf','original-view','detail-results','detail-date','detail-count','view-original','close-original'];
  const elements = Object.fromEntries(ids.map(id => [id, new Element(id)]));
  elements.email.value = 'user@example.invalid'; elements.password.value = 'example';
  elements['report-status'].value = 'all'; elements['result-status'].value = 'all';
  const views = ['overview', 'reports', 'history', 'report'].map(id => new Element(`${id}-view`));
  const document = { querySelector: selector => elements[selector.slice(1)], querySelectorAll: selector => selector === '.workspace-view' ? views : [], createElement: () => new Element(), createElementNS: () => new Element(), createTextNode: value => ({ textContent: value }) };
  const result = { id:'result', report_id:'report', source_page: 1, name:'Example', raw_value:'3', unit:'u', reference_lines:['4-6'], result_type:'numeric' };
  const secondResult = { ...result, id:'result-two', name:'Iron', raw_value:'5' };
  const requests = [];
  async function fetch(url) {
    requests.push(url);
    let data;
    if (url === '/config') data = { url:'https://example.invalid', key:'public' };
    else if (url.includes('/auth/v1/token')) data = { access_token:'token', refresh_token:'refresh', expires_in:3600, user:{ id:'u1' } };
    else if (url.includes('/auth/v1/user')) data = { id:'u1' };
    else if (url.includes('family_members?')) data = [{ id:'m1', user_id:'u1', display_name:'Admin' }, { id:'m2', user_id:'u2', display_name:'Member' }];
    else if (url.includes('reports?member_id=eq.m1')) data = [{ id:'report', status:'confirmed', collection_date:'2026-01-10' }];
    else if (url.includes('reports?member_id=eq.m2')) data = [];
    else if (url.includes('reports?id=eq.report')) data = [{ id:'report', status:'confirmed', collection_date:'2026-01-10', storage_path:'report/original.pdf' }];
    else if (url.includes('report_results?')) data = [result, secondResult];
    else throw new Error(`Unexpected request ${url}`);
    return { ok:true, status:200, json:async () => data };
  }
  const location = { hash:'#overview' };
  const storage = new Map();
  const sessionStorage = { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) };
  const context = vm.createContext({ document, fetch, location, sessionStorage, window:{ addEventListener() {}, scrollTo() {} }, URL, console, setTimeout() {}, KinDomain:require('./results.js') });
  vm.runInContext(fs.readFileSync(path.join(__dirname,'app.js'),'utf8'), context);
  await new Promise(resolve => setImmediate(resolve));
  await elements['login-form'].listeners.submit({ preventDefault() {} });
  assert.equal(elements['count-outside'].textContent, 1);
  assert.equal(elements['history-tests'].children[0]['aria-pressed'], 'true');
  const chart = elements['history-detail'].children.find(child => child.class === 'history-chart');
  assert.ok(chart, 'a single recorded result has a graph');
  const point = chart.children.find(child => child.class === 'chart-point chart-red');
  assert.ok(point, 'the point uses the result status');
  assert.equal(point.cx, '322');
  elements['history-tests'].children[1].listeners.click();
  assert.equal(elements['history-detail'].children[0].textContent, 'Iron');
  const nextChart = elements['history-detail'].children.find(child => child.class === 'history-chart');
  assert.ok(nextChart.children.some(child => child.class === 'chart-point chart-green'));
  assert.equal(elements['latest-day'].textContent, '10 January 2026');
  assert.equal(elements.noteworthy.children.length, 1);
  assert.equal(elements.member.value, 'm1');
  assert.ok(storage.has('kin.session'));
  await elements.noteworthy.children[0].listeners.click();
  assert.equal(location.hash, '#report');
  assert.equal(views.find(view => view.id === 'overview-view').hidden, true);
  assert.equal(views.find(view => view.id === 'report-view').hidden, false);
  assert.equal(elements['detail-results'].children.length, 2);
  assert.equal(elements['detail-results'].children[0].children[0].children[0].textContent, 'Example');
  assert.equal(elements['detail-results'].children[0].scrolled, true);
  assert.equal(elements['detail-results'].children[0].focused, true);
  elements['result-status'].value = 'unknown'; elements['result-status'].listeners.change();
  assert.equal(elements['detail-count'].textContent, '0 of 2');
  assert.equal(elements['detail-results'].children[0].textContent, 'No results match these filters.');
  elements['result-status'].value = 'red'; elements['result-status'].listeners.change();
  assert.equal(elements['detail-count'].textContent, '1 of 2');
  assert.ok(!requests.some(url => url.includes('/storage/v1/object/')));
  await elements.member.listeners.change({ target:{ value:'m2' } });
  assert.equal(elements['count-outside'].textContent, '—');
  assert.equal(elements.noteworthy.children[0].textContent, 'Your reviewed results will appear here.');
  assert.ok(requests.some(url => url.includes('member_id=eq.m2')));
  const reloaded = vm.createContext({ document, fetch, location, sessionStorage, window:{ addEventListener() {}, scrollTo() {} }, URL, console, KinDomain:require('./results.js') });
  vm.runInContext(fs.readFileSync(path.join(__dirname,'app.js'),'utf8'), reloaded);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(elements.member.value, 'm1');
  assert.equal(elements['count-outside'].textContent, 1);
  assert.ok(requests.some(url => url.includes('/auth/v1/user')));
  const expired = JSON.parse(storage.get('kin.session')); expired.expires_at = 1; storage.set('kin.session', JSON.stringify(expired));
  const expiredReload = vm.createContext({ document, fetch, location, sessionStorage, window:{ addEventListener() {}, scrollTo() {} }, URL, console, KinDomain:require('./results.js') });
  vm.runInContext(fs.readFileSync(path.join(__dirname,'app.js'),'utf8'), expiredReload);
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(requests.some(url => url.includes('grant_type=refresh_token')));
  assert.equal(elements['count-outside'].textContent, 1);
  elements.logout.listeners.click();
  assert.equal(storage.has('kin.session'), false);
});
