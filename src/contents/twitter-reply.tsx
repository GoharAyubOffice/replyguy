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
let isPositioning = false;
let updateTimeout: number | null = null;
let observerSetup = false;

function App() {
  const [tweetContext, setTweetContext] = useState<TweetContext | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const handleTweetContext = (context: TweetContext) => {
      try {
        setTweetContext(context);
        setIsVisible(true);
      } catch (error) {
        // Silently handle state update errors
      }
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
        try {
          setIsVisible(false);
          isUIVisible = false;
          if (overlayContainer && overlayContainer.parentElement) {
            overlayContainer.remove();
          }
        } catch (error) {
          // Silently handle cleanup errors
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
    z-index: 1000;
    pointer-events: auto;
    display: none;
    padding: 0;
    margin: 0;
    width: 100%;
  `;
  
  return overlayContainer;
}

type ReplyContext = 'dm' | 'modal' | 'inline';

function getReplyContext(textarea: HTMLElement): ReplyContext {
  const dmDrawer = document.querySelector('[data-testid="DMDrawer"]');
  const inMessageArea = textarea.closest('[aria-label*="Message"]') || 
                        textarea.closest('[aria-label*="message"]');
  const hasDMInPath = textarea.closest('[data-testid*="DM"]') || 
                      textarea.closest('[data-testid*="dm"]');
  
  if (dmDrawer || inMessageArea || hasDMInPath) {
    return 'dm';
  }
  
  const modal = textarea.closest('[role="dialog"]');
  if (modal) {
    return 'modal';
  }
  
  return 'inline';
}

function findToolbar(textarea: HTMLElement, context: ReplyContext): HTMLElement | null {
  if (context === 'modal') {
    const modal = textarea.closest('[role="dialog"]');
    if (modal) {
      const toolbar = modal.querySelector('[data-testid="toolBar"]');
      if (toolbar) {
        return toolbar as HTMLElement;
      }
      
      const groups = modal.querySelectorAll('[role="group"]');
      for (const group of groups) {
        if (group.querySelector('[aria-label*="Emoji"]') || 
            group.querySelector('[aria-label*="emoji"]') ||
            group.querySelector('[aria-label*="GIF"]')) {
          return group as HTMLElement;
        }
      }
      
      return null;
    }
  }
  
  const cellInnerDiv = textarea.closest('[data-testid="cellInnerDiv"]');
  if (cellInnerDiv) {
    const toolbar = cellInnerDiv.querySelector('[data-testid="toolBar"]');
    if (toolbar) {
      return toolbar as HTMLElement;
    }
  }
  
  let sibling = textarea.parentElement?.nextElementSibling;
  let attempts = 0;
  while (sibling && attempts < 5) {
    const toolbar = sibling.querySelector('[data-testid="toolBar"]');
    if (toolbar) {
      return toolbar as HTMLElement;
    }
    sibling = sibling.nextElementSibling;
    attempts++;
  }
  
  let parent = textarea.parentElement;
  for (let i = 0; i < 5; i++) {
    if (!parent) break;
    const toolbar = parent.querySelector('[data-testid="toolBar"]');
    if (toolbar) {
      return toolbar as HTMLElement;
    }
    parent = parent.parentElement;
  }
  
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
  
  const isNarrow = width < 450;
  overlayContainer.setAttribute('data-layout', isNarrow ? 'narrow' : 'wide');
  
  if (context === 'inline') {
    overlayContainer.style.paddingLeft = '16px';
    overlayContainer.style.paddingRight = '16px';
  } else {
    overlayContainer.style.paddingLeft = '16px';
    overlayContainer.style.paddingRight = '16px';
  }
  
  overlayContainer.style.display = 'block';
  
  if (!overlayRoot) {
    try {
      overlayRoot = createRoot(overlayContainer);
      overlayRoot.render(<App />);
    } catch (error) {
      // Silently handle React mounting errors
    }
  }
}

function fallbackPosition(textarea: HTMLElement, context: ReplyContext) {
  if (!overlayContainer) return;
  
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
      return;
    }
    container = container.parentElement;
  }
  
  overlayContainer.style.display = 'none';
}

function positionOverlay(textarea: HTMLElement) {
  if (!overlayContainer) return;
  
  if (isPositioning) {
    return;
  }
  
  isPositioning = true;

  try {
    const context = getReplyContext(textarea);

    if (overlayContainer.parentElement) {
      overlayContainer.remove();
    }

    overlayContainer.setAttribute('data-context', context);

    const toolbar = findToolbar(textarea, context);
    
    if (toolbar && toolbar.parentElement) {
      const parent = toolbar.parentElement;
      const nextSibling = toolbar.nextSibling;
      
      if (nextSibling) {
        parent.insertBefore(overlayContainer, nextSibling);
      } else {
        parent.appendChild(overlayContainer);
      }
      
      let parentWidth = parent.getBoundingClientRect().width;
      
      if (context === 'modal') {
        const modal = textarea.closest('[role="dialog"]');
        if (modal) {
          const modalWidth = modal.getBoundingClientRect().width;
          parentWidth = Math.min(parentWidth, modalWidth - 40);
        }
      }
      
      const width = Math.max(parentWidth, 300);
      
      overlayContainer.style.width = `${width}px`;
      overlayContainer.style.maxWidth = '100%';
      overlayContainer.style.boxSizing = 'border-box';
      
      applyLayoutAndShow(context, width);
      
      if (!observerSetup) {
        setTimeout(() => {
          setupResizeObserver();
        }, 200);
      }
    } else {
      fallbackPosition(textarea, context);
    }
  } finally {
    isPositioning = false;
  }
}

function handleReplyBoxOpened(textarea: HTMLElement) {
  try {
    if (isUIVisible && currentTextarea === textarea) {
      return;
    }

    currentTextarea = textarea;
    
    const tweetContext = extractTweetContext(textarea);
    
    if (tweetContext) {
      createOverlay();
      positionOverlay(textarea);
      
      if ((window as any).__replyGuyShowUI) {
        (window as any).__replyGuyShowUI(tweetContext);
        isUIVisible = true;
      }
    } else {
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
  } catch (error) {
    // Silently handle errors
  }
}

function attachEventListeners(textarea: HTMLElement) {
  if (textareaEventListeners.has(textarea)) {
    return;
  }

  const handleClick = () => {
    handleReplyBoxOpened(textarea);
  };

  const handleFocus = () => {
    handleReplyBoxOpened(textarea);
  };

  textarea.addEventListener('click', handleClick);
  textarea.addEventListener('focus', handleFocus);
  
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
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          const element = node as Element;
          
          const selectors = [
            TWITTER_SELECTORS.REPLY_TEXTAREA,
            TWITTER_SELECTORS.REPLY_TEXTAREA_ALT,
            TWITTER_SELECTORS.REPLY_TEXTAREA_ALT2
          ];
          
          for (const selector of selectors) {
            const textarea = element.querySelector(selector) ||
                            (element.matches(selector) ? element : null);
            
            if (textarea) {
              attachEventListeners(textarea as HTMLElement);
              return;
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

  const selectors = [
    TWITTER_SELECTORS.REPLY_TEXTAREA,
    TWITTER_SELECTORS.REPLY_TEXTAREA_ALT,
    TWITTER_SELECTORS.REPLY_TEXTAREA_ALT2
  ];
  
  for (const selector of selectors) {
    const existingTextarea = document.querySelector(selector);
    if (existingTextarea) {
      attachEventListeners(existingTextarea as HTMLElement);
      break;
    }
  }
}

function updatePosition() {
  if (currentTextarea && overlayContainer) {
    positionOverlay(currentTextarea);
  }
}

function throttledUpdatePosition() {
  if (updateTimeout) {
    clearTimeout(updateTimeout);
  }
  
  updateTimeout = window.setTimeout(() => {
    updatePosition();
    updateTimeout = null;
  }, 500) as unknown as number;
}

window.addEventListener('resize', throttledUpdatePosition);

let resizeObserver: ResizeObserver | null = null;

function setupResizeObserver() {
  if (observerSetup) {
    return;
  }
  
  if (!currentTextarea || !overlayContainer) return;
  
  const replyContainer = findReplyContainer(currentTextarea);
  
  if (replyContainer) {
    resizeObserver = new ResizeObserver(() => {
      throttledUpdatePosition();
    });
    resizeObserver.observe(replyContainer);
    observerSetup = true;
  }
}


if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', observeReplyBoxes);
} else {
  observeReplyBoxes();
}
