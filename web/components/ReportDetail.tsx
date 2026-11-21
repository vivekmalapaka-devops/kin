'use client';

import { useState } from 'react';
import { filterResults, rangePosition, resultStatus } from '../../frontend/results.js';
import { dateLabel } from '../lib/api';
import type { Report, Result } from '../lib/types';

type Props = { report: Report; results: Result[]; original: () => void; back: () => void; viewHistory: (name: string) => void; focusId?: string };
const colorClass = (severity: string) => severity === 'green' ? 'green-pill' : severity === 'red' ? 'red-pill' : severity === 'amber' ? 'amber-pill' : 'neutral-pill';

export function ReportDetail({ report, results, original, back, viewHistory, focusId }: Props) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const filtered = filterResults(results, search, status);
  return <>
    <button className="back-link plain-button" onClick={back}>← All reports</button>
    <div className="journal-report-heading"><div><div className="eyebrow journal-kicker">YOUR HEALTH RECORD <span>/</span> REVIEWED REPORT</div><h1>Report details<span className="period">.</span></h1><p className="subtitle">Results as recorded in your report.</p></div><div className="journal-report-meta"><span className="eyebrow muted">COLLECTION DATE</span><strong>{dateLabel(report.collection_date)}</strong><button className="outline-button" onClick={original}>View original PDF ↗</button></div></div>
    <section className="journal-results" aria-labelledby="report-results-title">
      <div className="journal-section-heading"><div><div className="eyebrow muted">YOUR RESULTS</div><h2 id="report-results-title">All results<span className="period">.</span></h2></div><span className="journal-count">{filtered.length === results.length ? `${results.length} RESULTS` : `${filtered.length} OF ${results.length}`}</span></div>
      <div className="react-filters journal-filters"><label className="react-field">SEARCH RESULTS<input type="search" placeholder="Search by test name" value={search} onChange={event => setSearch(event.target.value)}/></label><label className="react-field">RESULT STATUS<select value={status} onChange={event => setStatus(event.target.value)}><option value="all">All results</option><option value="red">High, low or insufficient</option><option value="amber">Near limit / borderline</option><option value="green">Within range</option><option value="unknown">See lab reference</option></select></label></div>
      <div className="detail-table react-results">{filtered.length ? filtered.map(result => {
        const status = resultStatus(result);
        const range = rangePosition(result);
        return <div key={result.id} id={`result-${result.id}`} className={`detail-result journal-detail-row ${focusId === result.id ? 'result-highlight' : ''}`}>
          <span className="journal-test-name"><button type="button" className="journal-test-link" onClick={() => viewHistory(result.name)} aria-label={`View history for ${result.name}`}>{result.name} <span aria-hidden="true">↗</span></button><small>Page {result.source_page}</small></span>
          <span><strong>{result.raw_value} {result.unit}</strong><small className="reference-lines">{result.reference_lines.length ? result.reference_lines.map((line, index) => <span key={index}>{line}</span>) : 'No reference range provided'}</small>{range && <span className="result-range" role="img" aria-label={`Result ${result.raw_value} ${result.unit || ''}; lab range ${result.reference_lines[0]}; ${status.label}${range.clipped ? '; marker shown at edge of scale' : ''}`}><span className="result-range-track" aria-hidden="true"><span className={`result-range-marker marker-${status.severity}`} style={{ left: `${range.position}%` }}/></span>{range.clipped && <small className="result-range-clipped">Beyond display scale</small>}</span>}</span>
          <span className="result-status"><span className={`pill ${colorClass(status.severity)}`}>{status.label.toUpperCase()}</span>{status.note && <small className="status-note">{status.note}</small>}</span>
        </div>;
      }) : <p className="empty-copy">No results match these filters.</p>}</div>
      <p className="journal-footnote">Select a test name to see its history. Results reflect the information on this report.</p>
    </section>
  </>;
}
