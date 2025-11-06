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

type ReplyContext = 'dm' | 'modal' | 'inline';

function getReplyContext(textarea: HTMLElement): ReplyContext {
  // Check for DM context - multiple indicators
  const dmDrawer = document.querySelector('[data-testid="DMDrawer"]');
  const inMessageArea = textarea.closest('[aria-label*="Message"]') || 
                        textarea.closest('[aria-label*="message"]');
  const hasDMInPath = textarea.closest('[data-testid*="DM"]') || 
                      textarea.closest('[data-testid*="dm"]');
  
  if (dmDrawer || inMessageArea || hasDMInPath) {
    console.log('[ReplyGuy] Context: DM');
    return 'dm';
  }
  
  // Check for modal/dialog context
  const modal = textarea.closest('[role="dialog"]');
  if (modal) {
    console.log('[ReplyGuy] Context: Modal');
    return 'modal';
  }
  
  // Default to inline (tweet thread reply)
  console.log('[ReplyGuy] Context: Inline');
  return 'inline';
}

function findToolbar(textarea: HTMLElement, context: ReplyContext): HTMLElement | null {
  console.log('[ReplyGuy] Searching for toolbar, context:', context);
  
  // For modal context, limit search to within the modal dialog only
  if (context === 'modal') {
    const modal = textarea.closest('[role="dialog"]');
    if (modal) {
      console.log('[ReplyGuy] Searching within modal dialog');
      
      // Search ONLY within the modal for toolbar
      const toolbar = modal.querySelector('[data-testid="toolBar"]');
      if (toolbar) {
        console.log('[ReplyGuy] Found toolbar in modal');
        return toolbar as HTMLElement;
      }
      
      // Fallback: search for role="group" within modal
      const groups = modal.querySelectorAll('[role="group"]');
      for (const group of groups) {
        if (group.querySelector('[aria-label*="Emoji"]') || 
            group.querySelector('[aria-label*="emoji"]') ||
            group.querySelector('[aria-label*="GIF"]')) {
          console.log('[ReplyGuy] Found toolbar by button icons in modal');
          return group as HTMLElement;
        }
      }
      
      console.warn('[ReplyGuy] Could not find toolbar in modal');
      return null;
    }
  }
  
  // For inline and DM contexts, use broader search
  
  // Strategy 1: Look in closest cellInnerDiv
  const cellInnerDiv = textarea.closest('[data-testid="cellInnerDiv"]');
  if (cellInnerDiv) {
    const toolbar = cellInnerDiv.querySelector('[data-testid="toolBar"]');
    if (toolbar) {
      console.log('[ReplyGuy] Found toolbar in cellInnerDiv');
      return toolbar as HTMLElement;
    }
  }
  
  // Strategy 2: Look in siblings of textarea parent
  let sibling = textarea.parentElement?.nextElementSibling;
  let attempts = 0;
  while (sibling && attempts < 5) {
    const toolbar = sibling.querySelector('[data-testid="toolBar"]');
    if (toolbar) {
      console.log('[ReplyGuy] Found toolbar in sibling');
      return toolbar as HTMLElement;
    }
    sibling = sibling.nextElementSibling;
    attempts++;
  }
  
  // Strategy 3: Search up parent chain (up to 5 levels)
  let parent = textarea.parentElement;
  for (let i = 0; i < 5; i++) {
    if (!parent) break;
    const toolbar = parent.querySelector('[data-testid="toolBar"]');
    if (toolbar) {
      console.log('[ReplyGuy] Found toolbar in parent chain');
      return toolbar as HTMLElement;
    }
    parent = parent.parentElement;
  }
  
  console.warn('[ReplyGuy] Could not find toolbar');
  return null;
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

function applyLayoutAndShow(context: ReplyContext, width: number) {
  if (!overlayContainer) return;
  
  // Determine layout based on width
  const isNarrow = width < 450;
  overlayContainer.setAttribute('data-layout', isNarrow ? 'narrow' : 'wide');
  
  // Context-specific padding
  if (context === 'inline') {
    overlayContainer.style.paddingLeft = '16px';
    overlayContainer.style.paddingRight = '16px';
  } else {
    overlayContainer.style.paddingLeft = '0';
    overlayContainer.style.paddingRight = '0';
  }
  
  overlayContainer.style.display = 'block';
  
  // Initialize React if needed
  if (!overlayRoot) {
    overlayRoot = createRoot(overlayContainer);
    overlayRoot.render(<App />);
  }
  
  // Set up resize observer
  setTimeout(() => observeContainerResize(), 100);
  
  console.log('[ReplyGuy] Overlay shown - Context:', context, 'Layout:', isNarrow ? 'narrow' : 'wide', 'Width:', width);
}

function fallbackPosition(textarea: HTMLElement, context: ReplyContext) {
  if (!overlayContainer) return;
  
  console.log('[ReplyGuy] Using fallback positioning');
  
  // Find closest container with reasonable width
  let container = textarea.parentElement;
  for (let i = 0; i < 5; i++) {
    if (!container) break;
    const rect = container.getBoundingClientRect();
    const width = rect.width;
    
    if (width > 400) {
      container.appendChild(overlayContainer);
      overlayContainer.style.width = `${width}px`;
      overlayContainer.style.maxWidth = '100%';
      overlayContainer.style.boxSizing = 'border-box';
      applyLayoutAndShow(context, width);
      console.log('[ReplyGuy] Fallback positioned in container with width:', width);
      return;
    }
    container = container.parentElement;
  }
  
  // Last resort: hide it
  console.error('[ReplyGuy] Could not position overlay - no suitable container found');
  overlayContainer.style.display = 'none';
}

function positionOverlay(textarea: HTMLElement) {
  if (!overlayContainer) return;

  const context = getReplyContext(textarea);
  console.log('[ReplyGuy] Positioning overlay, context:', context);

  // Remove from previous parent if exists
  if (overlayContainer.parentElement) {
    overlayContainer.remove();
  }

  // Set context attribute for styling
  overlayContainer.setAttribute('data-context', context);

  // UNIFIED APPROACH: Find toolbar and position after it
  const toolbar = findToolbar(textarea, context);
  
  if (toolbar && toolbar.parentElement) {
    // Insert overlay after toolbar
    const parent = toolbar.parentElement;
    const nextSibling = toolbar.nextSibling;
    
    if (nextSibling) {
      parent.insertBefore(overlayContainer, nextSibling);
    } else {
      parent.appendChild(overlayContainer);
    }
    
    // Calculate width from parent
    let parentWidth = parent.getBoundingClientRect().width;
    
    // For modal context, ensure width fits nicely within dialog
    if (context === 'modal') {
      const modal = textarea.closest('[role="dialog"]');
      if (modal) {
        const modalWidth = modal.getBoundingClientRect().width;
        // Use the parent width but ensure it's reasonable for the modal
        parentWidth = Math.min(parentWidth, modalWidth - 40);
        console.log('[ReplyGuy] Modal width adjusted:', parentWidth, 'from modal width:', modalWidth);
      }
    }
    
    const width = Math.max(parentWidth, 300);
    
    overlayContainer.style.width = `${width}px`;
    overlayContainer.style.maxWidth = '100%';
    overlayContainer.style.boxSizing = 'border-box';
    
    console.log('[ReplyGuy] Positioned after toolbar, width:', width);
    
    // Apply layout and show
    applyLayoutAndShow(context, width);
  } else {
    // Fallback: use textarea container
    console.warn('[ReplyGuy] Toolbar not found, using fallback positioning');
    fallbackPosition(textarea, context);
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
