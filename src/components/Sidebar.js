import React, { useState, useContext } from 'react';
import { Plus, Settings, Info, Sun, Moon, MessageSquare, LayoutTemplate, Search, Tag } from 'lucide-react';
import AcornIcon from './AcornIcon';
import { SettingsContext } from '../App';
import CategorySection from './CategorySection';
import './Sidebar.css';

const CATEGORY_COLORS = ['#7c6af7','#3ecf8e','#f56565','#f6c90e','#82aaff','#ffcb6b','#89ddff','#c792ea'];

export default function Sidebar({
  projects, categories, activeProjectId,
  onSelect, onCreateProject, onDeleteProject, onRenameProject,
  onCreateCategory, onRenameCategory, onDeleteCategory, onMoveProject,
  onOpenSettings, onOpenAbout, onNewChat,
}) {
  const { settings, updateSettings } = useContext(SettingsContext);
  const toggleTheme = () => updateSettings({ theme: settings.theme === 'dark' ? 'light' : 'dark' });

  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');

  const [showCatForm, setShowCatForm] = useState(false);
  const [catName, setCatName] = useState('');
  const [catColor, setCatColor] = useState(CATEGORY_COLORS[0]);

  const [collapsed, setCollapsed] = useState({});
  const [search, setSearch] = useState('');

  const toggleCollapse = (id) => setCollapsed(prev => ({ ...prev, [id]: !prev[id] }));

  const handleCreate = () => {
    if (!name.trim()) return;
    onCreateProject(name.trim(), desc.trim());
    setName(''); setDesc(''); setShowForm(false);
  };

  const handleCreateCategory = () => {
    if (!catName.trim()) return;
    onCreateCategory(catName.trim(), catColor);
    setCatName(''); setCatColor(CATEGORY_COLORS[0]); setShowCatForm(false);
  };

  // Filter projects by search query
  const filtered = search.trim()
    ? projects.filter(p => p.name.toLowerCase().includes(search.toLowerCase()))
    : projects;

  // Group projects by category
  const grouped = {};
  categories.forEach(c => { grouped[c.id] = []; });
  grouped['__general__'] = [];

  filtered.forEach(p => {
    const key = p.categoryId && grouped[p.categoryId] !== undefined ? p.categoryId : '__general__';
    grouped[key].push(p);
  });

  const isSearching = !!search.trim();

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="logo">
          <AcornIcon size={18} />
          <span>Pyxenia</span>
        </div>
      </div>

      <nav className="sidebar-nav">
        <button className="sidebar-nav-btn" title="New Chat" onClick={onNewChat}>
          <MessageSquare size={15} />
          <span>New Chat</span>
        </button>
        <button className="sidebar-nav-btn" title="Templates" disabled>
          <LayoutTemplate size={15} />
          <span>Templates</span>
        </button>
      </nav>

      {/* Search */}
      <div className="sidebar-search">
        <Search size={12} />
        <input
          placeholder="Search projects…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        {search && <button className="search-clear" onClick={() => setSearch('')}>✕</button>}
      </div>

      {/* Project list */}
      <div className="project-list">
        {projects.length === 0 && !showForm && (
          <div className="empty-hint">No projects yet.<br />Create one to get started.</div>
        )}

        {isSearching ? (
          // Flat list when searching
          filtered.length === 0 ? (
            <div className="empty-hint">No results for "{search}"</div>
          ) : (
            <CategorySection
              category={null}
              projects={filtered}
              activeProjectId={activeProjectId}
              isCollapsed={false}
              onToggleCollapse={() => {}}
              onSelect={onSelect}
              onRenameProject={onRenameProject}
              onDeleteProject={onDeleteProject}
              onMoveProject={onMoveProject}
              categories={categories}
              onRenameCategory={() => {}}
              onDeleteCategory={() => {}}
            />
          )
        ) : (
          <>
            {/* Named categories */}
            {categories.map(cat => (
              <CategorySection
                key={cat.id}
                category={cat}
                projects={grouped[cat.id] || []}
                activeProjectId={activeProjectId}
                isCollapsed={!!collapsed[cat.id]}
                onToggleCollapse={() => toggleCollapse(cat.id)}
                onSelect={onSelect}
                onRenameProject={onRenameProject}
                onDeleteProject={onDeleteProject}
                onMoveProject={onMoveProject}
                categories={categories}
                onRenameCategory={onRenameCategory}
                onDeleteCategory={onDeleteCategory}
              />
            ))}

            {/* General (uncategorized) */}
            <CategorySection
              category={null}
              projects={grouped['__general__'] || []}
              activeProjectId={activeProjectId}
              isCollapsed={!!collapsed['__general__']}
              onToggleCollapse={() => toggleCollapse('__general__')}
              onSelect={onSelect}
              onRenameProject={onRenameProject}
              onDeleteProject={onDeleteProject}
              onMoveProject={onMoveProject}
              categories={categories}
              onRenameCategory={() => {}}
              onDeleteCategory={() => {}}
            />
          </>
        )}
      </div>

      {/* New category form */}
      {showCatForm && (
        <div className="create-form slide-in">
          <input
            className="form-input"
            placeholder="Category name"
            value={catName}
            onChange={e => setCatName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleCreateCategory(); if (e.key === 'Escape') setShowCatForm(false); }}
            autoFocus
          />
          <div className="color-picker">
            {CATEGORY_COLORS.map(c => (
              <button
                key={c}
                className={`color-swatch ${catColor === c ? 'selected' : ''}`}
                style={{ background: c }}
                onClick={() => setCatColor(c)}
              />
            ))}
          </div>
          <div className="form-actions">
            <button className="btn-primary" onClick={handleCreateCategory} disabled={!catName.trim()}>Create</button>
            <button className="btn-ghost" onClick={() => { setShowCatForm(false); setCatName(''); }}>Cancel</button>
          </div>
        </div>
      )}

      {/* New project form */}
      {showForm ? (
        <div className="create-form slide-in">
          <input
            className="form-input"
            placeholder="Project name"
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleCreate()}
            autoFocus
          />
          <input
            className="form-input"
            placeholder="Description (optional)"
            value={desc}
            onChange={e => setDesc(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleCreate()}
          />
          <div className="form-actions">
            <button className="btn-primary" onClick={handleCreate} disabled={!name.trim()}>Create</button>
            <button className="btn-ghost" onClick={() => { setShowForm(false); setName(''); setDesc(''); }}>Cancel</button>
          </div>
        </div>
      ) : (
        <div className="sidebar-actions">
          <button className="new-project-btn" onClick={() => { setShowForm(true); setShowCatForm(false); }}>
            <Plus size={13} /> New Project
          </button>
          <button className="new-cat-btn" onClick={() => { setShowCatForm(true); setShowForm(false); }} title="New category">
            <Tag size={13} />
          </button>
        </div>
      )}

      <div className="sidebar-footer">
        <span>v0.1.0</span>
        <div style={{ display: 'flex', gap: 4 }}>
          <button className="settings-btn" onClick={toggleTheme}
            title={`Switch to ${settings.theme === 'dark' ? 'light' : 'dark'} mode`}>
            {settings.theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
          </button>
          <button className="settings-btn" onClick={onOpenAbout} title="About Pyxenia">
            <Info size={14} />
          </button>
          <button className="settings-btn" onClick={onOpenSettings} title="Settings (Ctrl+,)">
            <Settings size={14} />
          </button>
        </div>
      </div>
    </aside>
  );
}
