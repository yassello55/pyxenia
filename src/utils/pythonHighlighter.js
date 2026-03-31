/**
 * Lightweight Python syntax highlighter
 * Tokenizes Python source and returns an array of {text, type} tokens
 */

const KEYWORDS = new Set([
  'False','None','True','and','as','assert','async','await',
  'break','class','continue','def','del','elif','else','except',
  'finally','for','from','global','if','import','in','is',
  'lambda','nonlocal','not','or','pass','raise','return',
  'try','while','with','yield'
]);

const BUILTINS = new Set([
  'print','len','range','int','float','str','bool','list','dict',
  'tuple','set','type','isinstance','hasattr','getattr','setattr',
  'input','open','enumerate','zip','map','filter','sorted','reversed',
  'sum','min','max','abs','round','repr','format','id','hash',
  'iter','next','any','all','callable','vars','dir','help',
  'super','object','property','staticmethod','classmethod',
  'Exception','ValueError','TypeError','KeyError','IndexError',
  'FileNotFoundError','OSError','RuntimeError','StopIteration',
  'AttributeError','ImportError','NameError','NotImplementedError'
]);

export function tokenizePython(code) {
  const tokens = [];
  let i = 0;
  const len = code.length;

  while (i < len) {
    const ch = code[i];

    // Newline
    if (ch === '\n') { tokens.push({ text: '\n', type: 'plain' }); i++; continue; }

    // Triple-quoted strings
    if ((code.startsWith('"""', i) || code.startsWith("'''", i))) {
      const q = code.slice(i, i+3);
      let end = code.indexOf(q, i+3);
      if (end === -1) end = len - 3;
      tokens.push({ text: code.slice(i, end+3), type: 'string' });
      i = end + 3;
      continue;
    }

    // Single-quoted strings
    if (ch === '"' || ch === "'") {
      let j = i + 1;
      while (j < len && code[j] !== ch && code[j] !== '\n') {
        if (code[j] === '\\') j++;
        j++;
      }
      tokens.push({ text: code.slice(i, j+1), type: 'string' });
      i = j + 1;
      continue;
    }

    // Comments
    if (ch === '#') {
      let j = i;
      while (j < len && code[j] !== '\n') j++;
      tokens.push({ text: code.slice(i, j), type: 'comment' });
      i = j;
      continue;
    }

    // Numbers
    if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(code[i+1]))) {
      let j = i;
      while (j < len && /[0-9._eExXbBoOa-fA-FjJ]/.test(code[j])) j++;
      tokens.push({ text: code.slice(i, j), type: 'number' });
      i = j;
      continue;
    }

    // Identifiers / keywords / builtins
    if (/[a-zA-Z_]/.test(ch)) {
      let j = i;
      while (j < len && /[a-zA-Z0-9_]/.test(code[j])) j++;
      const word = code.slice(i, j);
      let type = 'plain';
      if (KEYWORDS.has(word)) type = 'keyword';
      else if (BUILTINS.has(word)) type = 'builtin';
      else if (code[j] === '(') type = 'func';
      else if (word === word.toUpperCase() && word.length > 1) type = 'constant';
      tokens.push({ text: word, type });
      i = j;
      continue;
    }

    // Decorators
    if (ch === '@') {
      let j = i + 1;
      while (j < len && /[a-zA-Z0-9_.]/.test(code[j])) j++;
      tokens.push({ text: code.slice(i, j), type: 'decorator' });
      i = j;
      continue;
    }

    // Operators
    if (/[+\-*/%=<>!&|^~]/.test(ch)) {
      let j = i;
      while (j < len && /[+\-*/%=<>!&|^~]/.test(code[j])) j++;
      tokens.push({ text: code.slice(i, j), type: 'operator' });
      i = j;
      continue;
    }

    // Brackets / punctuation
    if (/[()[\]{},.:;]/.test(ch)) {
      tokens.push({ text: ch, type: /[()[\]{}]/.test(ch) ? 'bracket' : 'punct' });
      i++;
      continue;
    }

    // Whitespace
    if (/[ \t]/.test(ch)) {
      let j = i;
      while (j < len && /[ \t]/.test(code[j])) j++;
      tokens.push({ text: code.slice(i, j), type: 'plain' });
      i = j;
      continue;
    }

    // Fallback
    tokens.push({ text: ch, type: 'plain' });
    i++;
  }

  return tokens;
}

export const TOKEN_COLORS = {
  keyword:   'var(--tok-keyword)',
  string:    'var(--tok-string)',
  comment:   'var(--tok-comment)',
  number:    'var(--tok-number)',
  builtin:   'var(--tok-builtin)',
  func:      'var(--tok-func)',
  decorator: 'var(--tok-decorator)',
  operator:  'var(--tok-operator)',
  bracket:   'var(--tok-bracket)',
  constant:  'var(--tok-constant)',
  punct:     'var(--tok-punct)',
  plain:     'var(--tok-plain)',
};
