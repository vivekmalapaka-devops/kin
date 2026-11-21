'use client';
import { useState } from 'react';
import { filterReports } from '../../frontend/results.js';
import { dateLabel } from '../lib/api';
import type { Report } from '../lib/types';

type OpenReport = (id: string, resultId?: string) => void;

export function Reports({ reports, open, upload, canUpload = true }: { reports: Report[]; open: OpenReport; upload: () => void; canUpload?: boolean }) {
  const [search, setSearch] = useState(''), [status, setStatus] = useState('all');
  const filtered = filterReports(reports, search, status);
  const labels: Record<string,string> = { confirmed:'Reviewed', needs_review:'Needs review', pending:'Pending', processing:'Processing', failed:'Failed' };
  return <><div className="inner-heading"><div className="eyebrow"><span className="dot"/> YOUR HEALTH RECORD</div><h1>All your reports<span className="period">.</span></h1><p className="subtitle">Your reports and results, in one place.</p></div><div className="section-heading"><div><div className="eyebrow muted">REPORT LIBRARY</div><h2>Reports</h2></div>{canUpload && <button className="outline-button" onClick={upload}>＋ Add a report</button>}</div><div className="react-filters"><label className="react-field">SEARCH REPORTS<input type="search" placeholder="Search by date or lab" value={search} onChange={e=>setSearch(e.target.value)}/></label><label className="react-field">STATUS<select value={status} onChange={e=>setStatus(e.target.value)}><option value="all">All reports</option>{Object.entries(labels).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label></div><div className="report-list">{filtered.length ? filtered.map(report=><button key={report.id} className="report-row" onClick={()=>open(report.id)}><span className="report-info"><strong>{report.collection_date ? dateLabel(report.collection_date) : 'Date needs review'}</strong><small>{labels[report.status] || 'Status unavailable'}{report.lab_name ? ` · ${report.lab_name}` : ''}</small></span></button>) : <p className="empty-copy">{reports.length ? 'No reports match these filters.' : canUpload ? 'No reports yet. Upload a PDF to get started.' : 'No reports yet. An admin can upload a report for you.'}</p>}</div></>;
}

