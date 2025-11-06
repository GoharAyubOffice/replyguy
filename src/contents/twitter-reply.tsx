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
    display: none;
    padding: 0;
    margin: 0;
  `;
  
  return overlayContainer;
}

function isInlineReply(textarea: HTMLElement): boolean {
  // Check if reply is in a modal/dialog vs inline in tweet thread
  const modal = textarea.closest('[role="dialog"]');
  const dmContainer = textarea.closest('[data-testid="DMDrawer"]');
  const dmComposer = textarea.closest('[data-testid="DMComposer"]');
  
  // If in modal or DM, it's NOT inline
  return !modal && !dmContainer && !dmComposer;
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

  const isInline = isInlineReply(textarea);
  console.log('[ReplyGuy] Positioning overlay, isInline:', isInline);

  // Remove from previous parent if exists
  if (overlayContainer.parentElement) {
    overlayContainer.remove();
  }

  let positioned = false;

  if (isInline) {
    // For inline replies (in tweet thread), position differently
    console.log('[ReplyGuy] Handling inline reply positioning');
    
    // Strategy 1: Find the cellInnerDiv that contains the reply composer
    const cellInnerDiv = textarea.closest('[data-testid="cellInnerDiv"]');
    
    if (cellInnerDiv) {
      // Find the toolbar within this cell
      const toolbar = cellInnerDiv.querySelector('[data-testid="toolBar"]');
      
      if (toolbar) {
        // Get the parent container that holds the toolbar
        const toolbarParent = toolbar.parentElement;
        
        if (toolbarParent) {
          // Insert our overlay right after the toolbar
          const nextSibling = toolbar.nextSibling;
          if (nextSibling) {
            toolbarParent.insertBefore(overlayContainer, nextSibling);
          } else {
            toolbarParent.appendChild(overlayContainer);
          }
          
          // Calculate width based on the cell's width
          const cellWidth = cellInnerDiv.getBoundingClientRect().width;
          overlayContainer.style.width = `${cellWidth}px`;
          overlayContainer.style.maxWidth = `${cellWidth}px`;
          overlayContainer.style.boxSizing = 'border-box';
          
          positioned = true;
          console.log('[ReplyGuy] Positioned inline reply overlay after toolbar, width:', cellWidth);
        }
      } else {
        // Fallback: If no toolbar found, append to the cellInnerDiv directly
        console.log('[ReplyGuy] No toolbar found, using cellInnerDiv fallback');
        cellInnerDiv.appendChild(overlayContainer);
        
        const cellWidth = cellInnerDiv.getBoundingClientRect().width;
        overlayContainer.style.width = `${cellWidth}px`;
        overlayContainer.style.maxWidth = `${cellWidth}px`;
        overlayContainer.style.boxSizing = 'border-box';
        
        positioned = true;
        console.log('[ReplyGuy] Positioned inline reply overlay in cellInnerDiv, width:', cellWidth);
      }
    } else {
      console.warn('[ReplyGuy] Could not find cellInnerDiv for inline reply');
    }
  } else {
    // For modal/DM replies, use original logic
    console.log('[ReplyGuy] Handling modal/DM reply positioning');
    
    const replyContainer = findReplyContainer(textarea);
    
    if (!replyContainer) {
      console.warn('[ReplyGuy] Could not find reply container');
      return;
    }

    const containerRect = replyContainer.getBoundingClientRect();
    const containerWidth = containerRect.width;
    
    console.log('[ReplyGuy] Reply container found, width:', containerWidth);

    let insertionPoint: HTMLElement | null = null;
    let toolbar: HTMLElement | null = null;
    
    const toolbarElement = replyContainer.querySelector(TWITTER_SELECTORS.REPLY_COMPOSER);
    if (toolbarElement && replyContainer.contains(toolbarElement)) {
      toolbar = toolbarElement as HTMLElement;
      insertionPoint = toolbar;
    } else {
      const composerCell = textarea.closest('[data-testid="cellInnerDiv"]');
      if (composerCell && composerCell.parentElement) {
        let current = composerCell.nextElementSibling;
        while (current) {
          const isReply = current.querySelector('[data-testid="tweet"]') !== null;
          if (isReply || current.matches('[data-testid="cellInnerDiv"]')) {
            insertionPoint = current as HTMLElement;
            break;
          }
          current = current.nextElementSibling;
        }
        
        if (!insertionPoint) {
          insertionPoint = composerCell as HTMLElement;
        }
      }
    }

    if (insertionPoint && insertionPoint.parentElement) {
      const parent = insertionPoint.parentElement;
      
      if (toolbar && insertionPoint === toolbar) {
        const nextSibling = insertionPoint.nextSibling;
        if (nextSibling) {
          parent.insertBefore(overlayContainer, nextSibling);
        } else {
          parent.appendChild(overlayContainer);
        }
        console.log('[ReplyGuy] Inserted after toolbar');
      } else {
        parent.insertBefore(overlayContainer, insertionPoint);
        console.log('[ReplyGuy] Inserted before first reply');
      }
      
      positioned = true;
    } else {
      const cellInnerDiv = textarea.closest('[data-testid="cellInnerDiv"]');
      if (cellInnerDiv && cellInnerDiv.parentElement) {
        const parent = cellInnerDiv.parentElement;
        const nextCell = cellInnerDiv.nextElementSibling;
        
        if (nextCell) {
          parent.insertBefore(overlayContainer, nextCell);
        } else {
          parent.insertBefore(overlayContainer, cellInnerDiv.nextSibling);
        }
        positioned = true;
        console.log('[ReplyGuy] Positioned using fallback');
      }
    }

    if (positioned) {
      overlayContainer.style.width = `${containerWidth}px`;
      overlayContainer.style.maxWidth = `${containerWidth}px`;
      overlayContainer.style.boxSizing = 'border-box';
      console.log('[ReplyGuy] Set width to match container:', containerWidth);
    }
  }

  // Only show overlay if successfully positioned
  if (positioned && overlayContainer.parentElement) {
    // Apply responsive grid class based on width BEFORE showing
    const width = overlayContainer.getBoundingClientRect().width;
    const isNarrow = width < 500;
    overlayContainer.setAttribute('data-layout', isNarrow ? 'narrow' : 'wide');
    console.log('[ReplyGuy] Applied layout:', isNarrow ? 'narrow' : 'wide', 'width:', width);
    
    // For inline replies, add padding adjustment
    if (isInline) {
      overlayContainer.style.paddingLeft = '16px';
      overlayContainer.style.paddingRight = '16px';
    } else {
      overlayContainer.style.paddingLeft = '0';
      overlayContainer.style.paddingRight = '0';
    }
    
    // Now show the overlay
    overlayContainer.style.display = 'block';
    
    // Initialize React app now that it's in the DOM
    if (!overlayRoot) {
      overlayRoot = createRoot(overlayContainer);
      overlayRoot.render(<App />);
    }
    
    // Set up resize observer for the container
    setTimeout(() => observeContainerResize(), 100);
  } else {
    console.warn('[ReplyGuy] Failed to position overlay, keeping hidden');
    overlayContainer.style.display = 'none';
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
