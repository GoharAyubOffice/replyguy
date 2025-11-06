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

  // Try to find the separator line or toolbar (insertion point - right before toolbar/separator)
  let toolbar = document.querySelector(TWITTER_SELECTORS.REPLY_COMPOSER);
  
  // Find where to insert - after the textarea container, before the toolbar
  let insertionPoint: HTMLElement | null = null;
  
  if (toolbar && replyContainer.contains(toolbar)) {
    // Insert before toolbar
    insertionPoint = toolbar as HTMLElement;
  } else {
    // Find the textarea's direct container and insert after it
    let textareaContainer = textarea.parentElement;
    while (textareaContainer && textareaContainer !== replyContainer) {
      if (textareaContainer.nextSibling) {
        insertionPoint = textareaContainer.nextSibling as HTMLElement;
        break;
      }
      textareaContainer = textareaContainer.parentElement;
    }
  }

  // Remove from previous parent if exists
  if (overlayContainer.parentElement) {
    overlayContainer.remove();
  }

  // Insert the overlay
  if (insertionPoint && insertionPoint.parentElement) {
    insertionPoint.parentElement.insertBefore(overlayContainer, insertionPoint);
    console.log('[ReplyGuy] Inserted before insertion point');
  } else if (replyContainer) {
    // Find the textarea container and insert after it
    let textareaContainer = textarea.parentElement;
    while (textareaContainer && textareaContainer.parentElement === replyContainer) {
      textareaContainer = textareaContainer.parentElement;
      break;
    }
    
    // Insert after textarea or at the end of container
    const textareaRect = textarea.getBoundingClientRect();
    let afterTextarea = false;
    
    // Try to find a good spot after textarea
    let current = textarea.parentElement;
    while (current && current !== replyContainer) {
      if (current.nextSibling) {
        replyContainer.insertBefore(overlayContainer, current.nextSibling);
        afterTextarea = true;
        break;
      }
      current = current.parentElement;
    }
    
    if (!afterTextarea) {
      replyContainer.appendChild(overlayContainer);
      console.log('[ReplyGuy] Appended to reply container');
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
