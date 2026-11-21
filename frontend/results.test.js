const test = require('node:test');
const assert = require('node:assert/strict');
const { rangeLabel, labCategory, resultStatus, referenceStatus, summarize, trend, filterResults, filterReports, previousComparable } = require('./results.js');
const numeric = (value, range) => ({ result_type: 'numeric', raw_value: value, reference_lines: [range] });

test('labels only unambiguous lab intervals, including boundary values', () => {
  assert.equal(rangeLabel(numeric('12', '12-15')), 'Within lab range');
  assert.equal(rangeLabel(numeric('15', '12-15')), 'Within lab range');
  assert.equal(rangeLabel(numeric('11.9', '12-15')), 'Below lab range');
  assert.equal(rangeLabel(numeric('15.1', '12–15')), 'Above lab range');
});

test('leaves category ranges, malformed ranges, and qualitative results unclassified', () => {
  assert.equal(rangeLabel(numeric('23', '< 20: Deficient')), 'Range needs interpretation');
  assert.equal(rangeLabel(numeric('23', '30-20')), 'Range needs interpretation');
  assert.equal(rangeLabel({ result_type: 'qualitative', raw_value: '12', reference_lines: ['10-20'] }), 'Range needs interpretation');
});

test('counts outside ranges and uncertain results without hiding them', () => {
  assert.deepEqual(summarize([numeric('5', '4-6'), numeric('9', '4-6'), numeric('2', '<5: category')]), { within: 1, borderline: 0, outside: 1, unknown: 1 });
});

test('charts one or more numeric results with matching known units', () => {
  const rows = [{ ...numeric('2', '1-4'), unit:'mg/dL', date:'2025-01-01' }, { ...numeric('3', '1-4'), unit:'mg/dL', date:'2026-01-01' }];
  assert.deepEqual(trend(rows).map(point => point.value), [2, 3]);
  assert.equal(trend([rows[0], { ...rows[1], unit:'mmol/L' }]), null);
  assert.equal(trend([rows[0]]).length, 1);
  assert.equal(trend([rows[0], { ...rows[1], date: rows[0].date }]).length, 2);
  assert.equal(trend([{ ...rows[0], unit:null }]), null);
  assert.equal(trend([{ ...rows[0], result_type:'qualitative' }]), null);
  assert.deepEqual(trend([rows[0], { ...rows[1], result_type:'qualitative', raw_value:'Normal', unit:null }]).map(point => point.value), [2]);
});

test('history points use the lab range from their own report', () => {
  const rows = [
    { ...numeric('50', '30-100'), unit:'mg/dL', date:'2024-01-01' },
    { ...numeric('98', '30-100'), unit:'mg/dL', date:'2025-01-01' },
    { ...numeric('105', '30-100'), unit:'mg/dL', date:'2026-01-01' },
    { ...numeric('105', '30-120'), unit:'mg/dL', date:'2027-01-01' }
  ];
  assert.deepEqual(trend(rows).map(point => point.severity), ['green','amber','red','green']);
});

test('explains why results do not receive a simple range label', () => {
  assert.equal(referenceStatus({ ...numeric('24.9', 'Deficiency: <20'), reference_lines: ['Deficiency: <20', 'Insufficiency: 20-29', 'Optimum: 30-80'] }).label, 'Lab category: Insufficiency');
  assert.equal(referenceStatus(numeric('8', '<10: not labelled')).label, 'See lab reference');
  assert.equal(referenceStatus({ result_type:'qualitative', raw_value:'Normal', reference_lines:[] }).label, 'Text result');
  assert.equal(referenceStatus({ ...numeric('8', '1-10'), reference_lines:[] }).label, 'No lab range');
});

test('uses red, green and amber only where lab ranges support them', () => {
  const vitamin = value => ({ ...numeric(value, ''), reference_lines: ['Deficiency: <20', 'Insufficiency: 20-29', 'Optimum Level: 30-80', 'Possible Toxicity: >150'] });
  assert.deepEqual(resultStatus(vitamin('24.9')), { severity:'red', label:'Insufficiency', note:'Lab category' });
  assert.equal(resultStatus(vitamin('35')).severity, 'green');
  assert.equal(resultStatus(vitamin('29.5')).severity, 'unknown');
  const cholesterol = value => ({ ...numeric(value, ''), reference_lines: ['<200 - Desirable', '200-239 - Borderline risk', '>240 - High risk'] });
  assert.equal(resultStatus(cholesterol('199')).severity, 'green');
  assert.equal(resultStatus(cholesterol('210')).severity, 'amber');
  assert.equal(resultStatus(cholesterol('245')).severity, 'red');
  assert.equal(resultStatus(cholesterol('240')).severity, 'unknown');
  assert.equal(resultStatus(numeric('11', '12-15')).severity, 'red');
  assert.equal(resultStatus(numeric('12', '12-15')).severity, 'amber');
  assert.equal(resultStatus(numeric('12.2', '12-15')).severity, 'green');
  assert.equal(resultStatus(numeric('5', '<5')).severity, 'red');
  assert.equal(resultStatus(numeric('5', '<=5')).severity, 'green');
  assert.equal(resultStatus(numeric('5', '>5')).severity, 'red');
  assert.equal(resultStatus(numeric('5', '>=5')).severity, 'green');
});

test('matches a unique lab category without inventing cutoffs', () => {
  const ranges = ['Deficiency: < 20', 'Insufficiency: 20-29', 'Optimum Level: 30-80', 'Possible Toxicity: > 150'];
  const result = value => ({ ...numeric(value, ''), reference_lines: ranges });
  assert.equal(labCategory(result('19.9')), 'Deficiency');
  assert.equal(labCategory(result('20')), 'Insufficiency');
  assert.equal(labCategory(result('24.9')), 'Insufficiency');
  assert.equal(labCategory(result('30')), 'Optimum Level');
  assert.equal(labCategory(result('29.5')), null);
  assert.equal(labCategory(result('150')), null);
});

test('does not classify overlapping, unparseable, or contextual lab categories', () => {
  const result = lines => ({ ...numeric('5', ''), reference_lines: lines });
  assert.equal(labCategory(result(['Low: < 10', 'Normal: 5-15'])), null);
  assert.equal(labCategory(result(['Low: < 10', 'Normal: ask your doctor'])), null);
  assert.equal(labCategory(result(['Adult male: 0-10', 'Pregnancy: 0-20'])), null);
  assert.equal(labCategory(result(['Adult male: 0-10', 'Pregnancy: 11-20'])), null);
});

test('matches the lower A1c categories while leaving the unclear higher cutoff unclassified', () => {
  const result = value => ({ ...numeric(value, ''), name:'Glycated Haemoglobin (A1c)', reference_lines:['<5.7: Non-diabetes', '5.7 – 6.4: Prediabetes', '= 6.5- Diabetes'] });
  assert.deepEqual(resultStatus(result('5.6')), { severity:'green', label:'Non-diabetes', note:'Lab category; verify unclear cutoff' });
  assert.equal(resultStatus(result('5.7')).severity, 'amber');
  assert.equal(resultStatus(result('6.4')).severity, 'amber');
  assert.equal(resultStatus(result('6.45')).severity, 'unknown');
  assert.equal(resultStatus(result('6.5')).severity, 'unknown');
  assert.equal(resultStatus(result('8')).severity, 'unknown');
  assert.equal(resultStatus({ ...result('5.6'), name:'Unrelated test' }).severity, 'unknown');
});

test('filters results by test name and actual displayed severity together', () => {
  const results = [{ ...numeric('3','4-6'), name:'Hemoglobin' }, { ...numeric('5','4-6'), name:'Iron' }, { ...numeric('2','not specified'), name:'Other' }];
  assert.deepEqual(filterResults(results, ' HEMO ', 'red').map(item => item.name), ['Hemoglobin']);
  assert.deepEqual(filterResults(results, '', 'green').map(item => item.name), ['Iron']);
  assert.deepEqual(filterResults(results, '', 'unknown').map(item => item.name), ['Other']);
  assert.deepEqual(filterResults(results, 'iron', 'red'), []);
});

test('filters reports by formatted date, lab and review status', () => {
  const reports = [{ collection_date:'2026-07-16', lab_name:'Clinova', status:'confirmed' }, { collection_date:null, lab_name:'Other lab', status:'needs_review' }];
  assert.equal(filterReports(reports, '16 July 2026', 'confirmed').length, 1);
  assert.equal(filterReports(reports, 'CLINOVA', 'all').length, 1);
  assert.equal(filterReports(reports, '', 'needs_review').length, 1);
  assert.equal(filterReports(reports, 'clinova', 'needs_review').length, 0);
});

test('lab-labelled borderline values stay amber in labels, filters, and dashboard counts', () => {
  const ldl = value => ({ name:'Cholesterol - LDL', ...numeric(value, ''), reference_lines: ['< 100 : Normal', '100 - 129 : Desirable', '130 – 159 : Borderline-High', '160 – 189 : High', '> 190 : Very High'] });
  const rows = [ldl('99'), ldl('129'), ldl('130'), ldl('159'), ldl('160'), ldl('190')];
  assert.deepEqual(rows.map(item => resultStatus(item).severity), ['green', 'green', 'amber', 'amber', 'red', 'unknown']);
  assert.deepEqual(summarize(rows), { within: 2, borderline: 2, outside: 1, unknown: 1 });
  assert.deepEqual(filterResults(rows, '', 'amber').map(item => item.raw_value), ['130', '159']);
});

test('marks the outer five percent of simple lab intervals as near-limit, not abnormal', () => {
  const status = value => resultStatus(numeric(value, '30-100'));
  assert.equal(status('29.9').severity, 'red');
  assert.deepEqual(status('30'), { severity:'amber', label:'Near lower limit', note:'Within lab range · within 5% of range width' });
  assert.equal(status('33.5').severity, 'amber');
  assert.equal(status('33.51').severity, 'green');
  assert.equal(status('96.49').severity, 'green');
  assert.equal(status('96.5').label, 'Near upper limit');
  assert.equal(status('100').severity, 'amber');
  assert.equal(status('100.1').severity, 'red');
  assert.equal(resultStatus(numeric('0.3', '0.3-0.3')).severity, 'green');
  assert.equal(resultStatus(numeric('9.99', '<10')).severity, 'green');
});

test('compares only the latest unambiguous older value with matching name and unit', () => {
  const row = (date, value, unit='mg/dL', name='Example') => ({ ...numeric(value,'1-10'), date, unit, name });
  const current = row('2026-07-16','5.6');
  const prior = row('2025-07-16','6.2');
  assert.deepEqual(previousComparable(current,[row('2024-01-01','7'),prior,row('2025-12-01','100','other')]), { previous: prior, difference: -0.6 });
  assert.equal(previousComparable(current,[prior,{ ...prior, raw_value:'7' }]), null);
  assert.equal(previousComparable(current,[row('2026-07-16','4')]), null);
  assert.equal(previousComparable(current,[row('2025-01-01','Normal')]), null);
  assert.equal(previousComparable({ ...current, unit:null },[prior]), null);
});
