let config, token, members = [], selected, selectedHistory, currentReport, pdfUrl, originalUrl, currentSource, historyRows = [], reportRows = [], detailRows = [], requestVersion = 0, reportRequest = 0;
let refreshToken, expiresAt = 0, refreshPromise;
const SESSION_KEY = 'kin.session';
const $ = selector => document.querySelector(selector);
const message = text => { $('#message').textContent = text; };
document.querySelectorAll('label[for="file"]').forEach(label => label.addEventListener('keydown', event => {
  if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); $('#file').click(); }
}));
const addResult = document.createElement('button');
addResult.type = 'button'; addResult.className = 'outline-button add-result'; addResult.textContent = '＋ Add a missing result';
$('#confirm').before(addResult);
addResult.addEventListener('click', () => {
  const section = document.createElement('section'); section.className = 'candidate'; section.dataset.manual = 'true';
  const title = document.createElement('div'); title.className = 'candidate-heading'; title.textContent = 'MANUALLY ADDED RESULT';
  const page = input('SOURCE PAGE', ''); page.querySelector('input').type = 'number'; page.querySelector('input').min = '1'; page.querySelector('input').required = true;
  const typeLabel = document.createElement('label'); typeLabel.textContent = 'RESULT TYPE';
  const type = document.createElement('select'); type.className = 'manual-type';
  for (const value of ['numeric', 'qualitative']) { const option = document.createElement('option'); option.value = value; option.textContent = value === 'numeric' ? 'Numeric' : 'Text'; type.append(option); }
  typeLabel.append(type);
  const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'text-link remove-result'; remove.textContent = 'Remove added result'; remove.addEventListener('click', () => section.remove());
  section.append(title, input('TEST', ''), input('RESULT', ''), input('UNIT', ''), input('REFERENCE TEXT', '', true), page, typeLabel, remove);
  section.querySelectorAll('input')[0].required = true; section.querySelectorAll('input')[1].required = true;
  $('#candidates').append(section);
});
async function call(path, options = {}, auth = true) {
  if (auth) await ensureSession();
  const headers = { apikey: config.key, ...(auth && token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers };
  const response = await fetch(config.url + path, { ...options, headers });
  if (!response.ok) throw new Error('Request failed. Check your sign-in or try again.');
  return response.status === 204 ? null : response.json();
}
async function local(path, options = {}) {
  await ensureSession();
  const response = await fetch(path, { ...options, headers: { Authorization: `Bearer ${token}`, ...options.headers } });
  if (!response.ok) { let error; try { error = (await response.json()).error; } catch {} throw new Error(error || 'Request failed.'); }
  return response.json();
}
function saveSession(session) {
  token = session.access_token; refreshToken = session.refresh_token;
  expiresAt = session.expires_at || Math.floor(Date.now() / 1000) + (session.expires_in || 3600);
  try { sessionStorage.setItem(SESSION_KEY, JSON.stringify({ access_token: token, refresh_token: refreshToken, expires_at: expiresAt })); } catch { /* Sign-in still works for this page. */ }
}
function forgetSession() {
  token = null; refreshToken = null; expiresAt = 0;
  try { sessionStorage.removeItem(SESSION_KEY); } catch { /* Storage may be unavailable. */ }
}
async function ensureSession() {
  if (!token) throw new Error('Please sign in again.');
  if (expiresAt > Math.floor(Date.now() / 1000) + 60) return;
  if (!refreshToken) { forgetSession(); throw new Error('Your session expired. Please sign in again.'); }
  if (!refreshPromise) {
    const oldRefreshToken = refreshToken;
    refreshPromise = (async () => {
      const response = await fetch(`${config.url}/auth/v1/token?grant_type=refresh_token`, { method: 'POST', headers: { apikey: config.key, 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: oldRefreshToken }) });
      if (!response.ok) { forgetSession(); throw new Error('Your session expired. Please sign in again.'); }
      const session = await response.json();
      // A sign-out during refresh must not restore the session.
      if (refreshToken !== oldRefreshToken) throw new Error('Please sign in again.');
      saveSession(session);
    })().finally(() => { refreshPromise = null; });
  }
  await refreshPromise;
}
function clearReview() {
  if (pdfUrl) URL.revokeObjectURL(pdfUrl);
  pdfUrl = null; currentReport = null; $('#pdf').removeAttribute('src'); $('#review').hidden = true; $('#candidates').replaceChildren();
}
function clearOriginal() {
  if (originalUrl) URL.revokeObjectURL(originalUrl);
  originalUrl = null; currentSource = null; $('#original-pdf').removeAttribute('src'); $('#original-view').hidden = true;
}
function formatDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return 'Date not available';
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? 'Date not available' : new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(date);
}
function input(label, value, multiline = false) {
  const wrapper = document.createElement('label'); wrapper.textContent = label;
  const el = document.createElement(multiline ? 'textarea' : 'input'); el.value = value || ''; wrapper.append(el); return wrapper;
}
const { rangeLabel, resultStatus, summarize, trend, filterReports, filterResults } = KinDomain;
function showView() {
  const view = ['overview', 'reports', 'history', 'report', 'review'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'overview';
  document.querySelectorAll('.workspace-view').forEach(el => { el.hidden = el.id !== `${view}-view`; });
  document.querySelectorAll('[data-view]').forEach(el => el.classList.toggle('active', el.dataset.view === (view === 'report' || view === 'review' ? 'reports' : view)));
  $('#breadcrumb').textContent = view === 'report' ? 'REPORT DETAILS' : view === 'review' ? 'REVIEW REPORT' : view.toUpperCase();
  if (view !== 'review') clearReview();
  if (view !== 'report') clearOriginal();
}
window.addEventListener('hashchange', () => {
  if (['overview', 'reports', 'history'].includes(location.hash.slice(1))) reportRequest++;
  showView();
});
function renderDashboard(confirmed, results) {
  const summary = summarize(results), available = confirmed.length > 0;
  $('#count-within').textContent = available ? summary.within : '—';
  $('#count-borderline').textContent = available ? summary.borderline : '—';
  $('#count-outside').textContent = available ? summary.outside : '—';
  $('#count-unknown').textContent = available ? summary.unknown : '—';
  $('#latest-day').textContent = available ? formatDate(confirmed[0].collection_date) : 'No reviewed reports yet';
  $('#summary-caption').textContent = available ? `From the report collected on ${formatDate(confirmed[0].collection_date)}.` : 'Review a report to see a summary here.';
  const target = $('#noteworthy'); target.replaceChildren();
  const flagged = results.filter(result => ['red', 'amber'].includes(resultStatus(result).severity));
  if (!flagged.length) { const p = document.createElement('p'); p.className = 'empty-copy'; p.textContent = available ? 'No high, low, or borderline results identified. Check any unclassified lab references.' : 'Your reviewed results will appear here.'; target.append(p); }
  for (const result of flagged) {
    const row = document.createElement('button'); row.type = 'button'; row.className = 'compact-result noteworthy-row';
    const info = document.createElement('span'), name = document.createElement('strong'), detail = document.createElement('small');
    const status = resultStatus(result);
    name.textContent = result.name; detail.textContent = status.label; detail.className = `result-label-${status.severity}`; info.append(name, detail);
    const value = document.createElement('span'); value.className = 'compact-value'; value.textContent = `${result.raw_value} ${result.unit || ''}`;
    row.append(info, value); row.addEventListener('click', () => openReport(confirmed[0].id, result.id)); target.append(row);
  }
}
function renderHistoryList() {
  const target = $('#history-tests'); target.replaceChildren();
  const term = $('#history-search').value.toLowerCase();
  const names = [...new Set(historyRows.map(row => row.name))].filter(name => name.toLowerCase().includes(term)).sort((a,b) => a.localeCompare(b));
  if (!names.length) { selectedHistory = null; const p = document.createElement('p'); p.textContent = historyRows.length ? 'No matching tests.' : 'Review a report to see test history.'; target.append(p); const detail = $('#history-detail'); detail.replaceChildren(); const prompt = document.createElement('p'); prompt.className = 'section-description'; prompt.textContent = historyRows.length ? 'Try another search.' : 'Reviewed results will appear here.'; detail.append(prompt); return; }
  if (!names.includes(selectedHistory)) selectedHistory = names[0];
  names.forEach(name => { const button = document.createElement('button'); button.type = 'button'; button.className = 'test-choice'; button.textContent = name; button.setAttribute('aria-pressed', String(name === selectedHistory)); button.addEventListener('click', () => { selectedHistory = name; renderHistoryList(); }); target.append(button); });
  renderHistoryDetail(selectedHistory);
}
function renderHistoryDetail(name) {
  const target = $('#history-detail'); target.replaceChildren();
  const heading = document.createElement('h2'); heading.textContent = name; target.append(heading);
  const note = document.createElement('p'); note.className = 'section-description'; note.textContent = 'Each dot reflects that report’s lab range. Check units and test methods before comparing.'; target.append(note);
  const testRows = historyRows.filter(row => row.name === name);
  const series = trend(testRows);
  if (series) {
    const chart = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); chart.setAttribute('viewBox', '0 0 600 220'); chart.setAttribute('class', 'history-chart'); chart.setAttribute('role', 'img'); chart.setAttribute('aria-label', `Results over time for ${name}. Exact values and statuses are listed below.`);
    const svg = (tag, attributes) => { const element = document.createElementNS('http://www.w3.org/2000/svg', tag); for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value); return element; };
    const values = series.map(point => point.value), min = Math.min(...values), max = Math.max(...values), pad = min === max ? Math.max(Math.abs(min) * .1, .01) : (max - min) * .15, low = min - pad, high = max + pad;
    const times = series.map(point => Date.parse(`${point.date}T00:00:00Z`)), duration = times[times.length - 1] - times[0];
    const points = series.map((point, index) => ({ ...point, x: duration ? 72 + (times[index] - times[0]) * 500 / duration : 322, y: 172 - (point.value - low) * 140 / (high - low) }));
    for (let i = 0; i < 3; i++) { const y = 32 + i * 70, number = high - i * (high - low) / 2; chart.append(svg('line', { x1:72, y1:y, x2:572, y2:y, class:'chart-grid-line' })); const label = svg('text', { x:62, y:y+4, 'text-anchor':'end', class:'chart-axis' }); label.textContent = Number(number.toPrecision(4)).toString(); chart.append(label); }
    const distinctDates = new Set(series.map(point => point.date)).size === series.length;
    if (distinctDates) for (let i = 1; i < points.length; i++) { const before = points[i-1], after = points[i]; chart.append(svg('line', { x1:before.x, y1:before.y, x2:after.x, y2:after.y, class:`chart-line ${before.severity === after.severity ? `chart-${after.severity}` : 'chart-mixed'}` })); }
    for (const point of points) { const circle = svg('circle', { cx:point.x, cy:point.y, r:6, class:`chart-point chart-${point.severity}` }); const title = svg('title', {}); title.textContent = `${formatDate(point.date)}: ${point.value} ${point.unit} — ${point.label}`; circle.append(title); chart.append(circle); }
    const firstDate = svg('text', { x:duration ? 72 : 322, y:205, 'text-anchor':duration ? 'start' : 'middle', class:'chart-axis' }); firstDate.textContent = formatDate(series[0].date); chart.append(firstDate);
    if (duration) { const lastDate = svg('text', { x:572, y:205, 'text-anchor':'end', class:'chart-axis' }); lastDate.textContent = formatDate(series[series.length - 1].date); chart.append(lastDate); }
    const unit = document.createElement('p'); unit.className = 'chart-limits'; unit.textContent = `Value (${series[0].unit}) · ${series.length === 1 ? 'One report so far' : distinctDates ? 'Connecting lines show sequence, not results between dates.' : 'Some results share a date, so points are shown without connecting lines.'}`; target.append(chart, unit);
    const legend = document.createElement('div'); legend.className = 'history-legend'; for (const [kind, label] of [['green','Within range'],['amber','Near limit / borderline'],['red','Outside range'],['unknown','See lab reference']]) { const item = document.createElement('span'), dot = document.createElement('i'); dot.className = `legend-${kind}`; item.append(dot, document.createTextNode(label)); legend.append(item); } target.append(legend);
    if (testRows.some(row => row.result_type !== 'numeric')) { const textNote = document.createElement('p'); textNote.className = 'empty-copy'; textNote.textContent = 'Text results are listed below and are not plotted.'; target.append(textNote); }
  } else { const reason = document.createElement('p'); reason.className = 'empty-copy'; reason.textContent = testRows.some(row => row.result_type === 'numeric') ? 'A graph is unavailable when numeric results have different or missing units or values. All results are listed below.' : 'Text results are listed below; they are not plotted on a graph.'; target.append(reason); }
  testRows.sort((a,b) => b.date.localeCompare(a.date)).forEach(row => {
    const entry = document.createElement('div'); entry.className = 'history-entry';
    const date = document.createElement('span'); date.textContent = row.date;
    const value = document.createElement('strong'); value.textContent = `${row.raw_value} ${row.unit || ''}`;
    const range = document.createElement('small'); range.textContent = `${resultStatus(row).label} · ${row.reference_lines.join('; ') || 'No reference range'}`;
    const open = document.createElement('button'); open.type = 'button'; open.className = 'text-link'; open.textContent = 'View report ↗'; open.addEventListener('click', () => openReport(row.report_id, row.id));
    entry.append(date, value, range, open); target.append(entry);
  });
}
$('#history-search').addEventListener('input', renderHistoryList);
function renderReportList() {
  const list = $('#reports'); list.replaceChildren();
  const filtered = filterReports(reportRows, $('#report-search').value, $('#report-status').value);
  if (!filtered.length) { const empty = document.createElement('p'); empty.className = 'empty-copy filter-empty'; empty.textContent = reportRows.length ? 'No reports match these filters.' : 'No reports yet. Upload a PDF to get started.'; list.append(empty); return; }
  const labels = { confirmed: 'Reviewed', needs_review: 'Needs review', processing: 'Processing', pending: 'Pending', failed: 'Failed' };
  for (const report of filtered) {
    const row = document.createElement('button'); row.className = 'report-row'; row.type = 'button';
    const info = document.createElement('span'); info.className = 'report-info';
    const title = document.createElement('strong'); title.textContent = report.collection_date ? formatDate(report.collection_date) : 'Date needs review';
    const sub = document.createElement('small'); sub.textContent = `${labels[report.status] || 'Status unavailable'}${report.lab_name ? ` · ${report.lab_name}` : ''}`;
    info.append(title, sub); row.append(info); row.addEventListener('click', () => openReport(report.id)); list.append(row);
  }
}
function renderDetailResults() {
  const list = $('#detail-results'); list.replaceChildren();
  const filtered = filterResults(detailRows, $('#result-search').value, $('#result-status').value);
  $('#detail-count').textContent = filtered.length === detailRows.length ? detailRows.length : `${filtered.length} of ${detailRows.length}`;
  if (!filtered.length) { const empty = document.createElement('p'); empty.className = 'empty-copy filter-empty'; empty.textContent = detailRows.length ? 'No results match these filters.' : 'No results were saved for this report.'; list.append(empty); return; }
  for (const result of filtered) {
    const row = document.createElement('div'); row.className = 'detail-result';
    row.dataset.resultId = result.id;
    row.tabIndex = -1;
    const test = document.createElement('span'), name = document.createElement('strong'), page = document.createElement('small');
    name.textContent = result.name; page.textContent = `Page ${result.source_page}`; test.append(name, page);
    const measurement = document.createElement('span'), value = document.createElement('strong'), range = document.createElement('small');
    value.textContent = `${result.raw_value}${result.unit ? ` ${result.unit}` : ''}`;
    range.className = 'reference-lines';
    if (result.reference_lines.length) {
      for (const line of result.reference_lines) { const item = document.createElement('span'); item.textContent = line; range.append(item); }
    } else range.textContent = 'No reference range provided';
    measurement.append(value, range);
    const detail = resultStatus(result), statusColumn = document.createElement('span'), status = document.createElement('span');
    statusColumn.className = 'result-status';
    status.className = `pill ${detail.severity === 'green' ? 'green-pill' : detail.severity === 'red' ? 'red-pill' : detail.severity === 'amber' ? 'amber-pill' : 'neutral-pill'}`;
    status.textContent = detail.label.toUpperCase(); statusColumn.append(status);
    if (detail.note) { const note = document.createElement('small'); note.className = 'status-note'; note.textContent = detail.note; statusColumn.append(note); }
    row.append(test, measurement, statusColumn); list.append(row);
  }
}
$('#report-search').addEventListener('input', renderReportList);
$('#report-status').addEventListener('change', renderReportList);
$('#result-search').addEventListener('input', renderDetailResults);
$('#result-status').addEventListener('change', renderDetailResults);
async function loadReports() {
  const version = ++requestVersion;
  reportRequest++; clearReview(); clearOriginal(); $('#detail-results').replaceChildren();
  reportRows = []; detailRows = []; $('#reports').replaceChildren();
  selectedHistory = null; historyRows = []; renderHistoryList(); renderDashboard([], []);
  if (!selected) { message('No family profile is assigned to this account.'); return; }
  const reports = await call(`/rest/v1/reports?member_id=eq.${encodeURIComponent(selected)}&select=id,collection_date,lab_name,status,created_at&order=created_at.desc`);
  if (version !== requestVersion) return;
  reportRows = reports; renderReportList();
  if (!reports.length) { message('No reports yet. Upload a selectable-text PDF to get started.'); return; }
  message('');
  const confirmed = reports.filter(report => report.status === 'confirmed' && report.collection_date).sort((a,b) => b.collection_date.localeCompare(a.collection_date));
  const all = await Promise.all(confirmed.map(async report => (await call(`/rest/v1/report_results?report_id=eq.${encodeURIComponent(report.id)}&select=id,report_id,name,raw_value,unit,reference_lines,result_type`)).map(row => ({ ...row, date: report.collection_date }))));
  if (version !== requestVersion) return;
  historyRows = all.flat(); renderHistoryList(); renderDashboard(confirmed, all[0] || []);
}
async function openReport(id, focusResultId = null) {
  const version = requestVersion, operation = ++reportRequest;
  try {
    clearReview(); clearOriginal(); message('Opening report…');
    const reports = await call(`/rest/v1/reports?id=eq.${encodeURIComponent(id)}&select=id,collection_date,status,storage_path,extraction_method`);
    if (!reports.length) throw new Error('Report not available.');
    const report = reports[0];
    const results = await call(`/rest/v1/report_results?report_id=eq.${encodeURIComponent(id)}&select=id,source_page,name,raw_value,unit,reference_lines,result_type&order=source_page`);
    if (version !== requestVersion || operation !== reportRequest) return;
    if (report.status === 'confirmed') {
      $('#detail-date').textContent = formatDate(report.collection_date);
      detailRows = results; $('#result-search').value = ''; $('#result-status').value = 'all'; renderDetailResults();
      currentSource = { path: report.storage_path, reportId: id };
      location.hash = '#report'; showView();
      message('');
      if (focusResultId) {
        const row = [...$('#detail-results').children].find(item => item.dataset.resultId === focusResultId);
        if (row) { row.classList.add('result-highlight'); row.focus({ preventScroll: true }); row.scrollIntoView({ behavior: 'smooth', block: 'center' }); setTimeout(() => row.classList.remove('result-highlight'), 2500); }
        else window.scrollTo(0, 0);
      } else window.scrollTo(0, 0);
      return;
    }
    let previous = [];
    if (report.status === 'confirmed' && report.collection_date) {
      const earlier = await call(`/rest/v1/reports?member_id=eq.${encodeURIComponent(selected)}&status=eq.confirmed&collection_date=lt.${encodeURIComponent(report.collection_date)}&select=id,collection_date&order=collection_date.desc`);
      if (earlier.length) {
        const prior = await call(`/rest/v1/report_results?report_id=eq.${encodeURIComponent(earlier[0].id)}&select=name,raw_value,unit,result_type`);
        previous = prior.map(item => ({ ...item, date: earlier[0].collection_date }));
      }
    }
    const pdf = await fetch(`${config.url}/storage/v1/object/authenticated/blood-reports/${report.storage_path.split('/').map(encodeURIComponent).join('/')}`, { headers: { apikey: config.key, Authorization: `Bearer ${token}` } });
    if (!pdf.ok) throw new Error('Could not open the original PDF.');
    const blob = await pdf.blob();
    if (version !== requestVersion || operation !== reportRequest) return;
    pdfUrl = URL.createObjectURL(blob); $('#pdf').src = pdfUrl;
    $('#report-date').value = report.collection_date || '';
    $('#report-date').disabled = report.status === 'confirmed';
    $('#confirm').hidden = report.status === 'confirmed';
    addResult.hidden = report.status === 'confirmed';
    for (const result of results) {
      const section = document.createElement('section'); section.className = 'candidate'; section.dataset.id = result.id;
      const title = document.createElement('div'); title.className = 'candidate-heading'; title.textContent = `PAGE ${result.source_page} · ${result.result_type.toUpperCase()}${report.status === 'confirmed' ? ` · ${resultStatus(result).label.toUpperCase()}` : ''}`;
      section.append(title, input('TEST', result.name), input('RESULT', result.raw_value), input('UNIT', result.unit), input('REFERENCE TEXT', result.reference_lines.join('\n'), true));
      const match = previous.filter(item => item.name === result.name && item.unit === result.unit && item.result_type === 'numeric' && result.result_type === 'numeric');
      if (match.length === 1 && /^\d+(?:\.\d+)?$/.test(result.raw_value) && /^\d+(?:\.\d+)?$/.test(match[0].raw_value)) {
        const change = Number(result.raw_value) - Number(match[0].raw_value);
        const note = document.createElement('p'); note.className = 'comparison-note'; note.textContent = `Previous (${match[0].date}): ${match[0].raw_value} ${result.unit || ''} · Change: ${change > 0 ? '+' : ''}${Number(change.toPrecision(6))} ${result.unit || ''}. Check test methods before comparing.`; section.append(note);
      }
      if (report.status === 'confirmed') section.querySelectorAll('input,textarea').forEach(el => { el.disabled = true; });
      $('#candidates').append(section);
    }
    currentReport = id; location.hash = '#review'; showView(); $('#review').hidden = false; message(report.extraction_method && report.extraction_method.includes('ocr') ? 'OCR was used. Carefully check every value, unit and reference range against the original.' : ''); window.scrollTo(0, 0);
  } catch (error) { if (version === requestVersion && operation === reportRequest) message(error.message); }
}
$('#view-original').addEventListener('click', async () => {
  const source = currentSource;
  if (!source?.path) { message('The original PDF is not available.'); return; }
  try {
    message('Opening original PDF…');
    const response = await fetch(`${config.url}/storage/v1/object/authenticated/blood-reports/${source.path.split('/').map(encodeURIComponent).join('/')}`, { headers: { apikey: config.key, Authorization: `Bearer ${token}` } });
    if (!response.ok) throw new Error('Could not open the original PDF.');
    const blob = await response.blob();
    if (source !== currentSource) return;
    if (originalUrl) URL.revokeObjectURL(originalUrl);
    originalUrl = URL.createObjectURL(blob); $('#original-pdf').src = originalUrl; $('#original-view').hidden = false; message(''); $('#original-view').scrollIntoView({ behavior: 'smooth' });
  } catch (error) { if (source === currentSource) message(error.message); }
});
$('#close-original').addEventListener('click', () => { if (originalUrl) URL.revokeObjectURL(originalUrl); originalUrl = null; $('#original-pdf').removeAttribute('src'); $('#original-view').hidden = true; });
async function openWorkspace(user) {
  members = await call('/rest/v1/family_members?select=id,user_id,display_name,role&order=display_name');
  const select = $('#member'); select.replaceChildren();
  for (const member of members) { const option = document.createElement('option'); option.value = member.id; option.textContent = member.display_name; select.append(option); }
  selected = members.find(member => member.user_id === user.id)?.id || members[0]?.id; select.value = selected || '';
  select.hidden = !members.length; $('#login').hidden = true; $('#workspace').hidden = false; $('#logout').hidden = false; $('#upload-label').hidden = !members.length;
  if (['#report', '#review'].includes(location.hash)) location.hash = '#overview';
  showView(); await loadReports();
}
$('#login-form').addEventListener('submit', async event => {
  event.preventDefault(); message('Signing in…');
  try {
    const session = await call('/auth/v1/token?grant_type=password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: $('#email').value, password: $('#password').value }) }, false);
    saveSession(session); $('#password').value = '';
    await openWorkspace(session.user);
  } catch (error) { forgetSession(); message(error.message); }
});
$('#member').addEventListener('change', async event => { selected = event.target.value; $('#report-search').value = ''; $('#report-status').value = 'all'; location.hash = '#overview'; showView(); try { await loadReports(); } catch (error) { message(error.message); } });
$('#file').addEventListener('change', async event => {
  const file = event.target.files[0]; if (!file || !selected) return;
  const memberId = selected, version = requestVersion;
  message('Reading the report… Scanned pages may take a few minutes.');
  try { const result = await local('/reports', { method: 'POST', headers: { 'Content-Type': 'application/pdf', 'X-Member-Id': memberId }, body: file }); if (version !== requestVersion) return; await loadReports(); await openReport(result.id); }
  catch (error) { if (version === requestVersion) message(error.message); } finally { event.target.value = ''; }
});
$('#review-form').addEventListener('submit', async event => {
  event.preventDefault();
  const results = [...document.querySelectorAll('.candidate')].map(section => { const [name, value, unit, reference, page] = section.querySelectorAll('input,textarea'); return { id: section.dataset.id || null, name: name.value, raw_value: value.value, unit: unit.value || null, reference_lines: reference.value ? reference.value.split('\n') : [], ...(section.dataset.manual ? { source_page: Number(page.value), result_type: section.querySelector('.manual-type').value } : {}) }; });
  try { await local('/confirm', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ report_id: currentReport, date: $('#report-date').value, results }) }); location.hash = '#reports'; showView(); await loadReports(); message('Report confirmed.'); } catch (error) { message(error.message); }
});
$('#close-review').addEventListener('click', () => { clearReview(); location.hash = '#reports'; showView(); });
$('#logout').addEventListener('click', () => { const signedOutToken = token; requestVersion++; reportRequest++; forgetSession(); members = []; selected = null; historyRows = []; reportRows = []; detailRows = []; $('#report-search').value = ''; $('#report-status').value = 'all'; $('#result-search').value = ''; $('#result-status').value = 'all'; clearReview(); clearOriginal(); $('#detail-results').replaceChildren(); $('#reports').replaceChildren(); $('#history-tests').replaceChildren(); $('#history-detail').replaceChildren(); renderDashboard([], []); $('#workspace').hidden = true; $('#member').hidden = true; $('#logout').hidden = true; $('#upload-label').hidden = true; $('#login').hidden = false; message('Signed out.'); if (signedOutToken) fetch(`${config.url}/auth/v1/logout`, { method: 'POST', headers: { apikey: config.key, Authorization: `Bearer ${signedOutToken}` } }).catch(() => {}); });
fetch('/config').then(response => response.json()).then(async value => {
  config = value;
  let saved;
  try { saved = JSON.parse(sessionStorage.getItem(SESSION_KEY)); } catch { saved = null; }
  if (!saved?.access_token || !saved?.refresh_token) return;
  token = saved.access_token; refreshToken = saved.refresh_token; expiresAt = Number(saved.expires_at) || 0;
  try { message('Restoring your session…'); const user = await call('/auth/v1/user'); await openWorkspace(user); }
  catch { forgetSession(); message('Your session could not be restored. Please sign in again.'); }
}).catch(() => message('Unable to load application configuration.'));
