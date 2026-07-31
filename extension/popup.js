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
let currentTitle = '';
let userId = '';

async function doImport() {
  show('s-loading');
  try {
    const headers = { 'Content-Type': 'application/json', 'x-user-id': userId };

    // Step 1: parse the job posting
    const parseRes = await fetch(`${DASHBOARD}/api/jobs/import`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ url: currentUrl }),
    });
    const parsed = await parseRes.json();
    if (!parseRes.ok || parsed.error) throw new Error(parsed.error || `Parse failed (${parseRes.status})`);

    // Step 2: save to the tracker
    const saveRes = await fetch(`${DASHBOARD}/api/jobs`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        company: parsed.company || 'Unknown Company',
        title: parsed.title || currentTitle,
        type: parsed.type || 'full-time',
        status: 'saved',
        url: parsed.url || currentUrl,
        description: parsed.description || '',
        location: parsed.location || '',
        deadline: parsed.deadline || null,
        posting_date: parsed.posting_date || null,
        salary_range: parsed.salary_range || '',
        source: parsed.source || 'Extension',
      }),
    });
    const saved = await saveRes.json();
    if (!saveRes.ok || saved.error) throw new Error(saved.error || `Save failed (${saveRes.status})`);

    document.getElementById('success-sub').textContent =
      [saved.company, saved.title].filter(Boolean).join(' — ') || currentTitle;
    show('s-success');
  } catch (err) {
    document.getElementById('error-msg').textContent = err.message || 'Something went wrong.';
    show('s-error');
  }
}

async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentUrl = tab?.url || '';
  currentTitle = tab?.title || '';

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

  try {
    document.getElementById('job-domain').textContent =
      new URL(currentUrl).hostname.replace(/^www\./, '');
  } catch { /* ignore invalid URL */ }
  document.getElementById('job-title').textContent = currentTitle || currentUrl;
  show('s-clip');
}

document.getElementById('btn-clip').addEventListener('click', doImport);
document.getElementById('btn-retry').addEventListener('click', doImport);
document.getElementById('btn-open-dashboard').addEventListener('click', () => openTab(DASHBOARD));
document.getElementById('btn-open-tracker').addEventListener('click', () => openTab(DASHBOARD));
document.getElementById('btn-open-manual').addEventListener('click', () =>
  openTab(`${DASHBOARD}?import=${encodeURIComponent(currentUrl)}`)
);
document.getElementById('link-privacy').addEventListener('click', (e) => {
  e.preventDefault();
  openTab(`${DASHBOARD}/privacy`);
});

init();
