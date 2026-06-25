// Runs on career-dashboard-ten.vercel.app — syncs the user's auth
// credentials into extension storage so the popup can make API calls.
(function () {
  const userId = localStorage.getItem('cid_user_id');
  const apiKey = localStorage.getItem('cid_api_key');
  if (userId) {
    chrome.storage.local.set({ cid_user_id: userId, cid_api_key: apiKey || '' });
  }
})();
