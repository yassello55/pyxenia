import React, { useState, useEffect } from 'react';
import {
  Download, Package, Play, CheckCircle2, Loader, ExternalLink, FileSpreadsheet, Globe, TrendingDown
} from 'lucide-react';
import AcornIcon from './AcornIcon';
import './TemplatesPage.css';

const TEMPLATE_ICONS = {
  'excel-sales-cleaner':  <FileSpreadsheet size={28} />,
  'multi-site-scraper':   <Globe size={28} />,
  'crypto-dip-scanner':   <TrendingDown size={28} />,
};

const TAG_COLORS = {
  'Excel':       '#3ecf8e',
  'Data Cleaning': '#7c6af7',
  'Sales':       '#f6c90e',
  'Web Scraping':'#82aaff',
  'Automation':  '#ffcb6b',
  'Finance':     '#3ecf8e',
  'Crypto':      '#f56565',
  'API':         '#89ddff',
};

export default function TemplatesPage({ onInstalled }) {
  const api = window.pyxenia;
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  // Per-template state: 'idle' | 'installing' | 'done'
  const [installState, setInstallState] = useState({});
  const [downloadingId, setDownloadingId] = useState(null);

  useEffect(() => {
    api.getTemplates().then(t => {
      setTemplates(t || []);
      setLoading(false);
    });
  }, []);

  const handleInstall = async (template) => {
    setInstallState(prev => ({ ...prev, [template.id]: 'installing' }));
    const result = await api.installTemplate({ templateId: template.id });
    if (result) {
      setInstallState(prev => ({ ...prev, [template.id]: 'done' }));
      // Persist pre-filled args to localStorage
      if (result.scriptArgs?.length > 0) {
        try {
          localStorage.setItem(
            `pyxenia-args-${result.project.scripts[0]?.id}`,
            JSON.stringify(result.scriptArgs)
          );
        } catch {}
      }
      onInstalled?.(result.project);
    } else {
      setInstallState(prev => ({ ...prev, [template.id]: 'idle' }));
    }
  };

  const handleDownloadSample = async (templateId) => {
    setDownloadingId(templateId);
    await api.downloadTemplateSample({ templateId });
    setDownloadingId(null);
  };

  if (loading) return (
    <div className="templates-page">
      <div className="templates-loading"><Loader size={20} className="spin" /> Loading templates…</div>
    </div>
  );

  return (
    <div className="templates-page">
      <div className="templates-header">
        <div className="templates-header-icon"><AcornIcon size={20} /></div>
        <div>
          <h1 className="templates-title">Templates</h1>
          <p className="templates-subtitle">Ready-to-run Python projects — one click to install.</p>
        </div>
      </div>

      <div className="templates-grid">
        {templates.map(t => {
          const state = installState[t.id] || 'idle';
          const isDone = state === 'done';
          const isInstalling = state === 'installing';

          return (
            <div key={t.id} className={`template-card ${isDone ? 'template-card--done' : ''}`}>
              <div className="template-card-top">
                <div className="template-icon">
                  {TEMPLATE_ICONS[t.id] || <Package size={28} />}
                </div>
                <div className="template-tags">
                  {(t.tags || []).map(tag => (
                    <span
                      key={tag}
                      className="template-tag"
                      style={{ color: TAG_COLORS[tag] || 'var(--text2)', borderColor: TAG_COLORS[tag] || 'var(--border)' }}
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>

              <h2 className="template-name">{t.name}</h2>
              <p className="template-desc">{t.description}</p>

              <div className="template-packages">
                <span className="template-section-label"><Package size={11} /> Packages</span>
                <div className="template-pkg-list">
                  {(t.packages || []).map(pkg => (
                    <span key={pkg} className="template-pkg-badge">{pkg}</span>
                  ))}
                </div>
              </div>

              {t.sampleFilePath && (
                <div className="template-sample">
                  <span className="template-section-label"><FileSpreadsheet size={11} /> Sample dataset</span>
                  <div className="template-sample-row">
                    <span className="template-sample-name">
                      {t.sampleFileLabel || t.sampleFile}
                    </span>
                    <button
                      className="template-download-btn"
                      onClick={() => handleDownloadSample(t.id)}
                      disabled={downloadingId === t.id}
                      title="Download sample data file"
                    >
                      {downloadingId === t.id
                        ? <Loader size={12} className="spin" />
                        : <><Download size={12} /> Download</>}
                    </button>
                  </div>
                </div>
              )}

              <div className="template-card-footer">
                {isDone ? (
                  <div className="template-installed-msg">
                    <CheckCircle2 size={16} />
                    Project added — open it from the sidebar
                  </div>
                ) : (
                  <button
                    className="template-install-btn"
                    onClick={() => handleInstall(t)}
                    disabled={isInstalling}
                  >
                    {isInstalling
                      ? <><Loader size={14} className="spin" /> Installing…</>
                      : <><Play size={13} fill="currentColor" /> Install Project</>}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="templates-more">
        <span>Want more templates?</span>
        <button
          className="templates-more-link"
          onClick={() => api.openExternalUrl('https://pyxenia.com/templates.html')}
        >
          Browse all templates at pyxenia.com <ExternalLink size={12} />
        </button>
      </div>
    </div>
  );
}
