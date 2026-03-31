import React, { useState, useEffect, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import { X, ArrowUpDown, ArrowUp, ArrowDown, Search } from 'lucide-react';
import './FilePreview.css';

function parseCSV(text, delimiter = ',') {
  const lines = text.trim().split('\n');
  if (!lines.length) return { headers: [], rows: [] };
  const headers = lines[0].split(delimiter).map(h => h.trim().replace(/^"|"$/g, ''));
  const rows = lines.slice(1).map(line => {
    const cells = [];
    let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { inQ = !inQ; }
      else if (ch === delimiter && !inQ) { cells.push(cur.trim()); cur = ''; }
      else { cur += ch; }
    }
    cells.push(cur.trim());
    return cells;
  });
  return { headers, rows };
}

function parsePythonDictLines(text) {
  const lines = text.trim().split('\n').filter(l => l.trim().startsWith('{'));
  if (lines.length === 0) return null;
  const parsed = [];
  for (const line of lines) {
    try {
      const cleaned = line.trim()
        .replace(/np\.\w+\(([^)]+)\)/g, '$1')   // np.float64(x) → x
        .replace(/([{,]\s*)'([^']+)'(\s*:)/g, '$1"$2"$3')  // 'key': → "key":
        .replace(/:\s*'([^']*)'/g, ': "$1"')     // : 'value' → : "value"
        .replace(/\[([^\]]*)\]/g, m =>           // ['a','b'] → ["a","b"]
          m.replace(/'([^']*)'/g, '"$1"'))
        .replace(/\bTrue\b/g, 'true')
        .replace(/\bFalse\b/g, 'false')
        .replace(/\bNone\b/g, 'null');
      parsed.push(JSON.parse(cleaned));
    } catch { return null; }
  }
  if (!parsed.length) return null;
  const headers = [...new Set(parsed.flatMap(r => Object.keys(r)))];
  const rows = parsed.map(r => headers.map(h => {
    const v = r[h];
    if (v === null || v === undefined) return '';
    if (Array.isArray(v)) return v.join(', ');
    if (typeof v === 'number') return parseFloat(v.toFixed(8)).toString();
    return String(v);
  }));
  return { headers, rows };
}

function flattenObject(obj, prefix = '') {
  const result = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      Object.assign(result, flattenObject(v, key));
    } else if (Array.isArray(v)) {
      result[key] = v.map(i => (typeof i === 'object' ? JSON.stringify(i) : i)).join(', ');
    } else {
      result[key] = v !== null && v !== undefined ? String(v) : '';
    }
  }
  return result;
}

function arrayToTable(arr) {
  const flattened = arr.map(r => (typeof r === 'object' && !Array.isArray(r) ? flattenObject(r) : { value: String(r) }));
  const headers = [...new Set(flattened.flatMap(r => Object.keys(r)))];
  const rows = flattened.map(r => headers.map(h => r[h] ?? ''));
  return { headers, rows };
}

function parseJSON(text) {
  try {
    const data = JSON.parse(text);

    // Top-level array of objects
    if (Array.isArray(data) && data.length > 0) {
      return { type: 'table', ...arrayToTable(data) };
    }

    // Object — look for the largest nested array of objects
    if (data && typeof data === 'object') {
      const candidates = Object.entries(data)
        .filter(([, v]) => Array.isArray(v) && v.length > 0 && typeof v[0] === 'object')
        .sort((a, b) => b[1].length - a[1].length);

      if (candidates.length > 0) {
        return { type: 'table', ...arrayToTable(candidates[0][1]) };
      }

      // Plain object — show as key/value table
      const flat = flattenObject(data);
      const headers = ['Key', 'Value'];
      const rows = Object.entries(flat).map(([k, v]) => [k, v]);
      return { type: 'table', headers, rows };
    }

    return { type: 'json', data };
  } catch {
    return { type: 'error' };
  }
}

function DataTable({ headers, rows }) {
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState({ col: null, dir: 'asc' });
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return q ? rows.filter(r => r.some(c => String(c).toLowerCase().includes(q))) : rows;
  }, [rows, search]);

  const sorted = useMemo(() => {
    if (sort.col === null) return filtered;
    return [...filtered].sort((a, b) => {
      const av = a[sort.col] ?? '', bv = b[sort.col] ?? '';
      const n = parseFloat(av), m = parseFloat(bv);
      const cmp = !isNaN(n) && !isNaN(m) ? n - m : String(av).localeCompare(String(bv));
      return sort.dir === 'asc' ? cmp : -cmp;
    });
  }, [filtered, sort]);

  const paged = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(sorted.length / PAGE_SIZE);

  const toggleSort = (i) => {
    setSort(prev => prev.col === i ? { col: i, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { col: i, dir: 'asc' });
    setPage(0);
  };

  const SortIcon = ({ i }) => {
    if (sort.col !== i) return <ArrowUpDown size={11} className="sort-icon" />;
    return sort.dir === 'asc' ? <ArrowUp size={11} className="sort-icon active" /> : <ArrowDown size={11} className="sort-icon active" />;
  };

  return (
    <div className="datatable-wrap">
      <div className="datatable-toolbar">
        <div className="datatable-search">
          <Search size={13} />
          <input
            placeholder="Search…"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(0); }}
          />
        </div>
        <span className="datatable-count">{filtered.length} rows · {headers.length} cols</span>
      </div>
      <div className="datatable-scroll">
        <table className="datatable">
          <thead>
            <tr>
              {headers.map((h, i) => (
                <th key={i} onClick={() => toggleSort(i)}>
                  <span>{h}</span><SortIcon i={i} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paged.map((row, ri) => (
              <tr key={ri}>
                {row.map((cell, ci) => <td key={ci}>{cell}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="datatable-pagination">
          <button disabled={page === 0} onClick={() => setPage(p => p - 1)}>‹ Prev</button>
          <span>Page {page + 1} / {totalPages}</span>
          <button disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>Next ›</button>
        </div>
      )}
    </div>
  );
}

export default function FilePreview({ file, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [pdfZoom, setPdfZoom] = useState(75);
  const blobUrlRef = useRef(null);
  const api = window.pyxenia;
  const ext = file.name.split('.').pop().toLowerCase();
  const ZOOM_LEVELS = [50, 75, 100, 125, 150, 200];

  // Clean up blob URL on unmount
  useEffect(() => () => { if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current); }, []);

  useEffect(() => {
    setLoading(true);
    api.readOutputFile(file.path).then(res => {
      if (!res) { setData({ kind: 'error', msg: 'Could not read file.' }); setLoading(false); return; }

      if (res.type === 'pdf') {
        const bytes = atob(res.content);
        const arr = new Uint8Array(bytes.length);
        for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
        const blob = new Blob([arr], { type: 'application/pdf' });
        if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = URL.createObjectURL(blob);
        setData({ kind: 'pdf', baseSrc: blobUrlRef.current });
        setLoading(false);
        return;
      }

      if (res.type === 'image') {
        setData({ kind: 'image', src: res.content });
      } else if (res.type === 'excel') {
        try {
          const wb = XLSX.read(res.content, { type: 'base64' });
          const sheet = wb.Sheets[wb.SheetNames[0]];
          const json = XLSX.utils.sheet_to_json(sheet, { header: 1 });
          const headers = json[0]?.map(String) || [];
          const rows = json.slice(1).map(r => headers.map((_, i) => r[i] !== undefined ? String(r[i]) : ''));
          setData({ kind: 'table', headers, rows, sheetNames: wb.SheetNames, wb, activeSheet: wb.SheetNames[0] });
        } catch { setData({ kind: 'error', msg: 'Failed to parse Excel file.' }); }
      } else {
        const text = res.content;
        if (ext === 'json') {
          const parsed = parseJSON(text);
          if (parsed.type === 'table') setData({ kind: 'table', ...parsed });
          else if (parsed.type === 'json') setData({ kind: 'json', text: JSON.stringify(parsed.data, null, 2) });
          else setData({ kind: 'text', text });
        } else if (ext === 'csv') {
          setData({ kind: 'table', ...parseCSV(text, ',') });
        } else if (ext === 'tsv') {
          setData({ kind: 'table', ...parseCSV(text, '\t') });
        } else {
          const pyTable = parsePythonDictLines(text);
          if (pyTable) setData({ kind: 'table', ...pyTable });
          else setData({ kind: 'text', text });
        }
      }
      setLoading(false);
    });
  }, [file.path]);

  const switchSheet = (name) => {
    if (!data?.wb) return;
    const sheet = data.wb.Sheets[name];
    const json = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    const headers = json[0]?.map(String) || [];
    const rows = json.slice(1).map(r => headers.map((_, i) => r[i] !== undefined ? String(r[i]) : ''));
    setData(prev => ({ ...prev, headers, rows, activeSheet: name }));
  };

  return (
    <div className="preview-overlay">
      <div className="preview-header">
        <div className="preview-title">
          <span className="preview-filename">{file.name}</span>
          <span className="preview-meta">{formatSize(file.size)}</span>
          {data?.sheetNames?.length > 1 && (
            <div className="sheet-tabs">
              {data.sheetNames.map(s => (
                <button key={s} className={`sheet-tab ${data.activeSheet === s ? 'active' : ''}`} onClick={() => switchSheet(s)}>{s}</button>
              ))}
            </div>
          )}
        </div>
        <button className="preview-close" onClick={onClose}><X size={15} /></button>
      </div>
      <div className="preview-body">
        {loading && <div className="preview-loading">Loading preview…</div>}
        {!loading && data?.kind === 'pdf' && (
          <div className="preview-pdf-wrap">
            <div className="pdf-zoom-bar">
              <button className="pdf-zoom-btn" disabled={pdfZoom <= ZOOM_LEVELS[0]} onClick={() => setPdfZoom(z => ZOOM_LEVELS[ZOOM_LEVELS.indexOf(z) - 1] ?? z)}>−</button>
              <span className="pdf-zoom-label">{pdfZoom}%</span>
              <button className="pdf-zoom-btn" disabled={pdfZoom >= ZOOM_LEVELS[ZOOM_LEVELS.length - 1]} onClick={() => setPdfZoom(z => ZOOM_LEVELS[ZOOM_LEVELS.indexOf(z) + 1] ?? z)}>+</button>
              <button className="pdf-zoom-btn fit" onClick={() => setPdfZoom(75)}>Fit</button>
            </div>
            <div className="preview-pdf-scroll">
              <iframe
                className="preview-pdf-frame"
                src={`${data.baseSrc}#zoom=${pdfZoom}`}
                title={file.name}
                style={{ width: `${Math.round(pdfZoom / 75 * 100)}%`, height: `${Math.round(pdfZoom / 75 * 100)}%` }}
              />
            </div>
          </div>
        )}
        {!loading && data?.kind === 'image' && (
          <div className="preview-image-wrap">
            <img src={data.src} alt={file.name} className="preview-image" />
          </div>
        )}
        {!loading && data?.kind === 'table' && (
          <DataTable headers={data.headers} rows={data.rows} />
        )}
        {!loading && (data?.kind === 'text' || data?.kind === 'json') && (
          <pre className="preview-text">{data.text}</pre>
        )}
        {!loading && data?.kind === 'error' && (
          <div className="preview-error">{data.msg}</div>
        )}
      </div>
    </div>
  );
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
