(function (root) {
  function rangeLabel(result) {
    if (result.result_type !== 'numeric' || !Array.isArray(result.reference_lines) || result.reference_lines.length !== 1 || typeof result.reference_lines[0] !== 'string' || typeof result.raw_value !== 'string' || !/^\d+(?:\.\d+)?$/.test(result.raw_value.trim())) return 'Range needs interpretation';
    const reference = result.reference_lines[0];
    const value = Number(result.raw_value);
    const limit = reference.match(/^\s*(<=|>=|<|>|≤|≥)\s*(\d+(?:\.\d+)?)\s*$/);
    if (limit) {
      const boundary = Number(limit[2]), operator = limit[1];
      const within = operator === '<' ? value < boundary : operator === '<=' || operator === '≤' ? value <= boundary : operator === '>' ? value > boundary : value >= boundary;
      return within ? 'Within lab limit' : operator.startsWith('<') || operator === '≤' ? 'Above lab limit' : 'Below lab limit';
    }
    const range = reference.match(/^\s*(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)\s*$/);
    if (!range) return 'Range needs interpretation';
    const low = Number(range[1]), high = Number(range[2]);
    if (low > high) return 'Range needs interpretation';
    return value < low ? 'Below lab range' : value > high ? 'Above lab range' : 'Within lab range';
  }
  function rangePosition(result) {
    if (result.result_type !== 'numeric' || typeof result.raw_value !== 'string' || !/^\d+(?:\.\d+)?$/.test(result.raw_value.trim()) || !Array.isArray(result.reference_lines) || result.reference_lines.length !== 1 || typeof result.reference_lines[0] !== 'string') return null;
    const match = result.reference_lines[0].match(/^\s*(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)\s*$/);
    if (!match) return null;
    const low = Number(match[1]), high = Number(match[2]), value = Number(result.raw_value);
    if (!Number.isFinite(value) || !Number.isFinite(low) || !Number.isFinite(high) || low >= high) return null;
    const position = 15 + 70 * (value - low) / (high - low);
    return { position: Math.min(99, Math.max(1, position)), clipped: position < 1 || position > 99 };
  }
  function summarize(results) {
    const summary = { within: 0, borderline: 0, outside: 0, unknown: 0 };
    for (const result of results) { const severity = resultStatus(result).severity; if (severity === 'green') summary.within++; else if (severity === 'amber') summary.borderline++; else if (severity === 'red') summary.outside++; else summary.unknown++; }
    return summary;
  }
  function labCategory(result) {
    if (result.result_type !== 'numeric' || typeof result.raw_value !== 'string' || !/^\d+(?:\.\d+)?$/.test(result.raw_value.trim()) || !Array.isArray(result.reference_lines) || result.reference_lines.length < 2) return null;
    const value = Number(result.raw_value), matches = [];
    for (const line of result.reference_lines) {
      if (typeof line !== 'string') return null;
      // This lab's A1c PDF can extract the higher threshold as "= 6.5- Diabetes".
      // The operator is unclear, so only rule it out for values strictly below
      // the printed threshold; never interpret that line at or above it.
      const unclearA1c = line.trim().match(/^=\s*(\d+(?:\.\d+)?)\s*[-–]\s*Diabetes$/i);
      if (unclearA1c && /^(?:Glycated Haemoglobin \(A1c\)|HbA1c)$/i.test((result.name || '').trim())) {
        if (value >= Number(unclearA1c[1])) return null;
        continue;
      }
      const normalized = line.includes(':') ? line : line.replace(/^(.+?)\s+-\s+([A-Za-z][A-Za-z -]*)$/, '$1:$2');
      const parts = normalized.split(':');
      if (parts.length !== 2) return null;
      const first = parts[0].trim(), second = parts[1].trim();
      const expression = /^(?:[<>≤≥]=?\s*\d+(?:\.\d+)?|\d+(?:\.\d+)?\s*[-–]\s*\d+(?:\.\d+)?)$/;
      const firstIsRange = expression.test(first), secondIsRange = expression.test(second);
      if (firstIsRange === secondIsRange) return null;
      const rule = firstIsRange ? first : second, label = firstIsRange ? second : first;
      // Only match lab result categories we recognize, not demographic or
      // clinical-context ranges such as pregnancy, sex, age, or fasting.
      if (!/^(deficiency|deficient|insufficiency|insufficient|optimum(?: level)?|optimal|normal|desirable|non-diabetes|prediabetes|diabetes|low|high|high risk|borderline(?:[- ]high|[- ]low| risk)?|very high|possible toxicity|toxicity|hypertriglyceridemic)$/i.test(label)) return null;
      if (/^(?:non-diabetes|prediabetes|diabetes)$/i.test(label) && !/^(?:Glycated Haemoglobin \(A1c\)|HbA1c)$/i.test((result.name || '').trim())) return null;
      const interval = rule.match(/^(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)$/);
      let inRange = false;
      if (interval) {
        const low = Number(interval[1]), high = Number(interval[2]);
        if (low > high) return null;
        inRange = value >= low && value <= high;
      } else {
        const limit = rule.match(/^([<>≤≥]=?)\s*(\d+(?:\.\d+)?)$/);
        if (!limit) return null;
        const boundary = Number(limit[2]);
        if (limit[1] === '<') inRange = value < boundary;
        else if (limit[1] === '<=' || limit[1] === '≤') inRange = value <= boundary;
        else if (limit[1] === '>') inRange = value > boundary;
        else if (limit[1] === '>=' || limit[1] === '≥') inRange = value >= boundary;
        else return null;
      }
      if (inRange) matches.push(label);
    }
    return matches.length === 1 ? matches[0] : null;
  }
  function nearRangeLimit(result) {
    if (result.result_type !== 'numeric' || typeof result.raw_value !== 'string' || !/^\d+(?:\.\d+)?$/.test(result.raw_value.trim()) || !Array.isArray(result.reference_lines) || result.reference_lines.length !== 1 || typeof result.reference_lines[0] !== 'string') return null;
    const match = result.reference_lines[0].match(/^\s*(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)\s*$/);
    if (!match) return null;
    const value = Number(result.raw_value), low = Number(match[1]), high = Number(match[2]);
    if (low >= high || value < low || value > high) return null;
    const margin = (high - low) * 0.05;
    const tolerance = Number.EPSILON * Math.max(1, Math.abs(low), Math.abs(high), Math.abs(value)) * 4;
    if (value - low <= margin + tolerance) return 'Near lower limit';
    if (high - value <= margin + tolerance) return 'Near upper limit';
    return null;
  }
  function resultStatus(result) {
    const category = labCategory(result);
    if (category) {
      const name = category.toLowerCase();
      const severity = /^(borderline|prediabetes)/.test(name) ? 'amber' : /^(optimum(?: level)?|optimal|normal|desirable|non-diabetes)$/.test(name) ? 'green' : 'red';
      const unclear = result.reference_lines.some(line => /^=\s*\d+(?:\.\d+)?\s*[-–]\s*Diabetes$/i.test(line.trim()));
      return { severity, label: category, note: unclear ? 'Lab category; verify unclear cutoff' : 'Lab category' };
    }
    const label = rangeLabel(result);
    const nearLimit = nearRangeLimit(result);
    if (nearLimit) return { severity: 'amber', label: nearLimit, note: 'Within lab range · within 5% of range width' };
    if (label.startsWith('Within lab')) return { severity: 'green', label, note: '' };
    if (label.startsWith('Above lab') || label.startsWith('Below lab')) return { severity: 'red', label, note: '' };
    return { severity: 'unknown', ...referenceStatus(result) };
  }
  function referenceStatus(result) {
    const classified = rangeLabel(result);
    if (classified !== 'Range needs interpretation') return { label: classified, note: '' };
    if (result.result_type !== 'numeric') return { label: 'Text result', note: 'See the result and lab comments.' };
    if (!Array.isArray(result.reference_lines) || !result.reference_lines.length) return { label: 'No lab range', note: 'No reference range was recorded.' };
    if (result.reference_lines.length > 1) {
      const category = labCategory(result);
      return category ? { label: `Lab category: ${category}`, note: 'Matched to the categories printed on this report.' } : { label: 'Multiple lab ranges', note: 'Compare the value with the lab ranges shown.' };
    }
    return { label: 'See lab reference', note: 'The lab uses a limit or other reference format.' };
  }
  function trend(rows) {
    const numericRows = rows.filter(row => row.result_type === 'numeric');
    if (!numericRows.length || numericRows.some(row => !row.unit || typeof row.raw_value !== 'string' || !/^\d+(?:\.\d+)?$/.test(row.raw_value) || !/^\d{4}-\d{2}-\d{2}$/.test(row.date || ''))) return null;
    if (new Set(numericRows.map(row => row.unit)).size !== 1) return null;
    return [...numericRows].sort((a,b) => a.date.localeCompare(b.date)).map(row => ({ id: row.id, date: row.date, value: Number(row.raw_value), unit: row.unit, severity: resultStatus(row).severity, label: resultStatus(row).label }));
  }
  function filterResults(results, query = '', severity = 'all') {
    const term = query.trim().toLocaleLowerCase();
    return results.filter(result => (!term || result.name.toLocaleLowerCase().includes(term)) && (severity === 'all' || resultStatus(result).severity === severity));
  }
  function filterReports(reports, query = '', status = 'all') {
    const term = query.trim().toLocaleLowerCase();
    return reports.filter(report => {
      const formatted = report.collection_date ? new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${report.collection_date}T00:00:00Z`)) : '';
      const text = [report.collection_date, formatted, report.lab_name].filter(Boolean).join(' ').toLocaleLowerCase();
      return (!term || text.includes(term)) && (status === 'all' || report.status === status);
    });
  }
  function previousComparable(current, results) {
    if (!current.date || current.result_type !== 'numeric' || !current.unit || typeof current.raw_value !== 'string' || !/^\d+(?:\.\d+)?$/.test(current.raw_value)) return null;
    const candidates = results.filter(row => row.date && row.date < current.date && row.name === current.name && row.unit === current.unit && row.result_type === 'numeric' && typeof row.raw_value === 'string' && /^\d+(?:\.\d+)?$/.test(row.raw_value));
    if (!candidates.length) return null;
    const latestDate = candidates.reduce((date, row) => row.date > date ? row.date : date, '');
    const latest = candidates.filter(row => row.date === latestDate);
    if (latest.length !== 1) return null;
    return { previous: latest[0], difference: Number((Number(current.raw_value) - Number(latest[0].raw_value)).toPrecision(8)) };
  }
  const api = { rangeLabel, rangePosition, labCategory, nearRangeLimit, resultStatus, referenceStatus, summarize, trend, filterResults, filterReports, previousComparable };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.KinDomain = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
