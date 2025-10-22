// Cross-browser compatibility
const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

// Rough token estimation (1 token ≈ 4 characters for English text)
function estimateTokens(text) {
  return Math.ceil(text.length / 4);
}

// Track tokens in the current conversation
let currentConversationTokens = 0;
let dailyTokens = 0;
const DAILY_LIMIT = 1000000; // Estimate - adjust based on your plan
const WARNING_THRESHOLD = 0.8; // Warn at 80%

// Create warning banner
function createWarningBanner(percentage) {
  const existingBanner = document.getElementById('token-tracker-banner');
  if (existingBanner) existingBanner.remove();

  const banner = document.createElement('div');
  banner.id = 'token-tracker-banner';
  banner.className = 'token-tracker-banner';

  let message, severity;
  if (percentage >= 0.95) {
    message = `⚠️ CRITICAL: ${Math.round(percentage * 100)}% of daily tokens used!`;
    severity = 'critical';
  } else if (percentage >= 0.8) {
    message = `⚠️ WARNING: ${Math.round(percentage * 100)}% of daily tokens used`;
    severity = 'warning';
  }

  banner.textContent = message;
  banner.className += ` ${severity}`;
  document.body.prepend(banner);
}

// Monitor messages being sent and received
function observeMessages() {
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === 1) { // Element node
          // Look for message containers
          const messages = node.querySelectorAll('[data-test-render-count], .font-user-message, .font-claude-message');

          messages.forEach(async (msg) => {
            const text = msg.textContent || '';
            const tokens = estimateTokens(text);
            currentConversationTokens += tokens;
            dailyTokens += tokens;

            // Save to storage
            await browserAPI.storage.local.set({
              currentConversationTokens,
              dailyTokens,
              lastUpdate: Date.now()
            });

            // Check if we should show warning
            const percentage = dailyTokens / DAILY_LIMIT;
            if (percentage >= WARNING_THRESHOLD) {
              createWarningBanner(percentage);
            }
          });
        }
      });
    });
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}

// Add token counter to the page
function addTokenCounter() {
  console.log('Adding token counter to page...');

  const counter = document.createElement('div');
  counter.id = 'token-counter';
  counter.className = 'token-counter';

  async function updateCounter() {
    const data = await browserAPI.storage.local.get(['currentConversationTokens', 'dailyTokens']);
    const current = data.currentConversationTokens || 0;
    const daily = data.dailyTokens || 0;
    const percentage = (daily / DAILY_LIMIT * 100).toFixed(1);

    counter.innerHTML = `
      <div class="counter-title">Token Usage</div>
      <div class="counter-stat">This Chat: ~${current.toLocaleString()} tokens</div>
      <div class="counter-stat">Today: ~${daily.toLocaleString()} / ${DAILY_LIMIT.toLocaleString()} (${percentage}%)</div>
      <div class="counter-bar">
        <div class="counter-bar-fill" style="width: ${Math.min(percentage, 100)}%"></div>
      </div>
    `;
  }

  updateCounter();
  setInterval(updateCounter, 2000);

  document.body.appendChild(counter);
  console.log('Token counter added successfully!');
}

// Reset daily counter at midnight
async function checkDailyReset() {
  const data = await browserAPI.storage.local.get(['lastResetDate']);
  const today = new Date().toDateString();
  if (data.lastResetDate !== today) {
    await browserAPI.storage.local.set({
      dailyTokens: 0,
      lastResetDate: today
    });
    dailyTokens = 0;
  }
}

// Initialize
async function initialize() {
  console.log('Claude Token Tracker: Initializing...');

  const data = await browserAPI.storage.local.get(['currentConversationTokens', 'dailyTokens']);
  currentConversationTokens = data.currentConversationTokens || 0;
  dailyTokens = data.dailyTokens || 0;

  console.log('Loaded token data:', data);

  await checkDailyReset();
  addTokenCounter();
  observeMessages();
}

// Wait for page to be ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  initialize();
}

// Listen for new conversations (reset current counter)
setTimeout(() => {
  const titleElement = document.querySelector('title');
  if (titleElement) {
    const urlObserver = new MutationObserver(async () => {
      if (window.location.pathname.includes('/chat/')) {
        const currentUrl = window.location.href;
        const data = await browserAPI.storage.local.get(['lastUrl']);
        if (data.lastUrl !== currentUrl) {
          currentConversationTokens = 0;
          await browserAPI.storage.local.set({
            currentConversationTokens: 0,
            lastUrl: currentUrl
          });
        }
      }
    });

    urlObserver.observe(titleElement, {
      childList: true,
      subtree: true
    });
  }
}, 1000);
