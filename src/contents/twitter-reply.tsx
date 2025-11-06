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

function createOverlay() {
  // Remove ALL existing overlay containers first to prevent duplicates
  const existingOverlays = document.querySelectorAll('#replyguy-overlay');
  existingOverlays.forEach(overlay => {
    overlay.remove();
  });

  // Reset overlayContainer if it was removed
  if (!document.contains(overlayContainer)) {
    overlayContainer = null;
    overlayRoot = null;
  }

  if (overlayContainer && overlayContainer.parentElement) {
    // Verify it's in a valid location
    const rect = overlayContainer.getBoundingClientRect();
    // If it's in the top-left corner (likely wrong), remove it
    if (rect.top < 50 && rect.left < 50) {
      overlayContainer.remove();
      overlayContainer = null;
      overlayRoot = null;
    } else {
      return overlayContainer;
    }
  }

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
  
  return overlayContainer;
}

function findReplyContainer(textarea: HTMLElement): HTMLElement | null {
  console.log('[ReplyGuy] Finding reply container for textarea:', textarea);
  
  // Strategy 1: Look for div[role="group"] - this is the most reliable for reply composer
  let container = textarea.closest('div[role="group"]') as HTMLElement;
  if (container && container !== document.body && container !== document.documentElement) {
    const rect = container.getBoundingClientRect();
    console.log('[ReplyGuy] Found container via role="group", width:', rect.width, 'top:', rect.top);
    // More lenient width check - just ensure it's not the entire page
    if (rect.width > 50 && rect.width < 2000 && container.contains(textarea)) {
      console.log('[ReplyGuy] Using container from role="group"');
      return container;
    }
    container = null;
  }
  
  // Strategy 2: Look for form element
  if (!container) {
    container = textarea.closest('form') as HTMLElement;
    if (container && container !== document.body && container !== document.documentElement) {
      const rect = container.getBoundingClientRect();
      console.log('[ReplyGuy] Found container via form, width:', rect.width);
      if (rect.width > 50 && rect.width < 2000 && container.contains(textarea)) {
        console.log('[ReplyGuy] Using container from form');
        return container;
      }
      container = null;
    }
  }
  
  // Strategy 3: Find parent that contains both textarea and toolbar
  const toolbar = document.querySelector(TWITTER_SELECTORS.REPLY_COMPOSER) as HTMLElement;
  if (toolbar && !container) {
    console.log('[ReplyGuy] Looking for container that contains both textarea and toolbar');
    let element = textarea.parentElement;
    let depth = 0;
    while (element && element !== document.body && depth < 10) {
      if (element.contains(toolbar) && element !== document.body && element !== document.documentElement) {
        const rect = element.getBoundingClientRect();
        // More lenient validation
        if (rect.width > 50 && rect.width < 2000 && element.contains(textarea)) {
          container = element as HTMLElement;
          console.log('[ReplyGuy] Found container via toolbar search, width:', rect.width, 'depth:', depth);
          break;
        }
      }
      element = element.parentElement;
      depth++;
    }
  }
  
  // Strategy 4: Look for cellInnerDiv that contains the reply composer
  if (!container) {
    const cellInner = textarea.closest('[data-testid="cellInnerDiv"]') as HTMLElement;
    if (cellInner && cellInner !== document.body && cellInner !== document.documentElement) {
      const rect = cellInner.getBoundingClientRect();
      console.log('[ReplyGuy] Found cellInnerDiv, width:', rect.width);
      // More lenient check
      if (rect.width > 50 && rect.width < 2000 && cellInner.contains(textarea)) {
        container = cellInner;
        console.log('[ReplyGuy] Using cellInnerDiv as container');
      }
    }
  }
  
  // Strategy 5: Walk up from textarea and find first reasonable parent
  if (!container) {
    console.log('[ReplyGuy] Trying fallback: walking up from textarea');
    let element = textarea.parentElement;
    let depth = 0;
    while (element && element !== document.body && depth < 8) {
      if (element !== document.documentElement && element.tagName !== 'BODY' && element.tagName !== 'HTML') {
        const rect = element.getBoundingClientRect();
        // Check if it's a reasonable container (not too wide, visible)
        if (rect.width > 50 && rect.width < 1500 && rect.height > 50 && element.contains(textarea)) {
          // Check if it has the textarea and maybe toolbar
          const hasToolbar = element.querySelector(TWITTER_SELECTORS.REPLY_COMPOSER);
          if (hasToolbar || rect.width < 800) { // If it has toolbar or is narrow, it's likely the reply container
            container = element as HTMLElement;
            console.log('[ReplyGuy] Found container via fallback walk, width:', rect.width, 'hasToolbar:', !!hasToolbar);
            break;
          }
        }
      }
      element = element.parentElement;
      depth++;
    }
  }
  
  // Final validation: ensure container is not body/html
  if (container) {
    if (container === document.body || container === document.documentElement) {
      console.warn('[ReplyGuy] Container is body/html, rejecting');
      container = null;
    } else if (!container.contains(textarea)) {
      console.warn('[ReplyGuy] Container does not contain textarea, rejecting');
      container = null;
    } else {
      const rect = container.getBoundingClientRect();
      console.log('[ReplyGuy] Final container selected, width:', rect.width, 'top:', rect.top, 'left:', rect.left);
    }
  }
  
  if (!container) {
    console.error('[ReplyGuy] COULD NOT FIND VALID REPLY CONTAINER - This will prevent UI positioning');
  }
  
  return container;
}

function positionOverlay(textarea: HTMLElement) {
  if (!overlayContainer) return;
  
  // Prevent concurrent positioning calls
  if (isPositioning) {
    console.log('[ReplyGuy] Already positioning, skipping duplicate call');
    return;
  }
  
  isPositioning = true;

  try {
    // Find the reply container
    const replyContainer = findReplyContainer(textarea);
    
    if (!replyContainer) {
      console.warn('[ReplyGuy] Could not find reply container');
      // Don't position if we can't find the right container - prevents wrong placement
      return;
    }

    // Verify this is actually a reply container by checking if it contains the textarea
    if (!replyContainer.contains(textarea)) {
      console.warn('[ReplyGuy] Container does not contain textarea, skipping');
      return;
    }

    // Verify container is not body or html
    if (replyContainer === document.body || replyContainer === document.documentElement) {
      console.warn('[ReplyGuy] Container is body/html, skipping');
      return;
    }

    // Calculate container width and position
    const containerRect = replyContainer.getBoundingClientRect();
    const containerWidth = containerRect.width;
    
    // More lenient width validation - just ensure it's not the entire page
    if (containerWidth > 2000 || containerWidth < 50) {
      console.warn('[ReplyGuy] Container width seems invalid:', containerWidth);
      return;
    }
    
    // Removed strict position validation (top < 10 check) - this was rejecting valid containers
    console.log('[ReplyGuy] Reply container found, width:', containerWidth, 'position:', containerRect.top, containerRect.left);

    // Find the toolbar - this is the best insertion point
    let toolbar = replyContainer.querySelector(TWITTER_SELECTORS.REPLY_COMPOSER) as HTMLElement;
    
    // If toolbar not found in container, try to find it globally but verify it's related
    if (!toolbar) {
      const globalToolbar = document.querySelector(TWITTER_SELECTORS.REPLY_COMPOSER) as HTMLElement;
      if (globalToolbar && replyContainer.contains(globalToolbar)) {
        toolbar = globalToolbar;
      }
    }
    
    // Remove from previous parent if exists
    if (overlayContainer.parentElement) {
      overlayContainer.remove();
    }

    let insertionSuccess = false;

    // Strategy 1: Insert before toolbar (best method)
    if (toolbar && toolbar.parentElement) {
      toolbar.parentElement.insertBefore(overlayContainer, toolbar);
      insertionSuccess = true;
      console.log('[ReplyGuy] Inserted before toolbar using insertBefore');
    }
    
    // Strategy 2: Use insertAdjacentElement after textarea wrapper
    if (!insertionSuccess) {
      // Find the textarea's direct parent container
      let textareaWrapper = textarea.parentElement;
      let depth = 0;
      
      // Walk up to find a good wrapper (within 8 levels)
      while (textareaWrapper && textareaWrapper !== replyContainer && depth < 8) {
        // Try to insert after this wrapper using insertAdjacentElement
        try {
          // Check if this wrapper is within the reply container
          if (replyContainer.contains(textareaWrapper) && textareaWrapper.parentElement) {
            // Insert after the textarea wrapper
            textareaWrapper.insertAdjacentElement('afterend', overlayContainer);
            insertionSuccess = true;
            console.log('[ReplyGuy] Inserted after textarea wrapper using insertAdjacentElement, depth:', depth);
            break;
          }
        } catch (e) {
          console.log('[ReplyGuy] insertAdjacentElement failed at depth', depth, ':', e);
        }
        textareaWrapper = textareaWrapper.parentElement;
        depth++;
      }
    }
    
    // Strategy 3: Find textarea container and insert before next sibling
    if (!insertionSuccess) {
      let textareaWrapper = textarea.parentElement;
      while (textareaWrapper && textareaWrapper !== replyContainer) {
        if (textareaWrapper.nextSibling && replyContainer.contains(textareaWrapper)) {
          replyContainer.insertBefore(overlayContainer, textareaWrapper.nextSibling);
          insertionSuccess = true;
          console.log('[ReplyGuy] Inserted before next sibling of textarea wrapper');
          break;
        }
        textareaWrapper = textareaWrapper.parentElement;
      }
    }
    
    // If we couldn't find a safe insertion point, don't position at all
    // CRITICAL: Never append to body - if we can't find safe spot, fail gracefully
    if (!insertionSuccess) {
      console.error('[ReplyGuy] Could not find safe insertion point, not positioning overlay');
      // Remove overlay if it exists to prevent it from appearing elsewhere
      if (overlayContainer.parentElement) {
        overlayContainer.remove();
      }
      overlayContainer = null;
      overlayRoot = null;
      return;
    }

    // Set the width and styling to match the container
    if (overlayContainer.parentElement) {
      const overlayRect = overlayContainer.getBoundingClientRect();
      console.log('[ReplyGuy] Overlay positioned at top:', overlayRect.top, 'left:', overlayRect.left);
      
      // Only validate if it's clearly in the wrong place (top-left corner with very small values)
      // Removed strict validation that was rejecting valid positions
      if (overlayRect.top < 5 && overlayRect.left < 5 && overlayRect.width < 100) {
        console.warn('[ReplyGuy] Overlay appears to be in top-left corner with invalid size, removing');
        overlayContainer.remove();
        overlayContainer = null;
        overlayRoot = null;
        return;
      }
      
      overlayContainer.style.width = `${containerWidth}px`;
      overlayContainer.style.maxWidth = `${containerWidth}px`;
      overlayContainer.style.boxSizing = 'border-box';
      overlayContainer.style.marginTop = '8px';
      overlayContainer.style.marginBottom = '12px';
      console.log('[ReplyGuy] Set width to match container:', containerWidth, 'marginTop: 8px, marginBottom: 12px');
      
      // Initialize React app now that it's in the DOM
      if (!overlayRoot) {
        overlayRoot = createRoot(overlayContainer);
        overlayRoot.render(<App />);
        console.log('[ReplyGuy] React root initialized and rendered');
      }
      
      // Set up resize observer for the container (only once)
      if (!resizeObserver) {
        setTimeout(() => observeContainerResize(), 100);
      }
    } else {
      console.warn('[ReplyGuy] Overlay has no parent element after insertion attempt');
    }
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
      // Verify it's still in a valid position
      const rect = overlayContainer.getBoundingClientRect();
      // Check if it's in a reasonable position (not top-left corner)
      if (rect.top > 50 && rect.left > 50 && rect.width > 100) {
        console.log('[ReplyGuy] Already handling this textarea with valid position, skipping');
        handleTimeout = null;
        return;
      } else {
        // Invalid position, remove and recreate
        console.log('[ReplyGuy] Overlay in invalid position, removing and recreating');
        if (overlayContainer) {
          overlayContainer.remove();
          overlayContainer = null;
          overlayRoot = null;
        }
      }
    }
    
    console.log('[ReplyGuy] Reply box opened, extracting context...');
    handlingTextarea = textarea;
    currentTextarea = textarea;
    
    const tweetContext = extractTweetContext(textarea);
    
    // Create overlay first
    createOverlay();
    
    // Try to position - if positioning fails, don't show UI
    positionOverlay(textarea);
    
    // Only show UI if overlay is actually positioned (has a parent)
    if (overlayContainer && overlayContainer.parentElement) {
      const rect = overlayContainer.getBoundingClientRect();
      // Final check: make sure it's not in top-left corner
      if (rect.top < 5 && rect.left < 5 && rect.width < 100) {
        console.error('[ReplyGuy] Overlay ended up in top-left corner, removing');
        overlayContainer.remove();
        overlayContainer = null;
        overlayRoot = null;
      } else {
        // Show UI only if successfully positioned
        if (tweetContext) {
          console.log('[ReplyGuy] Tweet context extracted:', tweetContext);
          if ((window as any).__replyGuyShowUI) {
            (window as any).__replyGuyShowUI(tweetContext);
            console.log('[ReplyGuy] UI should now be visible');
          }
        } else {
          console.warn('[ReplyGuy] Could not extract tweet context, using dummy data...');
          const fallbackContext: TweetContext = {
            text: "Unable to extract tweet text",
            author: "Unknown"
          };
          if ((window as any).__replyGuyShowUI) {
            (window as any).__replyGuyShowUI(fallbackContext);
          }
        }
      }
    } else {
      console.error('[ReplyGuy] Overlay positioning failed - UI will not be shown');
      // Clean up if positioning failed
      if (overlayContainer) {
        overlayContainer = null;
        overlayRoot = null;
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
    const rect = replyContainer.getBoundingClientRect();
    // Only observe if container is in a valid position
    if (rect.top > 50 && rect.width > 100 && rect.width < 1000) {
      resizeObserver = new ResizeObserver(() => {
        // Only update if overlay exists and is in DOM
        if (overlayContainer && overlayContainer.parentElement) {
          updatePosition();
        }
      });
      resizeObserver.observe(replyContainer);
    }
  }
}


if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', observeReplyBoxes);
} else {
  observeReplyBoxes();
}

export default App;
