const bindings = {
  KeyW: 'forward', ArrowUp: 'forward', KeyS: 'backward', ArrowDown: 'backward',
  KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
  Space: 'primary', ShiftLeft: 'secondary', ShiftRight: 'secondary',
};

export function createInput(canvas, panel, { isControl, onInput, onReset, onInspectKey, onPause }) {
  const sources = new Map();
  let primaryPressed = false;
  const buttons = [...panel.querySelectorAll('[data-control]')];
  const active = action => [...sources.values()].includes(action);
  function paint() {
    for (const button of buttons) button.setAttribute('aria-pressed', String(active(button.dataset.control)));
  }
  function press(source, action) {
    if (sources.has(source)) return;
    if (action === 'primary' && !active('primary')) primaryPressed = true;
    sources.set(source, action);
    paint();
    onInput();
  }
  function release(source) { sources.delete(source); paint(); }
  function clear() { sources.clear(); primaryPressed = false; paint(); }
  function keydown(event) {
    if (event.code === 'KeyR') { event.preventDefault(); if (!event.repeat) onReset(); return; }
    if (isControl() && bindings[event.code]) {
      event.preventDefault();
      if (!event.repeat) press(`key:${event.code}`, bindings[event.code]);
    } else onInspectKey(event);
  }
  function keyup(event) { release(`key:${event.code}`); }
  function canvasBlur(event) {
    for (const source of [...sources.keys()]) if (source.startsWith('key:')) release(source);
    primaryPressed = false;
    if (!event.relatedTarget?.closest('.simulation')) onPause();
  }
  function windowBlur() { clear(); onPause(); }
  function pointerdown(event) {
    const button = event.target.closest('[data-control]');
    if (!button || button.disabled || !isControl() || event.button !== 0) return;
    event.preventDefault();
    // Focus before registering this press: leaving a keyboard-operated panel
    // clears its old inputs, but must not erase the new pointer input.
    canvas.focus({ preventScroll: true });
    button.setPointerCapture(event.pointerId);
    press(`pointer:${event.pointerId}`, button.dataset.control);
  }
  function pointerup(event) { release(`pointer:${event.pointerId}`); }
  function buttonKeyDown(event) {
    const button = event.target.closest('[data-control]');
    if (!button || !isControl() || !['Space','Enter'].includes(event.code)) return;
    event.preventDefault();
    if (!event.repeat) press(`button:${event.code}`, button.dataset.control);
  }
  function buttonKeyUp(event) {
    if (['Space','Enter'].includes(event.code)) { event.preventDefault(); release(`button:${event.code}`); }
  }
  canvas.addEventListener('keydown', keydown);
  canvas.addEventListener('blur', canvasBlur);
  window.addEventListener('keyup', keyup);
  window.addEventListener('blur', windowBlur);
  panel.addEventListener('pointerdown', pointerdown);
  panel.addEventListener('pointerup', pointerup);
  panel.addEventListener('pointercancel', pointerup);
  panel.addEventListener('lostpointercapture', pointerup);
  panel.addEventListener('keydown', buttonKeyDown);
  panel.addEventListener('keyup', buttonKeyUp);
  panel.addEventListener('focusout', clear);
  return {
    read() {
      const input = {
        forward: Number(active('forward')) - Number(active('backward')),
        right: Number(active('right')) - Number(active('left')),
        primary: active('primary'), secondary: active('secondary'), primaryPressed,
      };
      primaryPressed = false;
      return input;
    },
    clear,
    dispose() {
      clear();
      canvas.removeEventListener('keydown', keydown);
      canvas.removeEventListener('blur', canvasBlur);
      window.removeEventListener('keyup', keyup);
      window.removeEventListener('blur', windowBlur);
      panel.removeEventListener('pointerdown', pointerdown);
      panel.removeEventListener('pointerup', pointerup);
      panel.removeEventListener('pointercancel', pointerup);
      panel.removeEventListener('lostpointercapture', pointerup);
      panel.removeEventListener('keydown', buttonKeyDown);
      panel.removeEventListener('keyup', buttonKeyUp);
      panel.removeEventListener('focusout', clear);
    },
  };
}
