import type { PlasmoCSConfig } from "plasmo";
import { useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
import PostOptions from "~src/components/PostOptions";
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
let activeTextareas = new Set<HTMLElement>();
let mutationObserver: MutationObserver | null = null;
let resizeObserver: ResizeObserver | null = null;
let observerSetup = false;
let updateTimeout: number | null = null;

const HOME_COMPOSE_SELECTORS = [
  '[data-testid="tweetTextarea_0"]',
  'div[contenteditable="true"][role="textbox"]',
  '.public-DraftEditor-content'
];

function App() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const handleShowUI = () => {
      try {
        setIsVisible(true);
      } catch (error) {
        // Silently handle state update errors
      }
    };

    (window as any).__postGuyShowUI = handleShowUI;

    return () => {
      delete (window as any).__postGuyShowUI;
    };
  }, []);

  if (!isVisible) {
    return null;
  }

  return (
    <PostOptions
      onClose={() => {
        try {
          setIsVisible(false);
          cleanupUI();
        } catch (error) {
          // Silently handle cleanup errors
        }
      }}
    />
  );
}

function createOverlay() {
  if (overlayContainer?.isConnected) {
    return overlayContainer;
  }

  if (overlayContainer) {
    cleanupUI();
  }

  overlayContainer = document.createElement('div');
  overlayContainer.id = 'postguy-overlay';
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

function isHomeCompose(textarea: HTMLElement): boolean {
  const isDM = textarea.closest('[data-testid="DMDrawer"]') || 
               textarea.closest('[data-testid="DMComposer"]');
  if (isDM) return false;

  const isReplyModal = textarea.closest('[role="dialog"]');
  if (isReplyModal) return false;

  const pathname = window.location.pathname;
  const isHomeFeed = pathname === '/' || pathname === '/home' || pathname === '/compose/tweet';
  
  if (!isHomeFeed) return false;

  const cellInnerDiv = textarea.closest('[data-testid="cellInnerDiv"]');
  if (!cellInnerDiv) {
    return true;
  }
  
  const hasTweetInCell = cellInnerDiv.querySelector('[data-testid="tweet"]');
  const isMainComposer = !hasTweetInCell;
  
  return isMainComposer;
}

function findToolbar(textarea: HTMLElement): HTMLElement | null {
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

function findComposeContainer(textarea: HTMLElement): HTMLElement | null {
  let container = textarea.closest('[data-testid="cellInnerDiv"]');
  
  if (!container) {
    let element = textarea.parentElement;
    for (let i = 0; i < 5; i++) {
      if (!element) break;
      const computed = window.getComputedStyle(element);
      const width = parseFloat(computed.width);
      if (width > 400 && width < 800) {
        container = element;
        break;
      }
      element = element.parentElement;
    }
  }
  
  return container as HTMLElement | null;
}

function applyLayoutAndShow(width: number) {
  if (!overlayContainer) return;
  
  const isNarrow = width < 450;
  overlayContainer.setAttribute('data-layout', isNarrow ? 'narrow' : 'wide');
  overlayContainer.setAttribute('data-context', 'inline');
  
  overlayContainer.style.paddingLeft = '16px';
  overlayContainer.style.paddingRight = '16px';
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

function positionOverlay(textarea: HTMLElement) {
  if (!overlayContainer) return;

  if (overlayContainer.parentElement) {
    overlayContainer.remove();
  }

  const toolbar = findToolbar(textarea);
  
  if (toolbar && toolbar.parentElement) {
    const parent = toolbar.parentElement;
    const nextSibling = toolbar.nextSibling;
    
    if (nextSibling) {
      parent.insertBefore(overlayContainer, nextSibling);
    } else {
      parent.appendChild(overlayContainer);
    }
    
    const parentWidth = parent.getBoundingClientRect().width;
    const width = Math.max(parentWidth, 300);
    
    overlayContainer.style.width = `${width}px`;
    overlayContainer.style.maxWidth = '100%';
    overlayContainer.style.boxSizing = 'border-box';
    
    applyLayoutAndShow(width);
    
    if (!observerSetup) {
      setTimeout(() => {
        setupResizeObserver(textarea);
      }, 200);
    }
  } else {
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
        
        applyLayoutAndShow(width);
        return;
      }
      container = container.parentElement;
    }
    
    overlayContainer.style.display = 'none';
  }
}

function setupResizeObserver(textarea: HTMLElement) {
  if (observerSetup) {
    return;
  }

  const composeContainer = findComposeContainer(textarea);
  
  if (composeContainer) {
    if (resizeObserver) {
      resizeObserver.disconnect();
    }

    resizeObserver = new ResizeObserver(() => {
      if (updateTimeout) {
        clearTimeout(updateTimeout);
      }
      
      updateTimeout = window.setTimeout(() => {
        if (currentTextarea && overlayContainer) {
          positionOverlay(currentTextarea);
        }
        updateTimeout = null;
      }, 500) as unknown as number;
    });
    
    resizeObserver.observe(composeContainer);
    observerSetup = true;
  }
}

function handleComposeBoxOpened(textarea: HTMLElement) {
  try {
    if (isUIVisible && currentTextarea === textarea) {
      return;
    }

    if (!isHomeCompose(textarea)) {
      return;
    }

    currentTextarea = textarea;
    
    createOverlay();
    positionOverlay(textarea);
    
    if ((window as any).__postGuyShowUI) {
      (window as any).__postGuyShowUI();
      isUIVisible = true;
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
    handleComposeBoxOpened(textarea);
  };

  const handleFocus = () => {
    handleComposeBoxOpened(textarea);
  };

  textarea.addEventListener('click', handleClick);
  textarea.addEventListener('focus', handleFocus);

  textareaEventListeners.set(textarea, { click: handleClick, focus: handleFocus });
  activeTextareas.add(textarea);
}

function cleanupUI() {
  if (overlayRoot) {
    try {
      overlayRoot.unmount();
    } catch (error) {
      // Silently handle unmount errors
    }
    overlayRoot = null;
  }

  if (overlayContainer) {
    if (overlayContainer.parentElement) {
      overlayContainer.remove();
    }
    overlayContainer = null;
  }

  isUIVisible = false;
  currentTextarea = null;
  observerSetup = false;

  if (resizeObserver) {
    resizeObserver.disconnect();
    resizeObserver = null;
  }

  if (updateTimeout) {
    clearTimeout(updateTimeout);
    updateTimeout = null;
  }

  for (const textarea of activeTextareas) {
    const listeners = textareaEventListeners.get(textarea);
    if (listeners) {
      textarea.removeEventListener('click', listeners.click);
      textarea.removeEventListener('focus', listeners.focus);
    }
  }
  activeTextareas.clear();
}

function observeComposeBoxes() {
  if (mutationObserver) {
    mutationObserver.disconnect();
  }

  mutationObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          const element = node as Element;

          for (const selector of HOME_COMPOSE_SELECTORS) {
            const textarea = element.querySelector(selector) ||
                            (element.matches(selector) ? element : null);

            if (textarea && isHomeCompose(textarea as HTMLElement)) {
              attachEventListeners(textarea as HTMLElement);
              return;
            }
          }
        }
      }
    }
  });

  mutationObserver.observe(document.body, {
    childList: true,
    subtree: true
  });

  for (const selector of HOME_COMPOSE_SELECTORS) {
    const existingTextarea = document.querySelector(selector);
    if (existingTextarea && isHomeCompose(existingTextarea as HTMLElement)) {
      attachEventListeners(existingTextarea as HTMLElement);
      break;
    }
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', observeComposeBoxes);
} else {
  observeComposeBoxes();
}

let lastUrl = location.href;
const navigationObserver = new MutationObserver(() => {
  const currentUrl = location.href;
  if (currentUrl !== lastUrl) {
    lastUrl = currentUrl;

    cleanupUI();

    setTimeout(() => {
      observeComposeBoxes();
    }, 500);
  }
});

navigationObserver.observe(document, {
  subtree: true,
  childList: true
});
