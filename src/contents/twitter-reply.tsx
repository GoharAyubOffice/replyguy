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
let isUIVisible = false;
let textareaEventListeners = new WeakMap<HTMLElement, { click: () => void; focus: () => void }>();

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
      onClose={() => {
        setIsVisible(false);
        isUIVisible = false;
        // Clean up overlay when closed
        if (overlayContainer && overlayContainer.parentElement) {
          overlayContainer.remove();
        }
      }}
    />
  );
}

function createOverlay() {
  if (overlayContainer) {
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
  // Try to find the main reply container - it's usually a div that contains the textarea and toolbar
  // Look for common container patterns in Twitter's DOM structure
  let container = textarea.closest('div[role="group"]') || 
                  textarea.closest('form') ||
                  textarea.closest('[data-testid="tweetTextarea_0"]')?.parentElement?.parentElement;
  
  // Try to find the cell inner div which often contains the reply composer
  if (!container) {
    container = textarea.closest('[data-testid="cellInnerDiv"]');
  }
  
  // Look for divs that contain both textarea and toolbar
  if (!container) {
    const toolbar = document.querySelector(TWITTER_SELECTORS.REPLY_COMPOSER);
    if (toolbar) {
      // Find common parent of textarea and toolbar
      let element = textarea.parentElement;
      while (element && element !== document.body) {
        if (element.contains(toolbar)) {
          container = element;
          break;
        }
        element = element.parentElement;
      }
    }
  }
  
  // Final fallback: try to find a container with specific width styling
  if (!container) {
    let element = textarea.parentElement;
    for (let i = 0; i < 5 && element; i++) {
      const computed = window.getComputedStyle(element);
      const width = parseFloat(computed.width);
      // Reply containers are typically between 400-600px wide
      if (width > 300 && width < 800) {
        container = element;
        break;
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
    return;
  }

  // Calculate container width
  const containerRect = replyContainer.getBoundingClientRect();
  const containerWidth = containerRect.width;
  
  console.log('[ReplyGuy] Reply container found, width:', containerWidth);

  // Find the reply composer section (textarea + toolbar)
  // We need to find where the composer ends and replies begin
  let insertionPoint: HTMLElement | null = null;
  let toolbar: HTMLElement | null = null;
  
  // Strategy 1: Find the toolbar and insert after it
  const toolbarElement = replyContainer.querySelector(TWITTER_SELECTORS.REPLY_COMPOSER);
  if (toolbarElement && replyContainer.contains(toolbarElement)) {
    toolbar = toolbarElement as HTMLElement;
    // Insert after the toolbar, before the next element (likely first reply)
    insertionPoint = toolbar;
  } else {
    // Strategy 2: Find the cellInnerDiv that contains the composer
    const composerCell = textarea.closest('[data-testid="cellInnerDiv"]');
    if (composerCell && composerCell.parentElement) {
      // Look for the next cellInnerDiv which should be the first reply
      let current = composerCell.nextElementSibling;
      while (current) {
        // Check if this is a reply cell
        const isReply = current.querySelector('[data-testid="tweet"]') !== null;
        if (isReply || current.matches('[data-testid="cellInnerDiv"]')) {
          insertionPoint = current as HTMLElement;
          break;
        }
        current = current.nextElementSibling;
      }
      
      // If no reply found, use the composer cell's parent to append
      if (!insertionPoint) {
        insertionPoint = composerCell as HTMLElement;
      }
    } else {
      // Strategy 3: Find textarea container and look for next sibling that's a reply
      let textareaParent = textarea.parentElement;
      while (textareaParent && textareaParent !== replyContainer) {
        const nextSibling = textareaParent.nextElementSibling;
        if (nextSibling) {
          // Check if next sibling is a reply
          const isReply = nextSibling.querySelector('[data-testid="tweet"]') !== null;
          if (isReply) {
            insertionPoint = nextSibling as HTMLElement;
            break;
          }
          // Or use it as insertion point anyway
          insertionPoint = nextSibling as HTMLElement;
          break;
        }
        textareaParent = textareaParent.parentElement;
      }
    }
  }

  // Remove from previous parent if exists
  if (overlayContainer.parentElement) {
    overlayContainer.remove();
  }

  // Insert the overlay after the composer, before the first reply
  if (insertionPoint && insertionPoint.parentElement) {
    const parent = insertionPoint.parentElement;
    
    // If insertion point is the toolbar, insert after it
    if (toolbar && insertionPoint === toolbar) {
      const nextSibling = insertionPoint.nextSibling;
      if (nextSibling) {
        parent.insertBefore(overlayContainer, nextSibling);
        console.log('[ReplyGuy] Inserted after toolbar, before next element');
      } else {
        parent.appendChild(overlayContainer);
        console.log('[ReplyGuy] Inserted after toolbar');
      }
    } else {
      // Insert before the insertion point (which is likely the first reply)
      parent.insertBefore(overlayContainer, insertionPoint);
      console.log('[ReplyGuy] Inserted before first reply');
    }
  } else {
    // Fallback: find the cellInnerDiv that contains the reply composer
    const cellInnerDiv = textarea.closest('[data-testid="cellInnerDiv"]');
    if (cellInnerDiv && cellInnerDiv.parentElement) {
      const parent = cellInnerDiv.parentElement;
      const nextCell = cellInnerDiv.nextElementSibling;
      
      if (nextCell) {
        // Insert before next cell (likely first reply)
        parent.insertBefore(overlayContainer, nextCell);
        console.log('[ReplyGuy] Inserted before next cell (fallback)');
      } else {
        // Append after composer cell
        parent.insertBefore(overlayContainer, cellInnerDiv.nextSibling);
        console.log('[ReplyGuy] Appended after composer cell (fallback)');
      }
    } else if (replyContainer) {
      // Last resort: append to reply container
      replyContainer.appendChild(overlayContainer);
      console.log('[ReplyGuy] Appended to reply container (last resort)');
    }
  }

  // Set the width to match the container
  if (overlayContainer.parentElement) {
    overlayContainer.style.width = `${containerWidth}px`;
    overlayContainer.style.maxWidth = `${containerWidth}px`;
    overlayContainer.style.boxSizing = 'border-box';
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
  // Prevent duplicate UIs
  if (isUIVisible && currentTextarea === textarea) {
    console.log('[ReplyGuy] UI already visible for this textarea');
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
      isUIVisible = true;
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
      isUIVisible = true;
    }
  }
}

function attachEventListeners(textarea: HTMLElement) {
  // Skip if already has listeners
  if (textareaEventListeners.has(textarea)) {
    return;
  }

  const handleClick = () => {
    console.log('[ReplyGuy] Reply box clicked');
    handleReplyBoxOpened(textarea);
  };

  const handleFocus = () => {
    console.log('[ReplyGuy] Reply box focused');
    handleReplyBoxOpened(textarea);
  };

  textarea.addEventListener('click', handleClick);
  textarea.addEventListener('focus', handleFocus);
  
  // Store listeners for cleanup
  textareaEventListeners.set(textarea, { click: handleClick, focus: handleFocus });
}

function cleanupUI() {
  if (overlayContainer && overlayContainer.parentElement) {
    overlayContainer.remove();
  }
  isUIVisible = false;
  currentTextarea = null;
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
              // Attach event listeners instead of immediately showing UI
              attachEventListeners(textarea as HTMLElement);
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

  // Attach listeners to existing textareas on load (but don't show UI)
  console.log('[ReplyGuy] Attaching listeners to existing reply boxes...');
  const selectors = [
    TWITTER_SELECTORS.REPLY_TEXTAREA,
    TWITTER_SELECTORS.REPLY_TEXTAREA_ALT,
    TWITTER_SELECTORS.REPLY_TEXTAREA_ALT2
  ];
  
  for (const selector of selectors) {
    const existingTextarea = document.querySelector(selector);
    if (existingTextarea) {
      console.log('[ReplyGuy] Found existing reply box with selector:', selector);
      attachEventListeners(existingTextarea as HTMLElement);
      break;
    }
  }
}

// Update position on scroll and resize
function updatePosition() {
  if (currentTextarea && overlayContainer) {
    positionOverlay(currentTextarea);
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
