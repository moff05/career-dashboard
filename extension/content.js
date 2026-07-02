// Runs on career-dashboard-ten.vercel.app — syncs the user ID into
// extension storage so the popup can make API calls without opening a new tab.
(function () {
  const userId = localStorage.getItem('cid_user_id');
  if (userId) {
    chrome.storage.local.set({ cid_user_id: userId });
  }
})();
