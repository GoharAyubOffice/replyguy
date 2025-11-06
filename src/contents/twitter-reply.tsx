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
    position: fixed;
    z-index: 9999;
    pointer-events: none;
  `;
  
  document.body.appendChild(overlayContainer);

  overlayRoot = createRoot(overlayContainer);
  overlayRoot.render(<App />);

  return overlayContainer;
}

function positionOverlay(textarea: HTMLElement) {
  if (!overlayContainer) return;

  const rect = textarea.getBoundingClientRect();
  
  overlayContainer.style.top = `${rect.bottom + window.scrollY + 8}px`;
  overlayContainer.style.left = `${rect.left + window.scrollX}px`;
  overlayContainer.style.pointerEvents = 'auto';
}

function handleReplyBoxOpened(textarea: HTMLElement) {
  currentTextarea = textarea;
  
  const tweetContext = extractTweetContext(textarea);
  
  if (tweetContext) {
    createOverlay();
    positionOverlay(textarea);
    
    if ((window as any).__replyGuyShowUI) {
      (window as any).__replyGuyShowUI(tweetContext);
    }
  }
}

function observeReplyBoxes() {
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          const element = node as Element;
          
          const textarea = element.querySelector(TWITTER_SELECTORS.REPLY_TEXTAREA) ||
                          (element.matches(TWITTER_SELECTORS.REPLY_TEXTAREA) ? element : null);
          
          if (textarea) {
            handleReplyBoxOpened(textarea as HTMLElement);
          }
        }
      }
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

  const existingTextarea = document.querySelector(TWITTER_SELECTORS.REPLY_TEXTAREA);
  if (existingTextarea) {
    handleReplyBoxOpened(existingTextarea as HTMLElement);
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
