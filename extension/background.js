// Draws the toolbar icon to match the site's icon.tsx favicon:
// dark rounded background, "j" in white, "_" in orange.
function drawIcon(size) {
  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext('2d');

  // Rounded background
  const r = Math.round(size * 0.156);
  ctx.fillStyle = '#0A0A0A';
  ctx.beginPath();
  ctx.roundRect(0, 0, size, size, r);
  ctx.fill();

  const fontSize = Math.round(size * 0.53);
  ctx.font = `800 ${fontSize}px monospace`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';

  const jW = ctx.measureText('j').width;
  const uW = ctx.measureText('_').width;
  const startX = (size - jW - uW) / 2;

  ctx.fillStyle = '#F5F5F5';
  ctx.fillText('j', startX, size / 2);
  ctx.fillStyle = '#F97316';
  ctx.fillText('_', startX + jW, size / 2);

  return ctx.getImageData(0, 0, size, size);
}

function setIcon() {
  try {
    chrome.action.setIcon({ imageData: { 16: drawIcon(16), 32: drawIcon(32) } });
  } catch (_) {
    // OffscreenCanvas unavailable — Chrome will use the static PNG icon
  }
}

chrome.runtime.onInstalled.addListener(setIcon);
chrome.runtime.onStartup.addListener(setIcon);
