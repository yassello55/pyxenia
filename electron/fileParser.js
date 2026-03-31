/**
 * fileParser.js — Structural summarizer for chat attachments.
 * Parses files locally and returns a compact summary for LLM context.
 * Never sends raw file content — only schema, stats, and sample rows.
 */
const fs = require('fs');
const path = require('path');

const MAX_SAMPLE_ROWS = 5;
const MAX_TEXT_LINES = 20;
const MAX_JSON_DEPTH = 4;
const MAX_UNIQUE_SAMPLES = 6;
const MAX_IMAGE_RAW_BYTES = 3 * 1024 * 1024; // 3 MB raw → ~4 MB base64 after encoding

// ─── CSV helpers ─────────────────────────────────────────────────────────────

function parseCSVLine(line) {
  const result = [];
  let cur = '';
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuote && line[i + 1] === '"') { cur += '"'; i++; }
      else inQuote = !inQuote;
    } else if ((ch === ',' || ch === '\t') && !inQuote) {
      result.push(cur.trim()); cur = '';
    } else {
      cur += ch;
    }
  }
  result.push(cur.trim());
  return result;
}

function inferColumnType(values) {
  const nonEmpty = values.filter(v => v !== '' && v !== null && v !== undefined);
  if (nonEmpty.length === 0) return 'empty';

  const boolSet = new Set(['true', 'false', '1', '0', 'yes', 'no']);
  const isBool = nonEmpty.every(v => boolSet.has(String(v).toLowerCase()));
  if (isBool) return 'boolean';

  const isNum = nonEmpty.every(v => !isNaN(parseFloat(v)) && isFinite(v));
  if (isNum) {
    const nums = nonEmpty.map(Number);
    const hasDecimal = nonEmpty.some(v => v.includes('.'));
    return hasDecimal ? 'float' : 'integer';
  }

  // Anchored, length-bounded date regex — avoids ReDoS on long strings
  const dateRe = /^\d{1,4}[-/]\d{1,2}[-/]\d{1,4}$/;
  const isDate = nonEmpty.slice(0, 20).every(v => { const s = String(v); return s.length <= 10 && dateRe.test(s); });
  if (isDate) return 'date';

  return 'string';
}

function summarizeCSV(filePath, delimiter = ',') {
  const stat = fs.statSync(filePath);
  if (stat.size > 10 * 1024 * 1024) {
    return { error: 'File too large for preview (> 10 MB). Load it in Python with pandas.' };
  }
  const content = fs.readFileSync(filePath, 'utf8').slice(0, 5 * 1024 * 1024);
  const rawLines = content.split(/\r?\n/).filter(l => l.trim());
  if (rawLines.length === 0) return { error: 'Empty file' };

  const headers = parseCSVLine(rawLines[0]);
  const totalRows = rawLines.length - 1;

  // Parse up to 200 rows for type inference
  const sampleCount = Math.min(200, rawLines.length - 1);
  const parsedRows = rawLines.slice(1, sampleCount + 1).map(parseCSVLine);

  const columns = headers.map((header, colIdx) => {
    const colValues = parsedRows.map(r => r[colIdx] ?? '');
    const type = inferColumnType(colValues);
    const nonEmpty = colValues.filter(v => v !== '');
    const emptyCount = colValues.length - nonEmpty.length;

    let extra = '';
    if (type === 'float' || type === 'integer') {
      const nums = nonEmpty.map(Number);
      const mn = Math.min(...nums), mx = Math.max(...nums);
      extra = `range: ${mn.toLocaleString()} – ${mx.toLocaleString()}`;
    } else if (type === 'string') {
      const unique = [...new Set(nonEmpty)];
      const samples = unique.slice(0, MAX_UNIQUE_SAMPLES).map(v => `"${v}"`).join(', ');
      extra = `${unique.length} unique${unique.length <= MAX_UNIQUE_SAMPLES ? '' : '+'}, e.g. ${samples}`;
    } else if (type === 'boolean') {
      const trueCount = nonEmpty.filter(v => ['true', '1', 'yes'].includes(v.toLowerCase())).length;
      extra = `${trueCount} true / ${nonEmpty.length - trueCount} false`;
    }

    return {
      name: header,
      type,
      nullable: emptyCount > 0,
      extra,
    };
  });

  // Sample rows (raw text)
  const sampleLines = rawLines.slice(0, MAX_SAMPLE_ROWS + 1).join('\n');

  let summary = `[File: ${path.basename(filePath)} | CSV | ${totalRows.toLocaleString()} rows × ${headers.length} columns]\n`;
  summary += `Columns:\n`;
  columns.forEach(c => {
    const nullable = c.nullable ? ' (nullable)' : '';
    summary += `  • ${c.name.padEnd(20)} (${c.type})${nullable}${c.extra ? '  ' + c.extra : ''}\n`;
  });
  summary += `\nSample (first ${Math.min(MAX_SAMPLE_ROWS, totalRows)} rows):\n${sampleLines}\n`;
  return { type: 'csv', summary, columns, totalRows, filePath };
}

// ─── Excel helper ─────────────────────────────────────────────────────────────

function summarizeExcel(filePath) {
  try {
    const XLSX = require('xlsx');
    const wb = XLSX.readFile(filePath, { sheetRows: 206 }); // read first 206 rows per sheet
    const sheetSummaries = [];

    for (const sheetName of wb.SheetNames.slice(0, 5)) { // cap at 5 sheets
      const ws = wb.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
      if (data.length === 0) continue;

      const headers = data[0].map(String);
      const rows = data.slice(1);
      const totalRows = rows.length;

      const columns = headers.map((h, i) => {
        const vals = rows.map(r => String(r[i] ?? ''));
        return { name: h, type: inferColumnType(vals) };
      });

      const sampleRows = rows.slice(0, MAX_SAMPLE_ROWS)
        .map(r => r.map(v => String(v ?? '')).join(', ')).join('\n');

      sheetSummaries.push(
        `  Sheet "${sheetName}": ${totalRows} rows × ${headers.length} columns\n` +
        `  Columns: ${columns.map(c => `${c.name} (${c.type})`).join(', ')}\n` +
        `  Sample:\n  ${headers.join(', ')}\n  ${sampleRows.replace(/\n/g, '\n  ')}`
      );
    }

    let summary = `[File: ${path.basename(filePath)} | Excel | ${wb.SheetNames.length} sheet(s)]\n`;
    summary += sheetSummaries.join('\n\n');
    return { type: 'excel', summary, filePath };
  } catch (e) {
    return { type: 'excel', summary: `[Excel file: ${path.basename(filePath)}]\nCould not parse: ${e.message}`, filePath };
  }
}

// ─── JSON helper ─────────────────────────────────────────────────────────────

function buildJsonSchema(val, depth = 0) {
  if (depth > MAX_JSON_DEPTH) return '…';
  if (val === null) return 'null';
  if (Array.isArray(val)) {
    if (val.length === 0) return 'array[]';
    const itemSchema = buildJsonSchema(val[0], depth + 1);
    return `array[${val.length}] of ${itemSchema}`;
  }
  if (typeof val === 'object') {
    const keys = Object.keys(val).slice(0, 20);
    const fields = keys.map(k => `${k}: ${buildJsonSchema(val[k], depth + 1)}`);
    const more = Object.keys(val).length > 20 ? `, …${Object.keys(val).length - 20} more` : '';
    return `{${fields.join(', ')}${more}}`;
  }
  return typeof val;
}

function summarizeJSON(filePath) {
  const stat = fs.statSync(filePath);
  const maxRead = 500 * 1024; // 500 KB — enough for schema inference
  const fd = fs.openSync(filePath, 'r');
  const buf = Buffer.alloc(Math.min(stat.size, maxRead));
  fs.readSync(fd, buf, 0, buf.length, 0);
  fs.closeSync(fd);

  let parsed;
  try { parsed = JSON.parse(buf.toString('utf8')); }
  catch {
    // Try parsing truncated — might fail, fallback to raw preview
    return {
      type: 'json',
      summary: `[File: ${path.basename(filePath)} | JSON]\nCould not parse (possibly malformed or too large for preview)`,
      filePath
    };
  }

  const schema = buildJsonSchema(parsed);
  let sample = '';
  if (Array.isArray(parsed) && parsed.length > 0) {
    sample = `\nFirst item:\n${JSON.stringify(parsed[0], null, 2).slice(0, 600)}`;
  } else if (typeof parsed === 'object' && parsed !== null) {
    sample = `\nContent preview:\n${JSON.stringify(parsed, null, 2).slice(0, 600)}`;
  }

  const summary = `[File: ${path.basename(filePath)} | JSON]\nSchema: ${schema}${sample}`;
  return { type: 'json', summary, filePath };
}

// ─── Text helper ──────────────────────────────────────────────────────────────

function summarizeText(filePath) {
  const stat = fs.statSync(filePath);
  const maxRead = 100 * 1024;
  const content = fs.readFileSync(filePath, { encoding: 'utf8', flag: 'r' }).slice(0, maxRead);
  const lines = content.split(/\r?\n/);
  const preview = lines.slice(0, MAX_TEXT_LINES).join('\n');
  const truncated = lines.length > MAX_TEXT_LINES ? `\n… (${lines.length} total lines)` : '';

  const summary = `[File: ${path.basename(filePath)} | Text | ${lines.length} lines | ${(stat.size / 1024).toFixed(1)} KB]\n\nContent preview:\n${preview}${truncated}`;
  return { type: 'text', summary, filePath };
}

// ─── Image helper ─────────────────────────────────────────────────────────────

function summarizeImage(filePath) {
  const stat = fs.statSync(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const mimeMap = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp' };
  const mimeType = mimeMap[ext] || 'image/png';
  const fileName = path.basename(filePath);

  const result = {
    type: 'image',
    filePath,
    mimeType,
    summary: `[File: ${fileName} | Image | ${(stat.size / 1024).toFixed(1)} KB]`,
  };

  // Include base64 for vision models (cap at 3 MB raw to stay under 4 MB encoded)
  if (stat.size <= MAX_IMAGE_RAW_BYTES) {
    result.imageBase64 = fs.readFileSync(filePath).toString('base64');
  }

  return result;
}

// ─── PDF helper ──────────────────────────────────────────────────────────────

function summarizePDF(filePath) {
  const stat = fs.statSync(filePath);
  // Basic: report file size, note it's a PDF
  // We can't easily parse text without pdf.js in main process
  const summary = `[File: ${path.basename(filePath)} | PDF | ${(stat.size / 1024).toFixed(1)} KB]\nNote: Python code can use PyMuPDF (fitz) or pdfplumber to read this file.`;
  return { type: 'pdf', summary, filePath };
}

// ─── Main entry ──────────────────────────────────────────────────────────────

const EXT_MAP = {
  '.csv': 'csv', '.tsv': 'tsv',
  '.xlsx': 'excel', '.xls': 'excel', '.xlsm': 'excel',
  '.json': 'json',
  '.txt': 'text', '.log': 'text', '.md': 'text', '.py': 'text', '.xml': 'text',
  '.png': 'image', '.jpg': 'image', '.jpeg': 'image', '.gif': 'image', '.webp': 'image',
  '.pdf': 'pdf',
};

function parseAttachment(filePath) {
  if (!fs.existsSync(filePath)) return { error: 'File not found', filePath };

  const ext = path.extname(filePath).toLowerCase();
  const kind = EXT_MAP[ext] || 'text';

  try {
    switch (kind) {
      case 'csv':  return summarizeCSV(filePath, ',');
      case 'tsv':  return summarizeCSV(filePath, '\t');
      case 'excel': return summarizeExcel(filePath);
      case 'json': return summarizeJSON(filePath);
      case 'image': return summarizeImage(filePath);
      case 'pdf':  return summarizePDF(filePath);
      default:     return summarizeText(filePath);
    }
  } catch (err) {
    return {
      type: 'unknown',
      summary: `[File: ${path.basename(filePath)}]\nCould not parse: ${err.message}`,
      filePath,
    };
  }
}

module.exports = { parseAttachment };
