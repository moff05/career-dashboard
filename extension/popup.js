const DASHBOARD = 'https://career-dashboard-ten.vercel.app';

let currentUrl = '';
let currentTabId = 0;
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
    // Read the page text directly from the tab — bypasses bot protection on
    // LinkedIn, Workday, Greenhouse, etc. since the content is already loaded.
    let pageText = '';
    try {
      const [result] = await chrome.scripting.executeScript({
        target: { tabId: currentTabId },
        func: () => document.body.innerText,
      });
      pageText = result?.result || '';
    } catch (_) {
      // scripting blocked on this tab (e.g. chrome:// pages) — fall back to URL only
    }

    // Step 1: parse the job posting
    const importRes = await fetch(`${DASHBOARD}/api/jobs/import`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': userId,
        'x-api-key': apiKey,
      },
      body: JSON.stringify({ url: currentUrl, extraText: pageText }),
    });
    const importData = await importRes.json().catch(() => ({}));
    if (!importRes.ok) {
      throw new Error(importData?.error || importData?.message || `Parse error (${importRes.status})`);
    }

    // Step 2: save the parsed job to the tracker
    const saveRes = await fetch(`${DASHBOARD}/api/jobs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': userId,
        'x-api-key': apiKey,
      },
      body: JSON.stringify({
        company: importData.company || 'Unknown',
        title: importData.title || 'Unknown',
        type: importData.type || 'fall-2026-internship',
        status: 'saved',
        url: importData.url || currentUrl,
        description: importData.description || '',
        location: importData.location || '',
        deadline: importData.deadline || null,
        salary_range: importData.salary_range || '',
        source: importData.source || getDomain(currentUrl),
      }),
    });
    const saveData = await saveRes.json().catch(() => ({}));
    if (!saveRes.ok) {
      throw new Error(saveData?.error || `Save error (${saveRes.status})`);
    }

    document.getElementById('saved-company').textContent = saveData.company || '';
    document.getElementById('saved-title').textContent = saveData.title || '';
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
    currentTabId = tab?.id || 0;

    if (!currentUrl || currentUrl.startsWith(DASHBOARD)) {
      show('s-on-dashboard');
      return;
    }

    document.getElementById('job-domain').textContent = getDomain(currentUrl);
    document.getElementById('job-title').textContent = tab?.title || currentUrl;

    if (!apiKey) {
      document.getElementById('no-key-warn').style.display = 'block';
      document.getElementById('btn-save').disabled = true;
    }

    show('s-ready');
  });
});

document.getElementById('btn-save').addEventListener('click', saveJob);
document.getElementById('btn-retry').addEventListener('click', saveJob);
document.getElementById('btn-open').addEventListener('click', openDashboard);
document.getElementById('btn-open-err').addEventListener('click', openDashboard);
