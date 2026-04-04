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
  {
    name: 'patch_script',
    description: 'Apply targeted find-and-replace edits to a Python script WITHOUT rewriting the whole file. Use this for any modification — it is much faster and safer than write_script for large files. Each patch replaces an exact block of existing code with new code. IMPORTANT: old_code must match the current file exactly (including indentation and whitespace).',
    input_schema: {
      type: 'object',
      properties: {
        project_id: { type: 'string', description: 'The project ID' },
        script_id:  { type: 'string', description: 'The script ID' },
        patches: {
          type: 'array',
          description: 'List of replacements to apply in order. Each patch has old_code (exact text to find) and new_code (text to replace it with).',
          items: {
            type: 'object',
            properties: {
              old_code: { type: 'string', description: 'The exact existing code to find and replace. Must match precisely.' },
              new_code: { type: 'string', description: 'The new code to replace it with.' },
            },
            required: ['old_code', 'new_code'],
          },
        },
      },
      required: ['project_id', 'script_id', 'patches'],
    },
  },
  {
    name: 'write_script',
    description: 'Overwrite the ENTIRE script with new content. Only use this when creating a script from scratch or when the changes are so extensive that patch_script would require more than 10 patches. For any modification to an existing script, prefer patch_script instead.',
    input_schema: {
      type: 'object',
      properties: {
        project_id: { type: 'string', description: 'The project ID' },
        script_id:  { type: 'string', description: 'The script ID' },
        code:       { type: 'string', description: 'The complete updated Python source code to write to the file' },
      },
      required: ['project_id', 'script_id', 'code'],
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

      case 'patch_script': {
        const projects = loadProjects();
        const project = projects.find(p => p.id === input.project_id);
        if (!project) return { error: 'Project not found' };
        const script = (project.scripts || []).find(s => s.id === input.script_id);
        if (!script) return { error: 'Script not found' };
        if (!isPathAllowed(script.filePath)) return { error: 'Access denied' };
        if (!Array.isArray(input.patches) || input.patches.length === 0) return { error: 'patches must be a non-empty array' };

        let code = fs.readFileSync(script.filePath, 'utf8');
        const results = [];
        for (const patch of input.patches) {
          const { old_code, new_code } = patch;
          if (typeof old_code !== 'string' || typeof new_code !== 'string') {
            results.push({ ok: false, error: 'Each patch needs old_code and new_code strings' });
            continue;
          }
          if (!code.includes(old_code)) {
            results.push({ ok: false, error: `old_code not found in file: ${old_code.slice(0, 60)}…` });
            continue;
          }
          code = code.replace(old_code, new_code);
          results.push({ ok: true });
        }
        const failed = results.filter(r => !r.ok);
        // Only write file if at least one patch was applied
        if (results.some(r => r.ok)) {
          fs.writeFileSync(script.filePath, code, 'utf8');
        }
        return {
          success: failed.length === 0,
          applied: results.filter(r => r.ok).length,
          failed: failed.length,
          // Always include errors so LLM cannot miss them
          errors: failed.length > 0 ? failed.map(r => r.error) : undefined,
          lines: code.split('\n').length,
          // Explicit instruction in response when patches fail
          ...(failed.length > 0 && {
            action_required: 'Some patches failed. Use read_script to re-read the current code, find the exact text, and retry patch_script with corrected old_code values.',
          }),
        };
      }

      case 'write_script': {
        const projects = loadProjects();
        const project = projects.find(p => p.id === input.project_id);
        if (!project) return { error: 'Project not found' };
        const script = (project.scripts || []).find(s => s.id === input.script_id);
        if (!script) return { error: 'Script not found' };
        if (!isPathAllowed(script.filePath)) return { error: 'Access denied' };
        if (typeof input.code !== 'string') return { error: 'code must be a string' };
        fs.writeFileSync(script.filePath, input.code, 'utf8');
        return { success: true, lines: input.code.split('\n').length };
      }

      default:
        return { error: `Unknown tool: ${name}` };
    }
  } catch (err) {
    return { error: err.message };
  }
}

module.exports = { TOOL_DEFS, executeTool };
