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
    margin: 0;
  `;
  
  // CRITICAL: Do NOT append to body - overlay must be positioned by positionOverlay
  // If overlay is not in DOM, it will be positioned by positionOverlay
  console.log('[ReplyGuy] Created new overlay container (not yet in DOM)');
  
  return overlayContainer;
}

function findReplyContainer(textarea: HTMLElement): HTMLElement | null {
  console.log('[ReplyGuy] Finding reply container for textarea:', textarea);

  // Find the toolbar first - it's the most reliable anchor point
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

  // Fallback: Look for div[role="group"]
  console.log('[ReplyGuy] Trying fallback: div[role="group"]');
  let container = textarea.closest('div[role="group"]') as HTMLElement;
  if (container && container !== document.body && container !== document.documentElement) {
    const rect = container.getBoundingClientRect();
    console.log('[ReplyGuy] Found container via role="group", width:', rect.width, 'height:', rect.height);
    if (rect.width > 50 && container.contains(textarea)) {
      console.log('[ReplyGuy] Using div[role="group"] as container');
      return container;
    }
  }

  // Last resort: Walk up from textarea and find ANY reasonable parent
  console.log('[ReplyGuy] Last resort: walking up from textarea');
  let element = textarea.parentElement;

  if (!element) {
    console.error('[ReplyGuy] Textarea has no parent element!');
    return null;
  }

  let depth = 0;
  let bestCandidate: HTMLElement | null = null;
  let bestCandidateDepth = -1;

  while (element && element !== document.body && depth < 12) {
    if (element !== document.documentElement) {
      const rect = element.getBoundingClientRect();
      console.log('[ReplyGuy] Checking element at depth', depth, 'width:', rect.width, 'height:', rect.height, 'tag:', element.tagName, 'class:', element.className);

      // Very lenient check - just need a visible element
      if (rect.width > 100 && rect.height > 50) {
        console.log('[ReplyGuy] Found valid container candidate at depth', depth);
        bestCandidate = element;
        bestCandidateDepth = depth;

        // If depth is reasonable (3-8 levels up), use it immediately
        if (depth >= 3 && depth <= 8) {
          console.log('[ReplyGuy] Using container at ideal depth:', depth);
          return element;
        }
      }
    }
    element = element.parentElement;
    depth++;
  }

  // If we found any candidate, use it
  if (bestCandidate) {
    console.log('[ReplyGuy] Using best candidate found at depth', bestCandidateDepth);
    return bestCandidate;
  }

  console.error('[ReplyGuy] COULD NOT FIND VALID REPLY CONTAINER - no candidates found');
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

    // Find the toolbar - this is where we'll insert our UI (just before it)
    const toolbar = replyContainer.querySelector(TWITTER_SELECTORS.REPLY_COMPOSER) as HTMLElement;

    // Remove from previous parent if exists
    if (overlayContainer.parentElement) {
      console.log('[ReplyGuy] Removing overlay from previous parent');
      overlayContainer.remove();
    }

    let insertionSuccess = false;

    // PRIMARY STRATEGY: Insert before toolbar
    // This places our UI between the textarea and the toolbar (action buttons)
    if (toolbar) {
      // Find the parent that contains the toolbar
      const toolbarParent = toolbar.parentElement;
      if (toolbarParent) {
        console.log('[ReplyGuy] Inserting overlay before toolbar');
        toolbarParent.insertBefore(overlayContainer, toolbar);
        insertionSuccess = true;
      }
    }

    // FALLBACK STRATEGY: Find where to insert by walking up from textarea
    if (!insertionSuccess) {
      console.log('[ReplyGuy] Toolbar not found, using fallback strategy');

      // Walk up from textarea to find a good insertion point
      let current = textarea;
      let depth = 0;

      while (current && current !== replyContainer && depth < 10) {
        const parent = current.parentElement;
        if (parent && parent.contains(current)) {
          // Check if this level is a good insertion point
          // We want to insert after the element that contains the textarea
          const nextSibling = current.nextSibling;

          if (nextSibling) {
            // Insert before the next sibling
            parent.insertBefore(overlayContainer, nextSibling);
            insertionSuccess = true;
            console.log('[ReplyGuy] Inserted using fallback at depth', depth);
            break;
          } else if (parent !== replyContainer) {
            // Try the parent level
            current = parent;
            depth++;
            continue;
          }
        }
        current = parent as HTMLElement;
        depth++;
      }

      // Last resort: append to the reply container
      if (!insertionSuccess && replyContainer) {
        console.log('[ReplyGuy] Using last resort: appending to reply container');
        replyContainer.appendChild(overlayContainer);
        insertionSuccess = true;
      }
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

    // Set styling to ensure it displays correctly
    const containerRect = replyContainer.getBoundingClientRect();
    overlayContainer.style.width = '100%';
    overlayContainer.style.maxWidth = '100%';
    overlayContainer.style.boxSizing = 'border-box';
    overlayContainer.style.marginTop = '12px';
    overlayContainer.style.marginBottom = '12px';
    overlayContainer.style.display = 'block';

    const overlayRect = overlayContainer.getBoundingClientRect();
    console.log('[ReplyGuy] Overlay successfully positioned at top:', overlayRect.top, 'left:', overlayRect.left, 'width:', overlayRect.width);

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
