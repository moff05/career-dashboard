const DASHBOARD = 'https://career-dashboard-ten.vercel.app';

function getDomain(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}

chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
  const url = tab?.url || '';

  if (!url || url.startsWith(DASHBOARD)) {
    document.getElementById('s-clip').style.display = 'none';
    document.getElementById('s-dashboard').style.display = 'block';
    return;
  }

  document.getElementById('job-domain').textContent = getDomain(url);
  document.getElementById('job-title').textContent = tab?.title || getDomain(url);

  document.getElementById('btn-clip').addEventListener('click', () => {
    chrome.tabs.create({ url: `${DASHBOARD}?import=${encodeURIComponent(url)}` });
    window.close();
  });
});
