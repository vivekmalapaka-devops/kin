'use client';

import { previousComparable, resultStatus, summarize } from '../../frontend/results.js';
import { dateLabel } from '../lib/api';
import type { Report, Result } from '../lib/types';

type Props = {
  reports: Report[];
  results: Result[];
  memberName: string;
  open: (id: string, resultId?: string) => void;
  navigate: (view: 'reports' | 'history') => void;
};

export function Overview({ reports, results, memberName, open, navigate }: Props) {
  const latest = reports.filter(report => report.status === 'confirmed' && report.collection_date)
    .sort((a, b) => b.collection_date!.localeCompare(a.collection_date!))[0];
  const rows = latest ? results.filter(result => result.report_id === latest.id) : [];
  const totals = summarize(rows);
  const flagged = rows.filter(result => ['red', 'amber'].includes(resultStatus(result).severity))
    .sort((a, b) => Number(resultStatus(a).severity !== 'red') - Number(resultStatus(b).severity !== 'red'));
  const near = rows.filter(result => resultStatus(result).label.startsWith('Near ')).length;
  const labBorderline = totals.borderline - near;
  const counts = [
    { color: 'green', symbol: '✓', label: 'Within range', detail: 'Within the lab’s stated range', value: totals.within },
    { color: 'red', symbol: '!', label: 'Outside range', detail: 'High, low, deficient or insufficient', value: totals.outside },
    { color: 'amber', symbol: '·', label: 'Near a limit', detail: 'Within the app’s 5% margin', value: near },
    { color: 'amber', symbol: '!', label: 'Lab-labelled borderline', detail: 'A category printed on the report', value: labBorderline },
    { color: 'grey', symbol: '—', label: 'See lab reference', detail: 'A range the app cannot classify', value: totals.unknown },
  ];

  return <>
    <div className="journal-heading">
      <div><div className="eyebrow journal-kicker">YOUR HEALTH RECORD <span>/</span> {memberName || 'YOUR PROFILE'}</div>
        <h1>A clearer view<br/>of your <em>health.</em></h1>
        <p className="subtitle">Your reports, results, and history.<br/>Clear, organized, and easy to revisit.</p></div>
      <div className="journal-date"><span className="eyebrow muted">LATEST REVIEWED REPORT</span><strong>{latest ? dateLabel(latest.collection_date) : 'No report yet'}</strong><button className="text-link plain-button" onClick={() => navigate('reports')}>All reports ↗</button></div>
    </div>
    <div className="journal-overview">
      <section className="journal-summary" aria-labelledby="summary-title">
        <div className="journal-section-heading"><div><div className="eyebrow muted">AT A GLANCE</div><h2 id="summary-title">Your latest results<span className="period">.</span></h2></div><span className="journal-count">{latest ? `${rows.length} RESULTS` : 'NO REPORT YET'}</span></div>
        <p className="section-description">{latest ? `From ${dateLabel(latest.collection_date)}.` : 'Review a report to see a summary here.'}</p>
        <div className="journal-summary-list">{counts.map(item => <div className="journal-summary-row" key={item.label}><span className={`journal-status-symbol ${item.color}`}>{item.symbol}</span><span className="journal-summary-label"><strong>{item.label}</strong><small>{item.detail}</small></span><strong className="journal-summary-number">{latest ? item.value : '—'}</strong></div>)}</div>
        <p className="journal-footnote">Colors reflect the lab ranges, not medical urgency.</p>
      </section>
      <section className="journal-noteworthy" aria-labelledby="noteworthy-title">
        <div className="journal-section-heading"><div><div className="eyebrow muted">YOUR LATEST REPORT</div><h2 id="noteworthy-title">Worth a closer look<span className="period">.</span></h2></div><span className="journal-count">{latest ? `${flagged.length} RESULTS` : ''}</span></div>
        <p className="section-description">High, low, borderline and near-limit results.</p>
        {flagged.length ? <div className="journal-result-list">{flagged.map(result => {
          const status = resultStatus(result);
          const comparison = previousComparable(result, results);
          return <button type="button" className="journal-result" key={result.id} onClick={() => open(result.report_id, result.id)}>
            <span className="journal-result-copy"><strong>{result.name}</strong><span className={`journal-result-status result-label-${status.severity}`}>{status.label}</span><small>{result.reference_lines.length === 1 ? `Lab range: ${result.reference_lines[0]}` : 'See the lab’s categories in the report'}</small>{comparison && <small>Previous: {comparison.previous.raw_value} {comparison.previous.unit} <span aria-hidden="true">·</span> Change: {comparison.difference > 0 ? '+' : ''}{comparison.difference} {result.unit}</small>}</span>
            <span className="journal-result-measure"><strong>{result.raw_value}</strong><small>{result.unit || ''}</small><span aria-hidden="true">↗</span></span>
          </button>;
        })}</div> : <p className="empty-copy journal-empty">{latest ? 'No high, low, borderline or near-limit results identified. Check results without a classification in the report.' : 'Your reviewed results will appear here.'}</p>}
        {flagged.some(result => previousComparable(result, results)) && <p className="journal-footnote">Changes compare matching names and units. Check the test method before comparing.</p>}
      </section>
      <div className="journal-history-link"><div><div className="eyebrow muted">THE LONG VIEW</div><h2>The longer view<span className="period">.</span></h2><p>See how the same test changes across reports.</p></div><button className="outline-button" onClick={() => navigate('history')}>Explore test history ↗</button></div>
    </div>
  </>;
}
