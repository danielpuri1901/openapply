// commit.js - paste into the page right before Submit, on every Ashby form.
//
// Ashby only saves some fields into its own form state when React's onBlur
// fires, and React listens for the bubbling `focusout` event, not `blur`. A
// value set by script (native setter + input/change/blur) shows in the DOM AND
// in React's own props, yet the form can still report a required field as
// missing. A required field fails safe because Ashby blocks the submit; an
// optional field fails silent and submits empty. So a DOM readback is not
// proof that a value was saved. This script is.
//
// For every filled text-like field it focuses, re-sets the value through the
// native setter (a one-character change first, so React's value tracker sees a
// real change), fires input and change, then fires focusin and focusout so the
// blur handler commits it. Returns "<field>:<length>" for each field touched.
async (_FACTS) => {
  const sel = ['text', 'email', 'url', 'tel', 'number']
    .map((t) => `.ashby-application-form-field-entry input[type=${t}]`)
    .concat('.ashby-application-form-field-entry textarea')
    .join(',');
  const out = [];
  document.querySelectorAll(sel).forEach((e) => {
    if (!e.value || e.getAttribute('role') === 'combobox' || /start typing/i.test(e.placeholder || '')) return;
    const v = e.value;
    const proto = e.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setValue = Object.getOwnPropertyDescriptor(proto, 'value').set;
    e.focus();
    e.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    setValue.call(e, v + ' ');
    e.dispatchEvent(new Event('input', { bubbles: true }));
    setValue.call(e, v);
    e.dispatchEvent(new Event('input', { bubbles: true }));
    e.dispatchEvent(new Event('change', { bubbles: true }));
    e.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    e.blur();
    out.push(`${(e.name || e.id || '').slice(0, 12)}:${v.length}`);
  });
  return out.join(' ');
}
