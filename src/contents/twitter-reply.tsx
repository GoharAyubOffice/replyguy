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
    width: 100%;
    display: block;
    padding: 0;
    margin: 0;
  `;
  
  return overlayContainer;
}

function positionOverlay(textarea: HTMLElement) {
  if (!overlayContainer) return;

  // Try to find the toolbar (best insertion point - right before toolbar)
  let toolbar = document.querySelector(TWITTER_SELECTORS.REPLY_COMPOSER);
  
  // Find the reply composer wrapper (parent of textarea and toolbar)
  let composerWrapper = textarea.closest('div[role="group"]') || 
                        textarea.closest('form') ||
                        textarea.parentElement?.parentElement;
  
  if (!composerWrapper) {
    console.warn('[ReplyGuy] Could not find composer wrapper');
    composerWrapper = textarea.parentElement;
  }

  // Remove from previous parent if exists
  if (overlayContainer.parentElement) {
    overlayContainer.remove();
  }

  // Insert before the toolbar, or after textarea if toolbar not found
  if (!overlayContainer.parentElement && composerWrapper) {
    if (toolbar && toolbar.parentElement === composerWrapper) {
      // Insert before toolbar (ideal placement)
      composerWrapper.insertBefore(overlayContainer, toolbar);
      console.log('[ReplyGuy] Inserted before toolbar');
    } else {
      // Find textarea's direct container and insert after it
      let textareaContainer = textarea.parentElement;
      for (let i = 0; i < 3 && textareaContainer && textareaContainer !== composerWrapper; i++) {
        if (textareaContainer.nextSibling) {
          textareaContainer.parentElement?.insertBefore(overlayContainer, textareaContainer.nextSibling);
          console.log('[ReplyGuy] Inserted after textarea container');
          break;
        }
        textareaContainer = textareaContainer.parentElement;
      }
      
      // Fallback: append to composer wrapper
      if (!overlayContainer.parentElement) {
        composerWrapper.appendChild(overlayContainer);
        console.log('[ReplyGuy] Appended to composer wrapper');
      }
    }
    
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
