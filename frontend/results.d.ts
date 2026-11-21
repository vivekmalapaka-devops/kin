import type { Result, Report } from '../web/lib/types';
export function resultStatus(result: Result): { severity: 'green' | 'amber' | 'red' | 'unknown'; label: string; note: string };
export function rangePosition(result: Result): { position: number; clipped: boolean } | null;
export function summarize(results: Result[]): { within: number; borderline: number; outside: number; unknown: number };
export function filterResults(results: Result[], query?: string, severity?: string): Result[];
export function filterReports(reports: Report[], query?: string, status?: string): Report[];
export function trend(rows: Result[]): { id: string; date: string; value: number; unit: string; severity: string; label: string }[] | null;
export function previousComparable(current: Result, results: Result[]): { previous: Result; difference: number } | null;
