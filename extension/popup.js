const DASHBOARD = 'https://career-dashboard-ten.vercel.app';
const STATES = ['s-no-user', 's-clip', 's-dashboard', 's-loading', 's-success', 's-error'];

function show(id) {
  STATES.forEach(s => document.getElementById(s).classList.toggle('hidden', s !== id));
}

function openTab(url) {
  chrome.tabs.create({ url });
  window.close();
}

let currentUrl = '';
let userId = '';

async function doImport() {
  show('s-loading');
  try {
    const res = await fetch(`${DASHBOARD}/api/jobs/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-user-id': userId },
      body: JSON.stringify({ url: currentUrl }),
    });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || `Error ${res.status}`);
    document.getElementById('success-sub').textContent =
      [data.company, data.title].filter(Boolean).join(' — ') || currentUrl;
    show('s-success');
  } catch (err) {
    document.getElementById('error-msg').textContent = err.message || 'Something went wrong.';
    show('s-error');
  }
}

async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentUrl = tab?.url || '';

  if (!currentUrl || currentUrl.startsWith(DASHBOARD)) {
    show('s-dashboard');
    return;
  }

  const stored = await chrome.storage.local.get('cid_user_id');
  userId = stored.cid_user_id || '';

  if (!userId) {
    show('s-no-user');
    return;
  }

  document.getElementById('job-domain').textContent =
    new URL(currentUrl).hostname.replace(/^www\./, '');
  document.getElementById('job-title').textContent = tab?.title || currentUrl;
  show('s-clip');
}

document.getElementById('btn-clip').addEventListener('click', doImport);
document.getElementById('btn-retry').addEventListener('click', doImport);
document.getElementById('btn-open-dashboard').addEventListener('click', () => openTab(DASHBOARD));
document.getElementById('btn-open-tracker').addEventListener('click', () => openTab(DASHBOARD));
document.getElementById('btn-open-manual').addEventListener('click', () =>
  openTab(`${DASHBOARD}?import=${encodeURIComponent(currentUrl)}`)
);

init();
