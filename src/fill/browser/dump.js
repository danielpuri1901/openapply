// dump.js - the one read-back snippet, for surveying a form before filling and
// for the readback verify.mjs consumes after filling. Same script both times;
// a survey and a readback of a filled form differ only in when you run it.
//
// Read-back rules baked in:
//   - Ashby Yes/No BUTTON pairs: .checked lies, selection is the background colour.
//   - real input[type=radio]: .value is "on" on every option, read .checked.
//   - react-select comboboxes: the committed value is rendered text, not .value.
//
// Long free text is matched against FACTS.banned INSIDE the page and only the
// hits come back, never the raw text - a long answer can get clipped on the
// way out, and a clipped dump used to make the forbidden-fact check see nothing.
async (FACTS) => {
  const BANNED = FACTS.banned || [];
  const clean = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  const labelOf = (e) => clean((e.labels && e.labels[0] && e.labels[0].innerText) || e.getAttribute('aria-label') || e.placeholder || e.name || '');
  const fields = [];
  const seen = new Set();
  const choices = [];

  document.querySelectorAll('input[type=checkbox]').forEach((cb) => {
    const host = cb.closest('div') && cb.closest('div').parentElement;
    if (!host) return;
    const btns = Array.from(host.querySelectorAll('button'));
    if (btns.length === 2 && /^(yes|no)$/i.test(clean(btns[0].innerText))) {
      if (seen.has(host)) return;
      seen.add(host);
      choices.push({
        kind: 'yesno-button',
        question: clean(host.innerText).slice(0, 110),
        selected: btns.filter((b) => getComputedStyle(b).backgroundColor !== 'rgba(0, 0, 0, 0)').map((b) => clean(b.innerText)),
        required: /\*/.test(host.innerText || ''),
      });
    } else {
      fields.push({ kind: 'checkbox', label: labelOf(cb).slice(0, 60), value: cb.checked ? 'checked' : '', required: false });
    }
  });

  const byName = {};
  document.querySelectorAll('input[type=radio]').forEach((r) => { (byName[r.name || '(u)'] = byName[r.name || '(u)'] || []).push(r); });
  Object.values(byName).forEach((g) => {
    let host = g[0].parentElement;
    for (let i = 0; i < 8 && host; i++) { if (host.innerText && host.innerText.length > 60) break; host = host.parentElement; }
    choices.push({
      kind: 'radio',
      question: clean(host && host.innerText).slice(0, 110),
      selected: g.filter((r) => r.checked).map((r) => clean(r.labels && r.labels[0] && r.labels[0].innerText).slice(0, 60)),
      required: /\*/.test((host && host.innerText) || ''),
    });
  });

  document.querySelectorAll('input,textarea,select').forEach((e) => {
    if (e.type === 'hidden' || e.type === 'checkbox' || e.type === 'radio') return;
    if (/recaptcha/i.test(e.name || '')) return;
    const kind = e.tagName === 'TEXTAREA' ? 'textarea' : (e.tagName === 'SELECT' ? 'select' : e.type);
    const value = e.type === 'file' ? (e.files && e.files[0] ? e.files[0].name : '') : String(e.value || '');
    const required = !!e.required || /\*/.test(clean(e.closest('div') && e.closest('div').innerText).slice(0, 120));
    const label = labelOf(e).slice(0, 55);
    if ((kind === 'textarea' || kind === 'text') && value.length > 120) {
      const low = value.toLowerCase();
      fields.push({ kind, label, required, value: '', length: value.length, hits: BANNED.filter((b) => low.includes(String(b.t).toLowerCase())).map((b) => b.l + ':' + b.t) });
    } else {
      fields.push({ kind, label, value, required });
    }
  });

  const combos = Array.from(document.querySelectorAll('[class*=singleValue],[class*=single-value]')).map((x) => clean(x.innerText)).filter(Boolean);
  return JSON.stringify({ url: location.pathname, city: FACTS.city || null, fields, choices, combos });
}
