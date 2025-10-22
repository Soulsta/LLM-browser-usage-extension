// Cross-browser compatibility
const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

// Initialize storage on install
if (browserAPI.runtime.onInstalled) {
  browserAPI.runtime.onInstalled.addListener(async () => {
    await browserAPI.storage.local.set({
      currentConversationTokens: 0,
      dailyTokens: 0,
      lastResetDate: new Date().toDateString(),
      lastUrl: '',
      selectedPlan: 'pro' // Default to Pro plan
    });
    console.log('Claude Token Tracker: Storage initialized');
  });
}

// Reset daily counter at midnight
async function checkMidnightReset() {
  const data = await browserAPI.storage.local.get(['lastResetDate']);
  const today = new Date().toDateString();
  if (data.lastResetDate !== today) {
    await browserAPI.storage.local.set({
      dailyTokens: 0,
      lastResetDate: today
    });
    console.log('Claude Token Tracker: Daily counter reset');
  }
}

// Check every hour
setInterval(checkMidnightReset, 3600000);

console.log('Claude Token Tracker: Background script loaded');
