// Draws the toolbar icon using OffscreenCanvas so we don't need PNG files.
function drawIcon(size) {
  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#101012';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#F97316';
  ctx.fillRect(0, 0, size, Math.max(2, Math.floor(size * 0.18)));
  ctx.fillStyle = '#F5F5F5';
  ctx.font = `bold ${Math.floor(size * 0.56)}px monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('j_', size / 2, size * 0.62);
  return ctx.getImageData(0, 0, size, size);
}

function setIcon() {
  try {
    chrome.action.setIcon({ imageData: { 16: drawIcon(16), 32: drawIcon(32) } });
  } catch (_) {
    // OffscreenCanvas unavailable — Chrome will use its default icon
  }
}

chrome.runtime.onInstalled.addListener(setIcon);
chrome.runtime.onStartup.addListener(setIcon);
