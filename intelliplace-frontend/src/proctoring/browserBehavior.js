/**
 * Visibility, fullscreen, clipboard hardening for interview proctoring.
 * @param {(type: string, meta?: object) => void} onViolation — uses unified violation pipeline
 * @returns {() => void} cleanup
 */
export function attachBrowserBehaviorGuards(onViolation) {
  const onVisibility = () => {
    if (document.visibilityState === 'hidden') {
      onViolation('TAB_SWITCH', { reason: 'visibility_hidden' });
    }
  };

  let wasFs = !!document.fullscreenElement;

  const onFs = () => {
    const nowFs = !!document.fullscreenElement;
    if (wasFs && !nowFs) {
      onViolation('EXIT_FULLSCREEN', { reason: 'fullscreen_exit' });
    }
    wasFs = nowFs;
  };

  const blockClipboard = (e) => {
    e.preventDefault();
    e.stopPropagation();
    onViolation('COPY_PASTE', { kind: e.type });
    return false;
  };

  document.addEventListener('visibilitychange', onVisibility);
  document.addEventListener('fullscreenchange', onFs);
  document.addEventListener('copy', blockClipboard, true);
  document.addEventListener('cut', blockClipboard, true);
  document.addEventListener('paste', blockClipboard, true);

  return () => {
    document.removeEventListener('visibilitychange', onVisibility);
    document.removeEventListener('fullscreenchange', onFs);
    document.removeEventListener('copy', blockClipboard, true);
    document.removeEventListener('cut', blockClipboard, true);
    document.removeEventListener('paste', blockClipboard, true);
  };
}

export async function enterProctoringFullscreen(element) {
  if (!element?.requestFullscreen) return;
  try {
    await element.requestFullscreen({ navigationUI: 'hide' });
  } catch {
    /* user may deny or browser policy */
  }
}
