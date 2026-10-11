// The sensitive-info guard: nothing that could hurt the business if this app
// ever leaked. The page runs it as you type and before saving; the Worker runs
// it again on every write, so the rule holds even if the page is bypassed.
// It catches patterns, not meaning: a net for slips, not a guarantee.

export const RULES = [
  { kind: 'an amount of money', re: /[€$£¥]\s?\d[\d.,]*\s?(k|m|mln|bn)?\b|\d[\d.,]*\s?(k|m)?\s?[€$£¥]|\b(eur|usd|gbp|chf)\s?\d[\d.,]*\s?(k|m|mln|bn)?\b|\b\d[\d.,]*\s?(k|m|mln|bn|million|thousand)?\s?(eur|euros?|usd|dollars?|gbp|pounds|chf)\b|\b\d+([.,]\d+)?\s?(k|mln|bn)\b/i, tip: 'leave the amount out: "over plan", "a real saving"' },
  { kind: 'a price or rate', re: /\b(price|pricing|cost|quote|increase|discount|rate|fee|spend|budget|margin|revenue|raise|savings?|saved)\b[^.;]{0,30}?\d+([.,]\d+)?\s?%|\d+([.,]\d+)?\s?%[^.;]{0,25}?\b(price|pricing|cost|quote|increase|discount|rate|fee|budget|margin|revenue|raise|up|cheaper|saved|savings)\b/i, tip: 'say "higher than planned" instead of the number' },
  { kind: 'contract terms', re: /\b(clauses?|penalt(y|ies)|termination|notice period|liabilit(y|ies)|exclusivity|indemnit\w*|nda|contract value|renewal (price|terms)|sla credits?|break fee|payment terms)\b/i, tip: 'keep it to "renewal coming up"; the terms stay in the contract system' },
  { kind: 'pay details', re: /\b(salar(y|ies)|bonus(es)?|pay ?(rise|raise)|compensation|comp band|salary band|pay grade|stock options|equity grant)\b/i, tip: 'write "talked about pay", without numbers or bands' },
  { kind: 'health details', re: /\b(sick(ness)?|illness|diagnos\w*|burn-?out|therap(y|ist)|medical|medication|pregnan\w*|surgery|mental health|depress\w*)\b/i, tip: 'write "personal situation" or "out for a while"' },
  { kind: 'an HR or legal case', re: /\b(pip|performance improvement plan|disciplinary|dismissal|fired|grievance|lawsuit|legal case|lawyer|harass\w*)\b/i, tip: 'write "a difficult conversation"; the case stays with HR' },
  { kind: 'a password or key', re: /\b(password|passwd|api[ _-]?key|secret|token)\s*[:=]|\b(sk-[a-z0-9]{10,}|akia[0-9a-z]{12,}|ghp_[a-z0-9]{20,})/i, tip: 'never store secrets here' },
  { kind: 'contact or bank details', re: /[\w.+-]+@[\w-]+\.[a-z]{2,}|(\+|00)\d[\d\s-]{7,}\d|\b[a-z]{2}\d{2}\s?[a-z]{4}\s?\d{4}\s?\d{4}/i, tip: 'leave out emails, phone numbers and bank details' }
];
export const KEEP_OUT = { kind: 'a word on your keep-out list', tip: 'leave it out (the list is in Manage)' };

// The pattern rules alone (no keep-out words): synchronous.
export function scan(text) {
  if (!text) return [];
  const hits = [];
  for (const r of RULES) { const m = String(text).match(r.re); if (m) hits.push({ kind: r.kind, tip: r.tip, found: m[0].trim() }); }
  return hits;
}

// ---- keep-out words: stored only as fingerprints ----
// A keep-out word is one to three words. Text is matched by fingerprinting
// every run of one to three words in it, so the list itself gives nothing away.
export const words = text => String(text || '').toLowerCase().normalize('NFKC').match(/[\p{L}\p{N}]+(?:['’&.-][\p{L}\p{N}]+)*/gu) || [];
export const normalizeWord = w => words(w).join(' ');
export const MAX_WORDS = 3;
export async function fingerprint(salt, phrase) {
  const data = new TextEncoder().encode(`${salt}|${phrase}`);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('');
}
// "Acme Corp" → "A•••••••p": enough to recognise, not to read.
export const mask = w => { const s = String(w).trim(); return s.length <= 2 ? '•'.repeat(s.length) : s[0] + '•'.repeat(Math.max(2, s.length - 2)) + s.at(-1); };

async function keepOutHits(text, salt, hashes) {
  if (!hashes || !hashes.size || !salt) return [];
  const ws = words(text), found = [];
  for (let n = 1; n <= MAX_WORDS; n++) {
    for (let i = 0; i + n <= ws.length; i++) {
      const phrase = ws.slice(i, i + n).join(' ');
      if (hashes.has(await fingerprint(salt, phrase))) found.push(phrase);
    }
  }
  return [...new Set(found)].map(f => ({ ...KEEP_OUT, found: f }));
}

// Everything: pattern rules and keep-out words. keepOut = { salt, hashes: Set }.
export async function check(text, keepOut = {}) {
  if (!text) return [];
  return [...scan(text), ...(await keepOutHits(text, keepOut.salt, keepOut.hashes))];
}

// The message shown with a hit, the same on the page and in Worker refusals.
export const say = h => `"${h.found}" looks like ${h.kind}. Please ${h.tip}.`;
