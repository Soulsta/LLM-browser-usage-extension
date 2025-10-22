// Cross-browser compatibility
const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

// Initialize storage on install
if (browserAPI.runtime.onInstalled) {
  browserAPI.runtime.onInstalled.addListener(() => {
    browserAPI.storage.local.set({
      currentConversationTokens: 0,
      dailyTokens: 0,
      lastResetDate: new Date().toDateString(),
      lastUrl: ''
    });
    console.log('Claude Token Tracker: Storage initialized');
  });
}

// Reset daily counter at midnight
function checkMidnightReset() {
  browserAPI.storage.local.get(['lastResetDate'], (data) => {
    const today = new Date().toDateString();
    if (data.lastResetDate !== today) {
      browserAPI.storage.local.set({
        dailyTokens: 0,
        lastResetDate: today
      });
      console.log('Claude Token Tracker: Daily counter reset');
    }
  });
}

// Check every hour
setInterval(checkMidnightReset, 3600000);

console.log('Claude Token Tracker: Background script loaded');