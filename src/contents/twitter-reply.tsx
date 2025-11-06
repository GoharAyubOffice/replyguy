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
    z-index: 10000;
    pointer-events: auto;
    margin-top: 8px;
    width: 100%;
    display: block;
  `;
  
  return overlayContainer;
}

function positionOverlay(textarea: HTMLElement) {
  if (!overlayContainer) return;

  // Find a good parent container to attach to
  let replyContainer = textarea.closest('[data-testid="cellInnerDiv"]') || 
                       textarea.closest('div[role="group"]') ||
                       textarea.parentElement;
  
  if (!replyContainer) {
    console.warn('[ReplyGuy] Could not find reply container, using body');
    replyContainer = document.body;
  }

  // Remove from previous parent if exists
  if (overlayContainer.parentElement && overlayContainer.parentElement !== replyContainer) {
    overlayContainer.remove();
  }

  // Insert after the textarea container
  if (!overlayContainer.parentElement) {
    // Find the closest block-level parent of the textarea
    let insertTarget = textarea;
    let parent = textarea.parentElement;
    
    // Go up a few levels to find a good insertion point
    for (let i = 0; i < 5 && parent; i++) {
      insertTarget = parent;
      parent = parent.parentElement;
    }
    
    // Insert after the textarea's container
    if (insertTarget.nextSibling) {
      insertTarget.parentElement?.insertBefore(overlayContainer, insertTarget.nextSibling);
    } else {
      insertTarget.parentElement?.appendChild(overlayContainer);
    }
    
    console.log('[ReplyGuy] Overlay positioned after:', insertTarget);
    
    // Initialize React app now that it's in the DOM
    if (!overlayRoot) {
      overlayRoot = createRoot(overlayContainer);
      overlayRoot.render(<App />);
    }
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

window.addEventListener('scroll', () => {
  if (currentTextarea && overlayContainer) {
    positionOverlay(currentTextarea);
  }
});

window.addEventListener('resize', () => {
  if (currentTextarea && overlayContainer) {
    positionOverlay(currentTextarea);
  }
});

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', observeReplyBoxes);
} else {
  observeReplyBoxes();
}

export default App;
