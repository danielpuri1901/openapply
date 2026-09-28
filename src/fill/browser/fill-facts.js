// fill-facts.js - fills the FACT fields of a live application form: identity,
// current company, education, links, work authorization, relocation, EEO.
// It never writes prose. Anything it cannot answer comes back under TODO for a
// human or a golden answer to handle: essays, salary text it cannot parse,
// pronouns, video, comboboxes, radios inside the Ashby field wrapper.
//
// FACTS.textRules and FACTS.yesNoRules are generated from profile.md by
// facts.mjs, already ordered specific-first. This script only matches them
// against labels; it never invents an answer, and it never touches a field
// whose label matches FACTS.neverFill or the built-in consent/certify guard.
//
// Two traps this handles:
// - Ashby text fields save only on a bubbling focusout, so every set fires
//   focusin, input, change and focusout.
// - Ashby Yes/No buttons: a rapid synchronous click can paint "selected"
//   without saving it, so each answer clicks the OTHER button, waits, then the
//   intended one, and waits again.
// Run this with the tab in front - a background tab throttles the waits.
async (FACTS) => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const clean = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  const NEVER = /I certify|hereby certify|I confirm that all information|consent to be recorded|recording consent|arbitration|acknowledge|export.control/i;
  const isNeverFill = (label) => NEVER.test(label) || (FACTS.neverFill || []).some((p) => label.toLowerCase().includes(String(p).toLowerCase()));

  const setText = (e, v) => {
    const proto = e.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const set = Object.getOwnPropertyDescriptor(proto, 'value').set;
    e.focus();
    e.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    set.call(e, v + ' ');
    e.dispatchEvent(new Event('input', { bubbles: true }));
    set.call(e, v);
    e.dispatchEvent(new Event('input', { bubbles: true }));
    e.dispatchEvent(new Event('change', { bubbles: true }));
    e.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    e.blur();
  };

  const TEXT = (FACTS.textRules || []).map((r) => ({ re: new RegExp(r.source, r.flags), value: r.value }));
  const YESNO = (FACTS.yesNoRules || []).map((r) => ({ re: new RegExp(r.source, r.flags), value: r.value }));
  const EEO = FACTS.eeo || {};

  const done = [];
  const todo = [];

  const eeoTarget = (label) => {
    const l = label.toLowerCase();
    if (/gender/.test(l)) return EEO.gender;
    if (/race|ethnicity/.test(l)) return EEO.race;
    if (/hispanic|latino/.test(l)) return EEO.hispanic;
    if (/veteran/.test(l)) return EEO.veteran;
    if (/disab/.test(l)) return EEO.disability;
    return null;
  };

  const fillText = (e, label) => {
    if (isNeverFill(label)) return;
    const hit = TEXT.find((r) => r.re.test(label));
    if (!hit) { todo.push(`TEXT?:${label.slice(0, 60)}`); return; }
    setText(e, hit.value);
    done.push(`${label.slice(0, 25)}=${String(hit.value).slice(0, 22)}`);
  };

  const fillSelect = (sel, label) => {
    if (isNeverFill(label)) return;
    const target = eeoTarget(label);
    if (!target) { todo.push(`SELECT?:${label.slice(0, 50)}`); return; }
    const opt = [...sel.options].find((o) => clean(o.textContent).toLowerCase().includes(target.toLowerCase()));
    if (!opt) { todo.push(`SELECT-NOMATCH:${label.slice(0, 50)}`); return; }
    sel.value = opt.value;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    done.push(`${label.slice(0, 25)}=${target.slice(0, 22)}`);
  };

  const fillYesNoButtons = async (btns, label) => {
    const hit = YESNO.find((r) => r.re.test(label));
    if (!hit) { todo.push(`YN?:${label.slice(0, 70)}`); return; }
    const pick = (t) => btns.find((b) => clean(b.innerText).toLowerCase() === t.toLowerCase());
    pick(hit.value === 'Yes' ? 'No' : 'Yes').click();
    await sleep(350);
    pick(hit.value).click();
    await sleep(350);
    done.push(`YN ${label.slice(0, 35)}=${hit.value}`);
  };

  // 1. Ashby field-entry pass.
  for (const f of document.querySelectorAll('.ashby-application-form-field-entry')) {
    const label = clean((f.querySelector('label') || {}).innerText || '').replace(/\*/g, '');
    if (isNeverFill(label)) { todo.push(`NEVER_FILL:${label.slice(0, 50)}`); continue; }
    const btns = [...f.querySelectorAll('button')].filter((b) => /^(yes|no)$/i.test(clean(b.innerText)));
    if (btns.length === 2) { await fillYesNoButtons(btns, label); continue; }
    if (f.querySelector('input[type=radio]')) { todo.push(`RADIO:${label.slice(0, 50)}`); continue; }
    if (f.querySelector('input[type=file]')) continue;
    const sel = f.querySelector('select');
    if (sel) { fillSelect(sel, label); continue; }
    const e = f.querySelector('input[type=text],input[type=email],input[type=url],input[type=tel],input[type=number],textarea');
    if (!e) { todo.push(`OTHER:${label.slice(0, 50)}`); continue; }
    if (e.getAttribute('role') === 'combobox' || /start typing/i.test(e.placeholder || '')) { todo.push(`COMBO:${label.slice(0, 40)}`); continue; }
    fillText(e, label);
  }

  // 2. Generic pass: plain fields outside the Ashby container (Greenhouse, Lever, generic).
  document.querySelectorAll('input,textarea,select').forEach((e) => {
    if (e.closest('.ashby-application-form-field-entry')) return;
    if (['hidden', 'checkbox', 'radio', 'file', 'submit', 'button'].includes(e.type)) return;
    if (/recaptcha/i.test(e.name || e.id || '')) return;
    const label = clean((e.labels && e.labels[0] && e.labels[0].innerText) || e.getAttribute('aria-label') || e.placeholder || e.name || '');
    if (!label) return;
    if (e.tagName === 'SELECT') { fillSelect(e, label); return; }
    if (e.getAttribute('role') === 'combobox') { todo.push(`COMBO:${label.slice(0, 40)}`); return; }
    fillText(e, label);
  });

  // 3. Fieldsets outside the normal wrapper (multi-choice EEO or Yes/No questions).
  for (const fs of document.querySelectorAll('fieldset')) {
    if (fs.closest('.ashby-application-form-field-entry')) continue;
    const q = clean((fs.querySelector('legend,label') || {}).innerText || '');
    if (!q || isNeverFill(q)) { if (q) todo.push(`NEVER_FILL:${q.slice(0, 60)}`); continue; }
    const inputs = [...fs.querySelectorAll('input[type=radio],input[type=checkbox]')];
    if (!inputs.length || inputs.some((i) => i.checked)) continue;
    const eeoVal = eeoTarget(q);
    const ynHit = YESNO.find((r) => r.re.test(q));
    const optLabel = (i) => clean((i.labels && i.labels[0] && i.labels[0].innerText) || '');
    let target = null;
    if (eeoVal) target = inputs.find((i) => optLabel(i).toLowerCase().includes(eeoVal.toLowerCase()));
    else if (ynHit) target = inputs.find((i) => optLabel(i).toLowerCase().startsWith(ynHit.value.toLowerCase()));
    if (!target) { todo.push(`FIELDSET:${q.slice(0, 60)}`); continue; }
    target.click();
    await sleep(200);
    done.push(`FS ${q.slice(0, 35)}=${optLabel(target).slice(0, 25)}`);
  }

  return `${done.join(' | ')}\nTODO: ${todo.join(' | ') || 'none'}`;
}
