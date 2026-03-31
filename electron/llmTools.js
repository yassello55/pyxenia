/**
 * LLM Tool definitions and executor.
 * Tools are scoped to read-only access within the projects directory.
 */
const path = require('path');
const fs = require('fs');
const os = require('os');

const DATA_DIR = path.join(os.homedir(), '.pyxenia');
const PROJECTS_DIR = path.join(DATA_DIR, 'projects');
const PROJECTS_FILE = path.join(DATA_DIR, 'projects.json');

function isPathAllowed(filePath) {
  if (!filePath || typeof filePath !== 'string') return false;
  try {
    const resolved = fs.existsSync(filePath)
      ? fs.realpathSync(filePath)
      : path.resolve(filePath);
    const allowedBase = fs.existsSync(PROJECTS_DIR)
      ? fs.realpathSync(PROJECTS_DIR)
      : path.resolve(PROJECTS_DIR);
    return resolved === allowedBase || resolved.startsWith(allowedBase + path.sep);
  } catch { return false; }
}

function loadProjects() {
  try {
    if (!fs.existsSync(PROJECTS_FILE)) return [];
    const parsed = JSON.parse(fs.readFileSync(PROJECTS_FILE, 'utf8'));
    return Array.isArray(parsed) ? parsed : (parsed.projects || []);
  } catch { return []; }
}

// ─── Tool schemas (provider-agnostic) ────────────────────────────────────────

const TOOL_DEFS = [
  {
    name: 'list_scripts',
    description: 'List all Python scripts in a project. Returns script names, IDs, and file paths.',
    input_schema: {
      type: 'object',
      properties: {
        project_id: { type: 'string', description: 'The project ID (e.g. proj_1234567890)' },
      },
      required: ['project_id'],
    },
  },
  {
    name: 'read_script',
    description: 'Read the source code of a Python script.',
    input_schema: {
      type: 'object',
      properties: {
        project_id: { type: 'string', description: 'The project ID' },
        script_id:  { type: 'string', description: 'The script ID (e.g. script_1234567890)' },
      },
      required: ['project_id', 'script_id'],
    },
  },
  {
    name: 'list_output_files',
    description: 'List output/generated files produced by a script (CSVs, JSONs, images, etc.).',
    input_schema: {
      type: 'object',
      properties: {
        project_id: { type: 'string' },
        script_id:  { type: 'string' },
      },
      required: ['project_id', 'script_id'],
    },
  },
  {
    name: 'read_file_content',
    description: 'Read the text content of an output file (CSV, JSON, TXT, etc.). Binary files like images or Excel are not readable this way.',
    input_schema: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'Absolute path to the file (must be inside projects directory)' },
      },
      required: ['file_path'],
    },
  },
];

// ─── Tool executor ────────────────────────────────────────────────────────────

async function executeTool(name, input) {
  try {
    switch (name) {
      case 'list_scripts': {
        const projects = loadProjects();
        const project = projects.find(p => p.id === input.project_id);
        if (!project) return { error: 'Project not found' };
        return (project.scripts || []).map(s => ({
          id: s.id,
          name: s.name,
          file_path: s.filePath,
          updated_at: s.updatedAt,
        }));
      }

      case 'read_script': {
        const projects = loadProjects();
        const project = projects.find(p => p.id === input.project_id);
        if (!project) return { error: 'Project not found' };
        const script = (project.scripts || []).find(s => s.id === input.script_id);
        if (!script) return { error: 'Script not found' };
        if (!isPathAllowed(script.filePath)) return { error: 'Access denied' };
        if (!fs.existsSync(script.filePath)) return { error: 'File not found on disk' };
        const code = fs.readFileSync(script.filePath, 'utf8');
        return { name: script.name, code, lines: code.split('\n').length };
      }

      case 'list_output_files': {
        const projects = loadProjects();
        const project = projects.find(p => p.id === input.project_id);
        if (!project) return { error: 'Project not found' };
        const script = (project.scripts || []).find(s => s.id === input.script_id);
        if (!script) return { error: 'Script not found' };
        const dir = path.join(path.dirname(script.filePath), script.id);
        if (!isPathAllowed(dir) || !fs.existsSync(dir)) return [];
        return fs.readdirSync(dir)
          .filter(f => !f.endsWith('.py'))
          .map(f => {
            const full = path.join(dir, f);
            if (!isPathAllowed(full)) return null;
            const stat = fs.statSync(full);
            return { name: f, path: full, size: stat.size, modified: stat.mtime.toISOString() };
          })
          .filter(Boolean)
          .sort((a, b) => new Date(b.modified) - new Date(a.modified));
      }

      case 'read_file_content': {
        const filePath = input.file_path;
        if (!isPathAllowed(filePath)) return { error: 'Access denied: path outside projects directory' };
        if (!fs.existsSync(filePath)) return { error: 'File not found' };
        const ext = path.extname(filePath).toLowerCase();
        const BINARY = ['.xlsx', '.xls', '.pdf', '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp'];
        if (BINARY.includes(ext)) return { error: `Cannot read binary file (${ext}). Use list_output_files to see it exists.` };
        const stat = fs.statSync(filePath);
        if (stat.size > 200 * 1024) return { error: 'File too large to read (> 200 KB). Consider reading a smaller file.' };
        return { content: fs.readFileSync(filePath, 'utf8') };
      }

      default:
        return { error: `Unknown tool: ${name}` };
    }
  } catch (err) {
    return { error: err.message };
  }
}

module.exports = { TOOL_DEFS, executeTool };
