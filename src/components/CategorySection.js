import React, { useState, useEffect, useRef } from 'react';
import { ChevronRight, Folder, FolderOpen, Trash2, MoreHorizontal } from 'lucide-react';
import './CategorySection.css';

export default function CategorySection({
  category,        // { id, name, color } or null for General
  projects,
  activeProjectId,
  isCollapsed,
  onToggleCollapse,
  onSelect,
  onRenameProject,
  onDeleteProject,
  onMoveProject,
  categories,
  onRenameCategory,
  onDeleteCategory,
}) {
  const [renamingProjectId, setRenamingProjectId] = useState(null);
  const [renameProjectValue, setRenameProjectValue] = useState('');
  const [renamingCategory, setRenamingCategory] = useState(false);
  const [renameCatValue, setRenameCatValue] = useState('');
  const [deleteCatConfirm, setDeleteCatConfirm] = useState(false);
  const [deleteProjectConfirm, setDeleteProjectConfirm] = useState(null);
  const [moveMenuProjectId, setMoveMenuProjectId] = useState(null);
  const moveMenuRef = useRef(null);

  const isGeneral = !category;

  // Close move menu on outside click
  useEffect(() => {
    if (!moveMenuProjectId) return;
    const handler = (e) => {
      if (moveMenuRef.current && !moveMenuRef.current.contains(e.target)) {
        setMoveMenuProjectId(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [moveMenuProjectId]);

  const startRenameProject = (e, p) => {
    e.stopPropagation();
    setRenamingProjectId(p.id);
    setRenameProjectValue(p.name);
  };

  const commitRenameProject = (id) => {
    if (renameProjectValue.trim()) onRenameProject(id, renameProjectValue.trim());
    setRenamingProjectId(null);
  };

  const handleDeleteProject = (e, id) => {
    e.stopPropagation();
    if (deleteProjectConfirm === id) {
      onDeleteProject(id);
      setDeleteProjectConfirm(null);
    } else {
      setDeleteProjectConfirm(id);
      setTimeout(() => setDeleteProjectConfirm(null), 2500);
    }
  };

  const startRenameCategory = (e) => {
    e.stopPropagation();
    setRenamingCategory(true);
    setRenameCatValue(category.name);
  };

  const commitRenameCategory = () => {
    if (renameCatValue.trim()) onRenameCategory(category.id, renameCatValue.trim());
    setRenamingCategory(false);
  };

  const handleDeleteCategory = (e) => {
    e.stopPropagation();
    if (deleteCatConfirm) {
      onDeleteCategory(category.id);
      setDeleteCatConfirm(false);
    } else {
      setDeleteCatConfirm(true);
      setTimeout(() => setDeleteCatConfirm(false), 2500);
    }
  };

  const moveTargets = [
    { id: null, name: 'General' },
    ...categories.filter(c => !category || c.id !== category.id),
  ];

  return (
    <div className="cat-section">
      {/* Category header */}
      <div className="cat-header" onClick={onToggleCollapse}>
        <ChevronRight size={12} className={`cat-chevron ${isCollapsed ? '' : 'open'}`} />
        {!isGeneral && <span className="cat-dot" style={{ background: category.color }} />}
        {renamingCategory ? (
          <input
            className="cat-rename-input"
            value={renameCatValue}
            onChange={e => setRenameCatValue(e.target.value)}
            onBlur={commitRenameCategory}
            onKeyDown={e => {
              if (e.key === 'Enter') commitRenameCategory();
              if (e.key === 'Escape') setRenamingCategory(false);
            }}
            onClick={e => e.stopPropagation()}
            autoFocus
          />
        ) : (
          <span
            className="cat-name"
            onDoubleClick={isGeneral ? undefined : startRenameCategory}
            title={isGeneral ? undefined : 'Double-click to rename'}
          >
            {isGeneral ? 'General' : category.name}
          </span>
        )}
        <span className="cat-count">{projects.length}</span>
        {!isGeneral && !renamingCategory && (
          <button
            className={`cat-delete-btn ${deleteCatConfirm ? 'confirm' : ''}`}
            onClick={handleDeleteCategory}
            title={deleteCatConfirm ? 'Click again to confirm — projects move to General' : 'Delete category'}
          >
            <Trash2 size={11} />
          </button>
        )}
      </div>

      {/* Project list */}
      {!isCollapsed && (
        <div className="cat-projects">
          {projects.length === 0 && (
            <div className="cat-empty">No projects</div>
          )}
          {projects.map(p => (
            <div
              key={p.id}
              className={`project-item ${p.id === activeProjectId ? 'active' : ''}`}
              onClick={() => onSelect(p.id)}
            >
              <div className="project-item-icon">
                {p.id === activeProjectId ? <FolderOpen size={14} /> : <Folder size={14} />}
              </div>
              <div className="project-item-info">
                {renamingProjectId === p.id ? (
                  <input
                    className="rename-input"
                    value={renameProjectValue}
                    onChange={e => setRenameProjectValue(e.target.value)}
                    onBlur={() => commitRenameProject(p.id)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') commitRenameProject(p.id);
                      if (e.key === 'Escape') setRenamingProjectId(null);
                    }}
                    onClick={e => e.stopPropagation()}
                    autoFocus
                  />
                ) : (
                  <div className="project-item-name" onDoubleClick={e => startRenameProject(e, p)}>
                    {p.name}
                  </div>
                )}
                {!p.envReady && <div className="env-badge">setting up…</div>}
              </div>

              {/* Move to category */}
              <div className="project-item-actions" onClick={e => e.stopPropagation()}>
                <div className="move-menu-wrap" ref={moveMenuProjectId === p.id ? moveMenuRef : null}>
                  <button
                    className="icon-action-btn"
                    title="Move to category"
                    onClick={e => { e.stopPropagation(); setMoveMenuProjectId(prev => prev === p.id ? null : p.id); }}
                  >
                    <MoreHorizontal size={12} />
                  </button>
                  {moveMenuProjectId === p.id && (
                    <div className="move-menu">
                      <div className="move-menu-label">Move to</div>
                      {moveTargets.map(t => (
                        <button
                          key={t.id ?? 'general'}
                          className={`move-menu-item ${(!p.categoryId && !t.id) || p.categoryId === t.id ? 'current' : ''}`}
                          onClick={() => { onMoveProject(p.id, t.id); setMoveMenuProjectId(null); }}
                        >
                          {t.id && <span className="move-dot" style={{ background: categories.find(c => c.id === t.id)?.color }} />}
                          {t.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <button
                  className={`delete-btn ${deleteProjectConfirm === p.id ? 'confirm' : ''}`}
                  onClick={e => handleDeleteProject(e, p.id)}
                  title={deleteProjectConfirm === p.id ? 'Click again to confirm' : 'Delete project'}
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
