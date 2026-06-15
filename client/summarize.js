// Local prompt sanitizer — the privacy boundary of terminally.social.
//
// This is the ONLY code that ever touches your raw prompt, and it runs
// entirely on your machine (called by client/hook.js). Whatever this
// function returns is the only prompt-derived text that goes over the
// wire. The server (server/index.js) never receives the raw prompt.
//
// Strategy: keep only the first non-code line, then redact anything that
// looks like a credential, URL, email, or filesystem identity, then
// truncate hard. False positives (over-redaction) are acceptable;
// false negatives are not.

const MAX_LEN = 80

const REDACTIONS = [
  // URLs and emails
  [/https?:\/\/\S+/gi, '[link]'],
  [/\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g, '[email]'],
  // well-known credential shapes
  [/\b(?:sk|pk|rk|sk-ant)-[A-Za-z0-9_-]{6,}\b/g, '[redacted]'],
  [/\b(?:gh[pousr]|github_pat)_[A-Za-z0-9_]{8,}\b/g, '[redacted]'],
  [/\bAKIA[0-9A-Z]{10,}\b/g, '[redacted]'],
  [/\bxox[baprs]-[A-Za-z0-9-]{8,}\b/g, '[redacted]'],
  [/\beyJ[A-Za-z0-9_-]{10,}(?:\.[A-Za-z0-9_-]+){0,2}\b/g, '[redacted]'],
  // anything assigned to a secret-sounding name: KEY=..., "token": "...", password: ...
  [
    /([\w-]*(?:key|token|secret|password|passwd|pwd|credential|bearer|authorization)[\w-]*\s*[:=]+\s*)(["']?)\S+\2/gi,
    '$1[redacted]',
  ],
  // secrets stated in prose: "password is hunter2", "api key abc123", "token -> x"
  [
    /\b((?:password|passwd|pwd|secret|token|credential|bearer|api[\s_-]?key|access[\s_-]?key|api[\s_-]?token)\b\s*(?:is|are|was|=|:|->)?\s*)(\S+)/gi,
    '$1[redacted]',
  ],
  // long opaque blobs (hex, base64) that survived the above
  [/\b[A-Fa-f0-9]{16,}\b/g, '[redacted]'],
  [/\b[A-Za-z0-9+/_-]{32,}={0,2}\b/g, '[redacted]'],
  // mixed letter+digit runs >=16 (ids/keys; ordinary words don't mix in digits)
  [/\b(?=[A-Za-z0-9_-]*\d)(?=[A-Za-z0-9_-]*[A-Za-z])[A-Za-z0-9_-]{16,}\b/g, '[redacted]'],
  // long digit runs (account ids, card-ish numbers)
  [/\b\d{12,}\b/g, '[redacted]'],
  // filesystem identity — home, Windows, and system paths
  [/\/(?:Users|home)\/[\w.-]+/g, '~'],
  [/[A-Za-z]:\\[^\s]+/g, '[path]'],
  [/\/(?:etc|var|opt|usr|tmp|root|srv|private|bin|sbin|lib|boot|dev|proc|sys)\/\S*/g, '[path]'],
]

export function summarize(prompt, maxLen = MAX_LEN) {
  if (typeof prompt !== 'string') return null

  // drop fenced code blocks entirely (incl. an unterminated trailing fence)
  let text = prompt.replace(/```[\s\S]*?(?:```|$)/g, ' ')
  // drop inline code spans — paths, snippets, and ids live there
  text = text.replace(/`[^`\n]*`/g, ' ')

  const line = text
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.length > 0)
  if (!line) return null

  let s = line
  for (const [pattern, replacement] of REDACTIONS) s = s.replace(pattern, replacement)
  s = s.replace(/\s+/g, ' ').trim()

  if (s.length > maxLen) s = s.slice(0, maxLen - 1).trimEnd() + '…'
  return s || null
}
