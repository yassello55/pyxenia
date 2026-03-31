import React, { useState, useEffect, useRef, createContext } from 'react';
import Sidebar from './components/Sidebar';
import ProjectView from './components/ProjectView';
import WelcomeScreen from './components/WelcomeScreen';
import SettingsPanel from './components/SettingsPanel';
import AboutModal from './components/AboutModal';
import ChatPanel from './components/ChatPanel';
import { useSettings } from './hooks/useSettings';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import './App.css';

export const SettingsContext = createContext({});

export default function App() {
  const [projects, setProjects] = useState([]);
  const [categories, setCategories] = useState([]);
  const [activeProjectId, setActiveProjectId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [chatWidth, setChatWidth] = useState(400);
  const [activeScriptCtx, setActiveScriptCtx] = useState(null); // { script, project, code }
  const [debugMessage, setDebugMessage] = useState(null);
  const isResizingChat = useRef(false);
  const { settings, updateSettings } = useSettings();

  const handleChatResizeStart = (e) => {
    e.preventDefault();
    isResizingChat.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    const onMove = (ev) => {
      if (!isResizingChat.current) return;
      // The handle is the left edge of the chat panel; distance from right edge of window
      const newWidth = window.innerWidth - ev.clientX;
      setChatWidth(Math.min(700, Math.max(280, newWidth)));
    };
    const onUp = () => {
      isResizingChat.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const api = window.pyxenia;

  const refresh = async () => {
    const data = await api.getProjects();
    setProjects(data.projects || []);
    setCategories(data.categories || []);
  };

  useEffect(() => {
    refresh().finally(() => setLoading(false));

    const unsubReady  = api.onEnvReady((id) => {
      setProjects(prev => prev.map(p =>
        p.id === id ? { ...p, envReady: true, envError: null, envStatus: 'Ready' } : p
      ));
    });

    const unsubError  = api.onEnvError(({ id, message }) => {
      setProjects(prev => prev.map(p =>
        p.id === id ? { ...p, envReady: false, envError: message, envStatus: null } : p
      ));
    });

    const unsubStatus = api.onEnvStatus(({ id, message }) => {
      setProjects(prev => prev.map(p =>
        p.id === id ? { ...p, envStatus: message } : p
      ));
    });

    return () => { unsubReady(); unsubError(); unsubStatus(); };
  }, []);

  useKeyboardShortcuts([
    { key: ',', ctrl: true, action: () => setShowSettings(p => !p) },
  ], []);

  const handleCreateProject = async (name, description) => {
    const p = await api.createProject({ name, description });
    setProjects(prev => [...prev, p]);
    setActiveProjectId(p.id);
  };

  const handleDeleteProject = async (id) => {
    await api.deleteProject(id);
    setProjects(prev => prev.filter(p => p.id !== id));
    if (activeProjectId === id) setActiveProjectId(null);
  };

  const handleRenameProject = async (id, name) => {
    const updated = await api.updateProject({ id, name });
    if (updated) setProjects(prev => prev.map(p => p.id === id ? { ...p, name } : p));
  };

  const handleCreateCategory = async (name, color) => {
    const cat = await api.createCategory({ name, color });
    if (cat) setCategories(prev => [...prev, cat]);
  };

  const handleRenameCategory = async (id, name) => {
    const updated = await api.renameCategory({ id, name });
    if (updated) setCategories(prev => prev.map(c => c.id === id ? { ...c, name } : c));
  };

  const handleDeleteCategory = async (id) => {
    await api.deleteCategory(id);
    setCategories(prev => prev.filter(c => c.id !== id));
    setProjects(prev => prev.map(p => p.categoryId === id ? { ...p, categoryId: null } : p));
  };

  const handleMoveProject = async (projectId, categoryId) => {
    const updated = await api.moveProjectToCategory({ projectId, categoryId });
    if (updated) setProjects(prev => prev.map(p => p.id === projectId ? { ...p, categoryId: categoryId || null } : p));
  };

  const activeProject = projects.find(p => p.id === activeProjectId);

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', background:'var(--bg)' }}>
      <div style={{ textAlign:'center' }}>
        <div style={{ fontSize:36, marginBottom:14 }}>⚡</div>
        <div style={{ fontFamily:'var(--font)', fontSize:14, color:'var(--text2)' }}>Loading Pyxenia…</div>
      </div>
    </div>
  );

  return (
    <SettingsContext.Provider value={{ settings, updateSettings }}>
      <div className="app-layout">
        <Sidebar
          projects={projects}
          categories={categories}
          activeProjectId={activeProjectId}
          onSelect={setActiveProjectId}
          onCreateProject={handleCreateProject}
          onDeleteProject={handleDeleteProject}
          onRenameProject={handleRenameProject}
          onCreateCategory={handleCreateCategory}
          onRenameCategory={handleRenameCategory}
          onDeleteCategory={handleDeleteCategory}
          onMoveProject={handleMoveProject}
          onOpenSettings={() => setShowSettings(true)}
          onOpenAbout={() => setShowAbout(true)}
          onNewChat={() => { setActiveProjectId(null); setShowChat(true); }}
        />
        <main className={`app-main ${showChat && activeProject ? 'app-main--split' : ''}`}>
          {/* When chat is open with no active project → full-page chat */}
          {showChat && !activeProject ? (
            <ChatPanel
              onClose={() => setShowChat(false)}
              activeProject={null}
              activeScript={null}
              debugMessage={debugMessage}
              onDebugMessageUsed={() => setDebugMessage(null)}
              onOpenSettings={() => setShowSettings(true)}
            />
          ) : (
            <>
              {/* Project / Welcome area */}
              <div className="app-content">
                {activeProject ? (
                  <ProjectView
                    key={activeProject.id}
                    project={activeProject}
                    onProjectUpdate={(updated) => setProjects(prev => prev.map(p => p.id === updated.id ? updated : p))}
                    showChat={showChat}
                    onToggleChat={() => setShowChat(p => !p)}
                    onActiveScriptChange={setActiveScriptCtx}
                    onDebugWithAI={(summary, script, project) => {
                      setDebugMessage({ summary, script, project });
                      setShowChat(true);
                    }}
                  />
                ) : (
                  <WelcomeScreen onCreateProject={handleCreateProject} />
                )}
              </div>
              {/* Resizable chat panel */}
              {showChat && activeProject && (
                <>
                  <div className="chat-resize-handle" onMouseDown={handleChatResizeStart} />
                  <div className="app-chat-panel" style={{ width: chatWidth }}>
                    <ChatPanel
                      onClose={() => setShowChat(false)}
                      activeProject={activeProject}
                      activeScript={activeScriptCtx?.script || null}
                      activeScriptCode={activeScriptCtx?.code || ''}
                      debugMessage={debugMessage}
                      onDebugMessageUsed={() => setDebugMessage(null)}
                      onOpenSettings={() => setShowSettings(true)}
                    />
                  </div>
                </>
              )}
            </>
          )}
        </main>
        {showSettings && (
          <SettingsPanel
            onClose={() => setShowSettings(false)}
            onSettingsChange={updateSettings}
          />
        )}
        {showAbout && <AboutModal onClose={() => setShowAbout(false)} />}
      </div>
    </SettingsContext.Provider>
  );
}
