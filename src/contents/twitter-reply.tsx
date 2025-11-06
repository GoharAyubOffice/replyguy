import type { PlasmoCSConfig } from "plasmo";
import { useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
import ReplyOptions from "~src/components/ReplyOptions";
import { extractTweetContext, TWITTER_SELECTORS } from "~src/utils/twitter";
import type { TweetContext } from "~src/types";
import "~src/style.css";

export const config: PlasmoCSConfig = {
  matches: ["https://x.com/*", "https://twitter.com/*"],
  all_frames: false
};

let overlayContainer: HTMLDivElement | null = null;
let overlayRoot: any = null;
let currentTextarea: HTMLElement | null = null;
let isPositioning = false; // Flag to prevent concurrent positioning

function App() {
  const [tweetContext, setTweetContext] = useState<TweetContext | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const handleTweetContext = (context: TweetContext) => {
      setTweetContext(context);
      setIsVisible(true);
    };

    (window as any).__replyGuyShowUI = handleTweetContext;

    return () => {
      delete (window as any).__replyGuyShowUI;
    };
  }, []);

  if (!isVisible || !tweetContext) {
    return null;
  }

  return (
    <ReplyOptions
      tweetContext={tweetContext}
      onClose={() => setIsVisible(false)}
    />
  );
}

// Helper function to clean up overlay completely - defined early so it can be used everywhere
function cleanupOverlay() {
  if (overlayContainer) {
    if (overlayContainer.parentElement) {
      console.log('[ReplyGuy] Removing overlay from DOM during cleanup');
      overlayContainer.remove();
    }
    overlayContainer = null;
  }
  if (overlayRoot) {
    try {
      overlayRoot.unmount();
      console.log('[ReplyGuy] React root unmounted');
    } catch (e) {
      // Ignore unmount errors
      console.log('[ReplyGuy] Error unmounting React root (ignored):', e);
    }
    overlayRoot = null;
  }
}

function createOverlay() {
  // Remove ALL existing overlay containers first to prevent duplicates
  const existingOverlays = document.querySelectorAll('#replyguy-overlay');
  existingOverlays.forEach(overlay => {
    console.log('[ReplyGuy] Removing existing overlay from DOM');
    overlay.remove();
  });

  // Clean up any existing overlay container
  cleanupOverlay();

  // Create new overlay container
  overlayContainer = document.createElement('div');
  overlayContainer.id = 'replyguy-overlay';
  overlayContainer.style.cssText = `
    position: relative;
    z-index: 1;
    pointer-events: auto;
    display: block;
    padding: 0;
    margin: 12px 0 0 0;
    width: 100%;
    box-sizing: border-box;
  `;

  // CRITICAL: Do NOT append to body - overlay must be positioned by positionOverlay
  // If overlay is not in DOM, it will be positioned by positionOverlay
  console.log('[ReplyGuy] Created new overlay container (not yet in DOM)');

  return overlayContainer;
}

function validateOverlayPosition(overlay: HTMLElement): { isValid: boolean; message: string } {
  const rect = overlay.getBoundingClientRect();

  // Check if visible in viewport
  const isInViewport = rect.top >= 0 && rect.bottom <= window.innerHeight;

  // Check if has reasonable dimensions
  const hasWidth = rect.width >= 250;
  const hasHeight = rect.height >= 50;

  // Check if not in top-left corner (common positioning error)
  const notInCorner = !(rect.top < 100 && rect.left < 100);

  const isValid = hasWidth && hasHeight && notInCorner;

  let message = `Overlay position check: width=${rect.width.toFixed(0)}px, height=${rect.height.toFixed(0)}px, top=${rect.top.toFixed(0)}px, left=${rect.left.toFixed(0)}px`;

  if (!hasWidth) message += ' [ERROR: Width too small]';
  if (!hasHeight) message += ' [ERROR: Height too small]';
  if (!notInCorner) message += ' [WARNING: May be in wrong position]';
  if (!isInViewport) message += ' [WARNING: Not fully in viewport]';

  return { isValid, message };
}

function findReplyContainer(textarea: HTMLElement): HTMLElement | null {
  console.log('[ReplyGuy] Finding reply container for textarea:', textarea);

  // STRATEGY 1: Find the common parent of textarea and toolbar
  const toolbar = document.querySelector(TWITTER_SELECTORS.REPLY_COMPOSER) as HTMLElement;
  console.log('[ReplyGuy] Toolbar search result:', toolbar ? 'Found' : 'Not found');

  if (toolbar) {
    console.log('[ReplyGuy] Found toolbar, looking for common parent with textarea');

    // Find the common parent that contains both textarea and toolbar
    let element = textarea.parentElement;
    let depth = 0;
    while (element && element !== document.body && depth < 15) {
      if (element.contains(toolbar)) {
        const rect = element.getBoundingClientRect();
        console.log('[ReplyGuy] Found common parent at depth', depth, 'width:', rect.width, 'height:', rect.height);

        // This is the container - return it
        if (rect.width > 50 && element !== document.documentElement) {
          console.log('[ReplyGuy] Using container that contains both textarea and toolbar');
          return element;
        }
      }
      element = element.parentElement;
      depth++;
    }
    console.log('[ReplyGuy] Could not find common parent with toolbar');
  }

  // STRATEGY 2: Look for data-testid="tweetTextarea" container
  console.log('[ReplyGuy] Trying strategy 2: Looking for textarea data-testid container');
  let container = textarea.closest('[data-testid*="Textarea"]') as HTMLElement;
  if (container && container !== document.body && container !== document.documentElement) {
    const rect = container.getBoundingClientRect();
    console.log('[ReplyGuy] Found container via data-testid, width:', rect.width, 'height:', rect.height);
    if (rect.width > 50 && container.contains(textarea)) {
      console.log('[ReplyGuy] Using textarea data-testid container');
      return container;
    }
  }

  // STRATEGY 3: Look for div[role="group"]
  console.log('[ReplyGuy] Trying strategy 3: div[role="group"]');
  container = textarea.closest('div[role="group"]') as HTMLElement;
  if (container && container !== document.body && container !== document.documentElement) {
    const rect = container.getBoundingClientRect();
    console.log('[ReplyGuy] Found container via role="group", width:', rect.width, 'height:', rect.height);
    if (rect.width > 50 && container.contains(textarea)) {
      console.log('[ReplyGuy] Using div[role="group"] as container');
      return container;
    }
  }

  // STRATEGY 4: Walk up from textarea and find a suitable parent with reasonable size
  console.log('[ReplyGuy] Strategy 4: walking up from textarea');
  let element = textarea.parentElement;

  if (!element) {
    console.error('[ReplyGuy] Textarea has no parent element!');
    return null;
  }

  let depth = 0;
  let bestCandidate: HTMLElement | null = null;
  let bestCandidateDepth = -1;
  let bestCandidateWidth = 0;

  // Walk up to find the widest reasonable container (typically 400px+ wide)
  while (element && element !== document.body && depth < 20) {
    if (element !== document.documentElement) {
      const rect = element.getBoundingClientRect();
      const hasMinHeight = rect.height > 50;
      const hasMinWidth = rect.width >= 350; // More flexible than 480px

      console.log('[ReplyGuy] Depth', depth, '- tag:', element.tagName, 'width:', rect.width, 'height:', rect.height, 'class:', element.className);

      if (hasMinWidth && hasMinHeight) {
        console.log('[ReplyGuy] Found candidate at depth', depth, 'width:', rect.width);

        // Prefer the widest container that still contains textarea
        if (!bestCandidate || (rect.width > bestCandidateWidth && rect.width < 1200)) {
          bestCandidate = element;
          bestCandidateDepth = depth;
          bestCandidateWidth = rect.width;
          console.log('[ReplyGuy] New best candidate: depth', depth, 'width:', rect.width);
        }
      }
    }
    element = element.parentElement;
    depth++;
  }

  // If we found any candidate, use it
  if (bestCandidate) {
    console.log('[ReplyGuy] Using best candidate at depth', bestCandidateDepth, 'width:', bestCandidateWidth);
    return bestCandidate;
  }

  console.error('[ReplyGuy] COULD NOT FIND VALID REPLY CONTAINER');
  return null;
}

function positionOverlay(textarea: HTMLElement): boolean {
  if (!overlayContainer) {
    console.warn('[ReplyGuy] No overlay container to position');
    return false;
  }

  // Prevent concurrent positioning calls
  if (isPositioning) {
    console.log('[ReplyGuy] Already positioning, skipping duplicate call');
    return false;
  }

  isPositioning = true;

  try {
    // Find the reply container
    const replyContainer = findReplyContainer(textarea);

    if (!replyContainer) {
      console.warn('[ReplyGuy] Could not find reply container - cleaning up');
      cleanupOverlay();
      return false;
    }

    console.log('[ReplyGuy] Reply container found, positioning overlay...');

    // Remove from previous parent if exists
    if (overlayContainer.parentElement) {
      console.log('[ReplyGuy] Removing overlay from previous parent');
      overlayContainer.remove();
    }

    let insertionSuccess = false;

    // STRATEGY: Insert after the textarea's direct container
    // Walk up a few levels from textarea to find the right insertion point
    let insertPoint = textarea.parentElement;
    let depth = 0;

    // Walk up to find a suitable insertion point (usually 2-4 levels up)
    while (insertPoint && depth < 6 && insertPoint !== replyContainer) {
      const rect = insertPoint.getBoundingClientRect();
      console.log('[ReplyGuy] Checking insertion point at depth', depth, 'width:', rect.width);

      // If we found a good level with substantial width, insert after it
      if (rect.width > 250) {
        const parent = insertPoint.parentElement;
        if (parent && parent.contains(insertPoint)) {
          const nextSibling = insertPoint.nextSibling;
          if (nextSibling) {
            parent.insertBefore(overlayContainer, nextSibling);
          } else {
            parent.appendChild(overlayContainer);
          }
          insertionSuccess = true;
          console.log('[ReplyGuy] Inserted overlay after textarea container at depth', depth);
          break;
        }
      }

      insertPoint = insertPoint.parentElement;
      depth++;
    }

    // FALLBACK: Append to reply container if nothing else worked
    if (!insertionSuccess && replyContainer) {
      console.log('[ReplyGuy] Using fallback: appending to reply container');
      replyContainer.appendChild(overlayContainer);
      insertionSuccess = true;
    }

    if (!insertionSuccess) {
      console.error('[ReplyGuy] Could not insert overlay - cleaning up');
      cleanupOverlay();
      return false;
    }

    // Verify overlay is in the DOM and within the reply container
    if (!overlayContainer.parentElement || !replyContainer.contains(overlayContainer)) {
      console.error('[ReplyGuy] Overlay not properly inserted - cleaning up');
      cleanupOverlay();
      return false;
    }

    // Validate overlay position
    const validation = validateOverlayPosition(overlayContainer);
    console.log('[ReplyGuy]', validation.message);

    if (!validation.isValid) {
      console.error('[ReplyGuy] Overlay position validation failed - positioning may be incorrect');
      // Don't cleanup - let it show anyway so user can debug
    }

    // Initialize React app now that it's in the DOM
    if (!overlayRoot) {
      overlayRoot = createRoot(overlayContainer);
      overlayRoot.render(<App />);
      console.log('[ReplyGuy] React root initialized and rendered');
    }

    // Set up resize observer for the container
    if (!resizeObserver) {
      setTimeout(() => observeContainerResize(), 100);
    }

    return true;
  } finally {
    isPositioning = false;
  }
}

let handlingTextarea: HTMLElement | null = null;
let handleTimeout: number | null = null;

function handleReplyBoxOpened(textarea: HTMLElement) {
  // Debounce to prevent multiple rapid calls
  if (handleTimeout !== null) {
    clearTimeout(handleTimeout);
  }

  handleTimeout = window.setTimeout(() => {
    console.log('[ReplyGuy] Checking if this is a reply box...');

    // CRITICAL: Check if this is actually a REPLY box, not the main composer
    // Look for "Replying to @username" text which only appears in replies
    const replyingToText = document.querySelector('[data-testid="reply-to-text"]');
    const inReplyToDiv = textarea.closest('[aria-labelledby*="modal"]');

    // Alternative check: Look for "Replying to" text anywhere near the textarea
    let isReply = false;

    if (replyingToText) {
      isReply = true;
      console.log('[ReplyGuy] Detected reply via reply-to-text element');
    } else if (inReplyToDiv) {
      isReply = true;
      console.log('[ReplyGuy] Detected reply via modal container');
    } else {
      // Check for "Replying to" text in the DOM
      let parent = textarea.parentElement;
      let depth = 0;
      while (parent && depth < 10) {
        const textContent = parent.textContent || '';
        if (textContent.includes('Replying to @') || textContent.includes('Replying to')) {
          isReply = true;
          console.log('[ReplyGuy] Detected reply via "Replying to" text at depth', depth);
          break;
        }
        parent = parent.parentElement;
        depth++;
      }
    }

    if (!isReply) {
      console.log('[ReplyGuy] This is NOT a reply box (main composer), ignoring...');
      handleTimeout = null;
      return;
    }

    console.log('[ReplyGuy] Confirmed: This is a REPLY box, proceeding...');

    // Prevent multiple calls for the same textarea
    if (handlingTextarea === textarea && overlayContainer && overlayContainer.parentElement) {
      console.log('[ReplyGuy] Already handling this textarea, skipping');
      handleTimeout = null;
      return;
    }

    console.log('[ReplyGuy] Reply box opened, extracting context...');
    handlingTextarea = textarea;
    currentTextarea = textarea;

    const tweetContext = extractTweetContext(textarea);

    // Create overlay first
    createOverlay();

    // Try to position - positionOverlay now returns boolean
    const positioningSuccess = positionOverlay(textarea);

    if (!positioningSuccess) {
      console.error('[ReplyGuy] Positioning failed - UI will NOT be shown');
      cleanupOverlay();
      return;
    }

    // Verify overlay is in the DOM
    if (!overlayContainer || !overlayContainer.parentElement) {
      console.error('[ReplyGuy] Overlay missing after positioning - cleaning up');
      cleanupOverlay();
      return;
    }

    // Show UI
    console.log('[ReplyGuy] Showing UI');
    if (tweetContext) {
      console.log('[ReplyGuy] Tweet context extracted:', tweetContext);
      if ((window as any).__replyGuyShowUI) {
        (window as any).__replyGuyShowUI(tweetContext);
        console.log('[ReplyGuy] UI should now be visible');
      }
    } else {
      console.warn('[ReplyGuy] Could not extract tweet context, using fallback...');
      const fallbackContext: TweetContext = {
        text: "Unable to extract tweet text",
        author: "Unknown"
      };
      if ((window as any).__replyGuyShowUI) {
        (window as any).__replyGuyShowUI(fallbackContext);
      }
    }

    handleTimeout = null;
  }, 200); // 200ms debounce
}

function observeReplyBoxes() {
  console.log('[ReplyGuy] Starting to observe reply boxes...');
  
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          const element = node as Element;
          
          // Try multiple selectors
          const selectors = [
            TWITTER_SELECTORS.REPLY_TEXTAREA,
            TWITTER_SELECTORS.REPLY_TEXTAREA_ALT,
            TWITTER_SELECTORS.REPLY_TEXTAREA_ALT2
          ];
          
          for (const selector of selectors) {
            const textarea = element.querySelector(selector) ||
                            (element.matches(selector) ? element : null);
            
            if (textarea) {
              console.log('[ReplyGuy] Reply box detected with selector:', selector);
              handleReplyBoxOpened(textarea as HTMLElement);
              return; // Found one, stop searching
            }
          }
        }
      }
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

  // Also check for existing textareas on load
  console.log('[ReplyGuy] Checking for existing reply boxes...');
  const selectors = [
    TWITTER_SELECTORS.REPLY_TEXTAREA,
    TWITTER_SELECTORS.REPLY_TEXTAREA_ALT,
    TWITTER_SELECTORS.REPLY_TEXTAREA_ALT2
  ];
  
  for (const selector of selectors) {
    const existingTextarea = document.querySelector(selector);
    if (existingTextarea) {
      console.log('[ReplyGuy] Found existing reply box with selector:', selector);
      handleReplyBoxOpened(existingTextarea as HTMLElement);
      break;
    }
  }
}

// Debounce position updates to prevent excessive calls
let positionUpdateTimeout: number | null = null;

function updatePosition() {
  if (currentTextarea && overlayContainer && overlayContainer.parentElement) {
    // Clear any pending updates
    if (positionUpdateTimeout !== null) {
      clearTimeout(positionUpdateTimeout);
    }
    
    // Debounce the position update
    positionUpdateTimeout = window.setTimeout(() => {
      positionOverlay(currentTextarea!);
      positionUpdateTimeout = null;
    }, 100);
  }
}

window.addEventListener('scroll', updatePosition, { passive: true });
window.addEventListener('resize', updatePosition);

// Also use ResizeObserver to watch for container size changes
let resizeObserver: ResizeObserver | null = null;

function observeContainerResize() {
  if (!currentTextarea || !overlayContainer) return;

  const replyContainer = findReplyContainer(currentTextarea);

  // Disconnect existing observer
  if (resizeObserver) {
    resizeObserver.disconnect();
    resizeObserver = null;
  }

  // Only observe if container is valid
  if (replyContainer && replyContainer !== document.body && replyContainer !== document.documentElement) {
    resizeObserver = new ResizeObserver(() => {
      // Only update if overlay exists and is in DOM
      if (overlayContainer && overlayContainer.parentElement) {
        updatePosition();
      }
    });
    resizeObserver.observe(replyContainer);
    console.log('[ReplyGuy] Resize observer attached to reply container');
  }
}


if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', observeReplyBoxes);
} else {
  observeReplyBoxes();
}

export default App;
