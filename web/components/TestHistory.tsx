'use client';

import { useMemo, useState } from 'react';
import { previousComparable, resultStatus, trend } from '../../frontend/results.js';
import { dateLabel } from '../lib/api';
import type { Result } from '../lib/types';

type Props = { results: Result[]; open: (id: string, resultId?: string) => void; initialTest?: string };

export function TestHistory({ results, open, initialTest }: Props) {
  const [search, setSearch] = useState('');
  const [choice, setChoice] = useState(initialTest || '');
  const [selectedResult, setSelectedResult] = useState('');
  const names = useMemo(() => [...new Set(results.map(result => result.name))]
    .filter(name => name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => a.localeCompare(b)), [results, search]);
  const active = names.includes(choice) ? choice : names[0];
  const rows = results.filter(result => result.name === active).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const current = rows.find(result => result.id === selectedResult) || rows[0];
  const points = trend(rows);
  const status = current && resultStatus(current);
  const comparison = current && previousComparable(current, rows);

  return <>
    <div className="journal-page-heading"><div className="eyebrow journal-kicker">YOUR HEALTH RECORD <span>/</span> HISTORY</div><h1>Your test history<span className="period">.</span></h1><p className="subtitle">Follow a test through your reviewed reports.</p></div>
    <div className="history-controls journal-history-controls"><label className="react-field">FIND A TEST<input type="search" placeholder="Search tests" value={search} onChange={event => setSearch(event.target.value)}/></label><div className="history-switcher-label">SELECT A TEST <span>Scroll to explore</span></div><div className="react-history-list">{names.map(name => <button key={name} aria-pressed={name === active} onClick={() => { setChoice(name); setSelectedResult(''); }}>{name}</button>)}</div></div>
    <section className="journal-history-panel" aria-labelledby="history-title"><div className="journal-section-heading"><div><div className="eyebrow muted">RESULT HISTORY</div><h2 id="history-title">{active || 'Select a test'}<span className="period">.</span></h2></div>{rows.length > 0 && <span className="journal-count">{rows.length} {rows.length === 1 ? 'RESULT' : 'RESULTS'}</span>}</div>
      {current ? <>
        <div className="journal-history-current" aria-live="polite"><div><span className="eyebrow muted">{selectedResult === current.id ? 'SELECTED RESULT' : 'LATEST RESULT'}</span><strong>{current.raw_value} <small>{current.unit}</small></strong><span>{dateLabel(current.date || null)}</span></div><div className="journal-current-reference"><span className={`journal-history-status result-label-${status?.severity}`}>{status?.label}</span><small>{current.reference_lines.length ? current.reference_lines.join(' · ') : 'No reference range provided'}</small>{comparison && <small>Previous: {comparison.previous.raw_value} {comparison.previous.unit} · Change: {comparison.difference > 0 ? '+' : ''}{comparison.difference} {current.unit}</small>}</div></div>
        <p className="section-description">Each dot uses that report’s lab range. Check test methods before comparing.</p>
        {points ? <HistoryGraph points={points} selectedId={current.id} onSelect={setSelectedResult}/> : <p className="empty-copy">Text results and numeric values with different or missing units are listed below without a graph.</p>}
        {points && rows.some(result => result.result_type !== 'numeric') && <p className="empty-copy">Text results appear below and are not plotted.</p>}
        <div className="journal-history-entries"><div className="eyebrow muted">ALL RESULTS</div>{rows.map(result => <div className="history-entry" key={result.id}><span>{dateLabel(result.date || null)}</span><strong>{result.raw_value} {result.unit}</strong><small>{resultStatus(result).label} · {result.reference_lines.join('; ') || 'No reference range'}</small><button className="text-link" onClick={() => open(result.report_id, result.id)}>View report ↗</button></div>)}</div>
      </> : <p className="empty-copy journal-empty">{results.length ? 'No matching tests. Try another search.' : 'Review a report to see test history.'}</p>}
    </section>
  </>;
}

function HistoryGraph({ points, selectedId, onSelect }: { points: NonNullable<ReturnType<typeof trend>>; selectedId: string; onSelect: (id: string) => void }) {
  const values = points.map(point => point.value), min = Math.min(...values), max = Math.max(...values);
  const pad = min === max ? Math.max(Math.abs(min) * .1, .01) : (max - min) * .15, low = min - pad, high = max + pad;
  const times = points.map(point => Date.parse(`${point.date}T00:00:00Z`)), duration = times[times.length - 1] - times[0];
  const plotted = points.map((point, index) => ({ ...point, x: duration ? 72 + (times[index] - times[0]) * 500 / duration : 322, y: 172 - (point.value - low) * 140 / (high - low) }));
  const unique = new Set(points.map(point => point.date)).size === points.length;
  return <><div className="graph-scroll" role="region" aria-label="Scrollable results graph" tabIndex={0}><svg className="history-chart" viewBox="0 0 600 220" role="group" aria-label="Values over time; select a point for details. Exact results and statuses are listed below.">
    {[0, 1, 2].map(index => <g key={index}><line className="chart-grid-line" x1="72" x2="572" y1={32 + index * 70} y2={32 + index * 70}/><text className="chart-axis" x="62" y={36 + index * 70} textAnchor="end">{Number((high - index * (high - low) / 2).toPrecision(4))}</text></g>)}
    {unique && plotted.slice(1).map((point, index) => <line key={`line-${index}`} x1={plotted[index].x} y1={plotted[index].y} x2={point.x} y2={point.y} className={`chart-line ${plotted[index].severity === point.severity ? `chart-${point.severity}` : 'chart-mixed'}`}/>)}
    {plotted.map(point => <g key={point.id} className="history-point" role="button" tabIndex={0} aria-pressed={point.id === selectedId} aria-label={`${dateLabel(point.date)}: ${point.value} ${point.unit}, ${point.label}`} onClick={() => onSelect(point.id)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(point.id); } }}><title>{`${dateLabel(point.date)}: ${point.value} ${point.unit} — ${point.label}`}</title><circle cx={point.x} cy={point.y} r="22" className="chart-hit-target"/><circle cx={point.x} cy={point.y} r={point.id === selectedId ? 7 : 6} className={`chart-point chart-${point.severity}`}/></g>)}
    <text className="chart-axis" x={duration ? 72 : 322} y="205" textAnchor={duration ? 'start' : 'middle'}>{dateLabel(points[0].date)}</text>{!!duration && <text className="chart-axis" x="572" y="205" textAnchor="end">{dateLabel(points[points.length - 1].date)}</text>}
  </svg></div><p className="chart-limits">Value ({points[0].unit}) · {points.length === 1 ? 'One report so far' : unique ? 'Connecting lines show sequence, not results between dates.' : 'Some results share a date, so points are not connected.'}</p><div className="history-legend">{[['green','Within range'],['amber','Near limit / borderline'],['red','Outside range'],['unknown','See lab reference']].map(([kind,label]) => <span key={kind}><i className={`legend-${kind}`}/>{label}</span>)}</div></>;
}
