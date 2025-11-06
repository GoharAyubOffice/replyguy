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
  // Remove any existing overlay containers first to prevent duplicates
  const existingOverlays = document.querySelectorAll('#replyguy-overlay');
  existingOverlays.forEach(overlay => {
    if (overlay !== overlayContainer) {
      overlay.remove();
    }
  });

  if (overlayContainer && overlayContainer.parentElement) {
    return overlayContainer;
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
  // First, try to find the reply composer wrapper - this is the most reliable
  // Look for a div that contains the textarea and is part of the reply composer
  let container = textarea.closest('div[role="group"]');
  
  // If that doesn't work, try finding the form or specific reply composer structure
  if (!container) {
    container = textarea.closest('form');
  }
  
  // Look for the specific reply composer structure
  if (!container) {
    // Find the parent structure that contains both textarea and toolbar
    const toolbar = document.querySelector(TWITTER_SELECTORS.REPLY_COMPOSER);
    if (toolbar) {
      // Find common parent of textarea and toolbar
      let element = textarea.parentElement;
      while (element && element !== document.body) {
        if (element.contains(toolbar) && element !== document.body) {
          // Make sure this is actually a reply container, not the main timeline
          const rect = element.getBoundingClientRect();
          // Reply containers are usually narrower than the main content area
          if (rect.width > 200 && rect.width < 1000) {
            container = element;
            break;
          }
        }
        element = element.parentElement;
      }
    }
  }
  
  // Avoid selecting the entire page body or main content area
  // Make sure container is not too wide (which would be the main timeline)
  if (container) {
    const rect = container.getBoundingClientRect();
    // If container is too wide, it's probably not the reply composer
    if (rect.width > 1000) {
      container = null;
    }
  }
  
  // Final fallback: look for a reasonably sized container near the textarea
  if (!container) {
    let element = textarea.parentElement;
    for (let i = 0; i < 6 && element && element !== document.body; i++) {
      const computed = window.getComputedStyle(element);
      const width = parseFloat(computed.width);
      // Reply containers are typically between 300-700px wide
      if (width > 250 && width < 800 && width > 0) {
        // Double check it's actually visible and not the body
        const rect = element.getBoundingClientRect();
        if (rect.width === width && element.tagName !== 'BODY' && element.tagName !== 'HTML') {
          container = element;
          break;
        }
      }
      element = element.parentElement;
    }
  }
  
  return container as HTMLElement | null;
}

function positionOverlay(textarea: HTMLElement) {
  if (!overlayContainer) return;

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

  // Calculate container width
  const containerRect = replyContainer.getBoundingClientRect();
  const containerWidth = containerRect.width;
  
  // Don't position if container is invalid (too wide = probably not reply container)
  if (containerWidth > 1000 || containerWidth < 100) {
    console.warn('[ReplyGuy] Container width seems invalid:', containerWidth);
    return;
  }
  
  console.log('[ReplyGuy] Reply container found, width:', containerWidth);

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

  // Insert the overlay - prioritize before toolbar
  if (toolbar && toolbar.parentElement) {
    // Insert right before the toolbar
    toolbar.parentElement.insertBefore(overlayContainer, toolbar);
    console.log('[ReplyGuy] Inserted before toolbar');
  } else {
    // Find the textarea wrapper and insert after it
    let textareaWrapper = textarea.parentElement;
    let foundWrapper = false;
    
    // Walk up the tree to find a good insertion point
    while (textareaWrapper && textareaWrapper !== replyContainer) {
      // Look for a sibling after the textarea wrapper
      if (textareaWrapper.nextSibling) {
        replyContainer.insertBefore(overlayContainer, textareaWrapper.nextSibling);
        foundWrapper = true;
        console.log('[ReplyGuy] Inserted after textarea wrapper');
        break;
      }
      textareaWrapper = textareaWrapper.parentElement;
    }
    
    // If we couldn't find a good spot, try to find the last child before other content
    if (!foundWrapper) {
      // Find where the textarea ends and insert there
      let current = textarea;
      let depth = 0;
      while (current && current !== replyContainer && depth < 10) {
        if (current.nextSibling && current.nextSibling.nodeType === Node.ELEMENT_NODE) {
          const nextEl = current.nextSibling as HTMLElement;
          // Check if this is a reply or other content we shouldn't overlap
          if (!nextEl.querySelector('[data-testid="tweet"]') && !nextEl.closest('[data-testid="tweet"]')) {
            replyContainer.insertBefore(overlayContainer, nextEl);
            foundWrapper = true;
            console.log('[ReplyGuy] Inserted before next sibling');
            break;
          }
        }
        current = current.parentElement;
        depth++;
      }
    }
    
    // Last resort: append to container, but only if it's safe
    if (!foundWrapper && replyContainer) {
      replyContainer.appendChild(overlayContainer);
      console.log('[ReplyGuy] Appended to reply container (fallback)');
    }
  }

  // Set the width and styling to match the container
  if (overlayContainer.parentElement) {
    overlayContainer.style.width = `${containerWidth}px`;
    overlayContainer.style.maxWidth = `${containerWidth}px`;
    overlayContainer.style.boxSizing = 'border-box';
    overlayContainer.style.marginTop = '8px';
    overlayContainer.style.marginBottom = '12px';
    console.log('[ReplyGuy] Set width to match container:', containerWidth);
    
    // Initialize React app now that it's in the DOM
    if (!overlayRoot) {
      overlayRoot = createRoot(overlayContainer);
      overlayRoot.render(<App />);
    }
    
    // Set up resize observer for the container
    setTimeout(() => observeContainerResize(), 100);
  }
}

function handleReplyBoxOpened(textarea: HTMLElement) {
  // Prevent multiple calls for the same textarea
  if (currentTextarea === textarea && overlayContainer && overlayContainer.parentElement) {
    console.log('[ReplyGuy] Already handling this textarea, skipping');
    return;
  }
  
  console.log('[ReplyGuy] Reply box opened, extracting context...');
  currentTextarea = textarea;
  
  const tweetContext = extractTweetContext(textarea);
  
  if (tweetContext) {
    console.log('[ReplyGuy] Tweet context extracted:', tweetContext);
    createOverlay();
    positionOverlay(textarea);
    
    if ((window as any).__replyGuyShowUI) {
      (window as any).__replyGuyShowUI(tweetContext);
      console.log('[ReplyGuy] UI should now be visible');
    }
  } else {
    console.warn('[ReplyGuy] Could not extract tweet context, trying with dummy data...');
    // Fallback: show UI anyway with dummy context
    const fallbackContext: TweetContext = {
      text: "Unable to extract tweet text",
      author: "Unknown"
    };
    createOverlay();
    positionOverlay(textarea);
    if ((window as any).__replyGuyShowUI) {
      (window as any).__replyGuyShowUI(fallbackContext);
    }
  }
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
  if (replyContainer && resizeObserver) {
    resizeObserver.disconnect();
  }
  
  if (replyContainer) {
    resizeObserver = new ResizeObserver(() => {
      updatePosition();
    });
    resizeObserver.observe(replyContainer);
  }
}


if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', observeReplyBoxes);
} else {
  observeReplyBoxes();
}

export default App;
