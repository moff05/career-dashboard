const DASHBOARD = 'https://career-dashboard-ten.vercel.app';

let currentUrl = '';
let userId = '';
let apiKey = '';

function show(id) {
  document.querySelectorAll('.state').forEach(el => el.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function getDomain(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}

async function saveJob() {
  show('s-loading');
  try {
    const res = await fetch(`${DASHBOARD}/api/jobs/import`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': userId,
        'x-api-key': apiKey,
      },
      body: JSON.stringify({ url: currentUrl }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(data?.error || data?.message || `Server error (${res.status})`);
    }

    document.getElementById('saved-company').textContent = data.company || '';
    document.getElementById('saved-title').textContent = data.title || '';
    show('s-success');
  } catch (err) {
    document.getElementById('error-msg').textContent = err.message || 'Something went wrong.';
    show('s-error');
  }
}

function openDashboard() {
  chrome.tabs.create({ url: DASHBOARD });
  window.close();
}

// Boot
chrome.storage.local.get(['cid_user_id', 'cid_api_key'], ({ cid_user_id, cid_api_key }) => {
  if (!cid_user_id) {
    show('s-disconnected');
    return;
  }

  userId = cid_user_id;
  apiKey = cid_api_key || '';

  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    currentUrl = tab?.url || '';

    if (!currentUrl || currentUrl.startsWith(DASHBOARD)) {
      show('s-on-dashboard');
      return;
    }

    document.getElementById('job-domain').textContent = getDomain(currentUrl);
    document.getElementById('job-title').textContent = tab?.title || currentUrl;

    if (!apiKey) {
      document.getElementById('no-key-warn').style.display = 'block';
    }

    show('s-ready');
  });
});

document.getElementById('btn-save').addEventListener('click', saveJob);
document.getElementById('btn-retry').addEventListener('click', saveJob);
document.getElementById('btn-open').addEventListener('click', openDashboard);
document.getElementById('btn-open-err').addEventListener('click', openDashboard);
