// Cross-browser compatibility
const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

// Claude plan limits (approximate daily token limits)
const PLAN_LIMITS = {
  free: 100000,      // ~100k tokens/day (conservative estimate)
  pro: 500000,       // ~500k tokens/day
  max: 2000000       // ~2M tokens/day (higher usage limit)
};

// Context window limits (how much a single chat can hold)
const CONTEXT_WINDOW = 200000;  // Claude has ~200k token context window

// Message limits per conversation (approximate - when chat gets "full")
const MESSAGE_LIMITS = {
  free: 50,          // Free users might hit limits sooner
  pro: 100,          // Pro users can have longer chats
  max: 150           // Max users get most messages per chat
};

// Image token estimation (based on Claude's vision model)
const IMAGE_TOKENS = {
  small: 1000,       // Small images ~1k tokens
  medium: 2500,      // Medium images ~2.5k tokens
  large: 5000        // Large/high-res images ~5k tokens
};

// Rough token estimation (1 token ≈ 4 characters for English text)
function estimateTokens(text) {
  return Math.ceil(text.length / 4);
}

// Estimate tokens for images based on dimensions
function estimateImageTokens(imgElement) {
  if (!imgElement) return IMAGE_TOKENS.medium;

  const width = imgElement.naturalWidth || imgElement.width;
  const height = imgElement.naturalHeight || imgElement.height;
  const pixels = width * height;

  // Rough estimation based on image size
  if (pixels < 250000) return IMAGE_TOKENS.small;      // < 500x500
  if (pixels < 1000000) return IMAGE_TOKENS.medium;    // < 1000x1000
  return IMAGE_TOKENS.large;                           // Larger images
}

// Track tokens in the current conversation
let currentConversationTokens = 0;
let currentMessageCount = 0;
let dailyTokens = 0;
let currentPlan = 'pro'; // Default to Pro plan
let DAILY_LIMIT = PLAN_LIMITS[currentPlan];
let MESSAGE_LIMIT = MESSAGE_LIMITS[currentPlan];
const WARNING_THRESHOLD = 0.8; // Warn at 80%
const CHAT_WARNING_THRESHOLD = 0.7; // Warn earlier for chat capacity (70%)

// Create warning banner
function createWarningBanner(percentage, type = 'daily') {
  const existingBanner = document.getElementById('token-tracker-banner');
  if (existingBanner) existingBanner.remove();

  const banner = document.createElement('div');
  banner.id = 'token-tracker-banner';
  banner.className = 'token-tracker-banner';

  let message, severity;

  if (type === 'chat') {
    // Chat capacity warnings
    if (percentage >= 0.9) {
      message = `💬 CHAT ALMOST FULL: ${Math.round(percentage * 100)}% capacity - Consider starting a new chat!`;
      severity = 'critical';
    } else if (percentage >= 0.7) {
      message = `💬 Chat getting full: ${Math.round(percentage * 100)}% capacity`;
      severity = 'warning';
    }
  } else {
    // Daily limit warnings
    if (percentage >= 0.95) {
      message = `⚠️ CRITICAL: ${Math.round(percentage * 100)}% of daily tokens used!`;
      severity = 'critical';
    } else if (percentage >= 0.8) {
      message = `⚠️ WARNING: ${Math.round(percentage * 100)}% of daily tokens used`;
      severity = 'warning';
    }
  }

  if (message) {
    banner.textContent = message;
    banner.className += ` ${severity}`;
    document.body.prepend(banner);
  }
}

// Monitor messages being sent and received
function observeMessages() {
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === 1) { // Element node
          // Look for message containers
          const messages = node.querySelectorAll('[data-test-render-count], .font-user-message, .font-claude-message, [data-message-author-role]');

          messages.forEach(async (msg) => {
            // Skip if already counted
            if (msg.dataset.tokensCounted) return;
            msg.dataset.tokensCounted = 'true';

            let tokens = 0;

            // Count text tokens
            const text = msg.textContent || '';
            tokens += estimateTokens(text);

            // Count image tokens
            const images = msg.querySelectorAll('img');
            images.forEach((img) => {
              tokens += estimateImageTokens(img);
            });

            // Update counters
            currentConversationTokens += tokens;
            currentMessageCount += 1;
            dailyTokens += tokens;

            // Save to storage
            await browserAPI.storage.local.set({
              currentConversationTokens,
              currentMessageCount,
              dailyTokens,
              lastUpdate: Date.now()
            });

            // Check daily limit warnings
            const dailyPercentage = dailyTokens / DAILY_LIMIT;
            if (dailyPercentage >= WARNING_THRESHOLD) {
              createWarningBanner(dailyPercentage, 'daily');
            }

            // Check chat capacity warnings (context window OR message count)
            const contextPercentage = currentConversationTokens / CONTEXT_WINDOW;
            const messagePercentage = currentMessageCount / MESSAGE_LIMIT;
            const chatPercentage = Math.max(contextPercentage, messagePercentage);

            if (chatPercentage >= CHAT_WARNING_THRESHOLD) {
              createWarningBanner(chatPercentage, 'chat');
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

// Make counter draggable
function makeDraggable(counter, dragHandle, isLocked) {
  if (!dragHandle || isLocked) return;

  let isDragging = false;
  let startX, startY, startLeft, startTop;

  function dragStart(e) {
    if (isLocked) return;

    isDragging = true;
    const rect = counter.getBoundingClientRect();
    startLeft = rect.left;
    startTop = rect.top;
    startX = e.type.includes('touch') ? e.touches[0].clientX : e.clientX;
    startY = e.type.includes('touch') ? e.touches[0].clientY : e.clientY;

    counter.style.transition = 'none';
    dragHandle.style.cursor = 'grabbing';
  }

  function drag(e) {
    if (!isDragging || isLocked) return;
    e.preventDefault();

    const clientX = e.type.includes('touch') ? e.touches[0].clientX : e.clientX;
    const clientY = e.type.includes('touch') ? e.touches[0].clientY : e.clientY;

    const deltaX = clientX - startX;
    const deltaY = clientY - startY;

    counter.style.left = (startLeft + deltaX) + 'px';
    counter.style.top = (startTop + deltaY) + 'px';
    counter.style.right = 'auto';
    counter.style.bottom = 'auto';
  }

  function dragEnd(e) {
    if (!isDragging) return;
    isDragging = false;
    counter.style.transition = '';
    dragHandle.style.cursor = isLocked ? 'default' : 'grab';

    // Save position to storage
    const rect = counter.getBoundingClientRect();
    browserAPI.storage.local.set({
      counterPosition: {
        left: rect.left,
        top: rect.top
      }
    });
  }

  dragHandle.addEventListener('mousedown', dragStart);
  document.addEventListener('mousemove', drag);
  document.addEventListener('mouseup', dragEnd);
  dragHandle.addEventListener('touchstart', dragStart);
  document.addEventListener('touchmove', drag);
  document.addEventListener('touchend', dragEnd);
}

// Make counter resizable
function makeResizable(counter, resizeHandle, isLocked) {
  if (!resizeHandle || isLocked) return;

  let isResizing = false;
  let startWidth, startHeight, startX, startY;

  function startResize(e) {
    if (isLocked) return;

    isResizing = true;
    startWidth = parseInt(getComputedStyle(counter).width, 10);
    startHeight = parseInt(getComputedStyle(counter).height, 10);
    startX = e.clientX;
    startY = e.clientY;

    e.preventDefault();
  }

  function doResize(e) {
    if (!isResizing || isLocked) return;

    const width = startWidth + (e.clientX - startX);
    const height = startHeight + (e.clientY - startY);

    if (width >= 280) {
      counter.style.width = width + 'px';
    }
    if (height >= 200) {
      counter.style.height = height + 'px';
    }
  }

  function stopResize(e) {
    if (!isResizing) return;

    isResizing = false;

    // Save size to storage
    browserAPI.storage.local.set({
      counterSize: {
        width: counter.style.width,
        height: counter.style.height
      }
    });
  }

  resizeHandle.addEventListener('mousedown', startResize);
  document.addEventListener('mousemove', doResize);
  document.addEventListener('mouseup', stopResize);
}

// Add token counter to the page
function addTokenCounter() {
  // Check if counter already exists
  const existing = document.getElementById('token-counter');
  if (existing) {
    console.log('Token counter already exists, skipping...');
    return;
  }

  console.log('Adding token counter to page...');

  const counter = document.createElement('div');
  counter.id = 'token-counter';
  counter.className = 'token-counter';

  let isLocked = false;

  async function updateCounter() {
    const data = await browserAPI.storage.local.get([
      'currentConversationTokens',
      'currentMessageCount',
      'dailyTokens',
      'selectedPlan',
      'counterLocked',
      'counterPosition',
      'counterSize',
      'counterVisible'
    ]);

    // Check if user has hidden the counter
    if (data.counterVisible === false) {
      counter.style.display = 'none';
      return;
    }

    const current = data.currentConversationTokens || 0;
    const messages = data.currentMessageCount || 0;
    const daily = data.dailyTokens || 0;
    const plan = data.selectedPlan || 'pro';
    isLocked = data.counterLocked !== undefined ? data.counterLocked : false;

    currentPlan = plan;
    DAILY_LIMIT = PLAN_LIMITS[plan];
    MESSAGE_LIMIT = MESSAGE_LIMITS[plan];

    const dailyPercentage = (daily / DAILY_LIMIT * 100).toFixed(1);
    const contextPercentage = (current / CONTEXT_WINDOW * 100).toFixed(1);
    const messagePercentage = (messages / MESSAGE_LIMIT * 100).toFixed(1);
    const chatCapacity = Math.max(parseFloat(contextPercentage), parseFloat(messagePercentage));

    // Determine chat status color
    let chatStatusClass = 'chat-status-good';
    if (chatCapacity >= 90) chatStatusClass = 'chat-status-critical';
    else if (chatCapacity >= 70) chatStatusClass = 'chat-status-warning';

    const lockIcon = isLocked ? '🔒' : '🔓';
    const lockTitle = isLocked ? 'Locked (click to unlock)' : 'Unlocked (click to lock)';

    counter.innerHTML = `
      <div class="drag-handle" style="cursor: ${isLocked ? 'default' : 'grab'};">
        <div class="counter-header">
          <div class="counter-title">Token Usage</div>
          <div class="header-controls">
            <button id="close-button" class="close-button" title="Hide counter">×</button>
            <button id="lock-button" class="lock-button" title="${lockTitle}">${lockIcon}</button>
            <select id="plan-selector" class="plan-selector">
              <option value="free" ${plan === 'free' ? 'selected' : ''}>Free</option>
              <option value="pro" ${plan === 'pro' ? 'selected' : ''}>Pro</option>
              <option value="max" ${plan === 'max' ? 'selected' : ''}>Max</option>
            </select>
          </div>
        </div>
      </div>

      <div class="counter-content">
        <div class="section-divider">This Chat</div>
        <div class="counter-stat">Messages: ${messages} / ${MESSAGE_LIMIT} (${messagePercentage}%)</div>
        <div class="counter-stat">Tokens: ~${current.toLocaleString()} / ${CONTEXT_WINDOW.toLocaleString()} (${contextPercentage}%)</div>
        <div class="counter-stat ${chatStatusClass}">Chat Capacity: ${chatCapacity.toFixed(0)}%</div>

        <div class="section-divider">Today Total</div>
        <div class="counter-stat">Today: ~${daily.toLocaleString()} / ${DAILY_LIMIT.toLocaleString()} (${dailyPercentage}%)</div>
        <div class="counter-bar">
          <div class="counter-bar-fill" style="width: ${Math.min(dailyPercentage, 100)}%"></div>
        </div>
        <div class="counter-note">Includes text + images</div>
      </div>

      <div class="resize-handle" style="display: ${isLocked ? 'none' : 'block'};">⋰</div>
    `;

    // Restore saved position
    if (data.counterPosition) {
      counter.style.left = data.counterPosition.left + 'px';
      counter.style.top = data.counterPosition.top + 'px';
      counter.style.right = 'auto';
      counter.style.bottom = 'auto';
    }

    // Restore saved size
    if (data.counterSize) {
      counter.style.width = data.counterSize.width;
      counter.style.height = data.counterSize.height;
      counter.style.minWidth = '280px';
    }

    // Add event listener to close button
    const closeButton = counter.querySelector('#close-button');
    if (closeButton) {
      closeButton.addEventListener('click', async (e) => {
        e.stopPropagation();
        counter.style.display = 'none';
        await browserAPI.storage.local.set({ counterVisible: false });
      });
    }

    // Add event listener to lock button
    const lockButton = counter.querySelector('#lock-button');
    if (lockButton) {
      lockButton.addEventListener('click', async (e) => {
        e.stopPropagation();
        isLocked = !isLocked;
        await browserAPI.storage.local.set({ counterLocked: isLocked });
        updateCounter();
      });
    }

    // Add event listener to plan selector
    const planSelector = counter.querySelector('#plan-selector');
    if (planSelector) {
      planSelector.addEventListener('change', async (e) => {
        const newPlan = e.target.value;
        await browserAPI.storage.local.set({ selectedPlan: newPlan });
        currentPlan = newPlan;
        DAILY_LIMIT = PLAN_LIMITS[newPlan];
        MESSAGE_LIMIT = MESSAGE_LIMITS[newPlan];
        updateCounter();
      });
    }

    // Enable drag and resize
    const dragHandle = counter.querySelector('.drag-handle');
    const resizeHandle = counter.querySelector('.resize-handle');
    makeDraggable(counter, dragHandle, isLocked);
    makeResizable(counter, resizeHandle, isLocked);
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

  const data = await browserAPI.storage.local.get(['currentConversationTokens', 'currentMessageCount', 'dailyTokens', 'selectedPlan']);
  currentConversationTokens = data.currentConversationTokens || 0;
  currentMessageCount = data.currentMessageCount || 0;
  dailyTokens = data.dailyTokens || 0;
  currentPlan = data.selectedPlan || 'pro';
  DAILY_LIMIT = PLAN_LIMITS[currentPlan];
  MESSAGE_LIMIT = MESSAGE_LIMITS[currentPlan];

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
          currentMessageCount = 0;
          await browserAPI.storage.local.set({
            currentConversationTokens: 0,
            currentMessageCount: 0,
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
