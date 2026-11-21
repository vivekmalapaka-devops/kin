(() => {
  const configured = window.KIN_APP_URL;
  if (typeof configured !== 'string' || !configured.trim()) return;
  let url;
  try { url = new URL(configured); } catch { return; }
  if (!['https:', 'http:'].includes(url.protocol)) return;
  document.querySelectorAll('[data-app-link]').forEach(link => {
    link.href = url.href;
    link.removeAttribute('aria-disabled');
    link.querySelector('.unavailable')?.remove();
  });
})();
