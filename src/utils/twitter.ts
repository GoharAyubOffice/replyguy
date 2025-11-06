import type { TweetContext } from "~src/types";

export const TWITTER_SELECTORS = {
  // Multiple selectors to try for reply textarea
  REPLY_TEXTAREA: '[data-testid="tweetTextarea_0"]',
  REPLY_TEXTAREA_ALT: 'div[contenteditable="true"][role="textbox"]',
  REPLY_TEXTAREA_ALT2: '.public-DraftEditor-content',
  REPLY_CONTAINER: '[data-testid="tweetTextarea_0"]',
  TWEET_TEXT: '[data-testid="tweetText"]',
  TWEET_AUTHOR: '[data-testid="User-Name"]',
  REPLY_BUTTON: '[data-testid="reply"]',
  TWEET_DETAIL: '[data-testid="tweet"]',
  CELL_INNER: '[data-testid="cellInnerDiv"]'
};

export function extractTweetContext(element: Element): TweetContext | null {
  try {
    console.log('[ReplyGuy] Extracting tweet context from element:', element);
    
    // Try to find the tweet container - try multiple approaches
    let tweetContainer = element.closest('[data-testid="tweet"]');
    
    if (!tweetContainer) {
      // Try finding any tweet on the page
      tweetContainer = document.querySelector('[data-testid="tweet"]');
      console.log('[ReplyGuy] Using fallback: found tweet container on page:', !!tweetContainer);
    }
    
    // Even if we don't find a tweet container, try to extract what we can
    let text = '';
    let author = 'Unknown';
    
    if (tweetContainer) {
      // Extract tweet text
      const tweetTextElement = tweetContainer.querySelector(TWITTER_SELECTORS.TWEET_TEXT);
      text = tweetTextElement?.textContent || '';
      console.log('[ReplyGuy] Extracted text:', text.substring(0, 50));

      // Extract author
      const authorElement = tweetContainer.querySelector(TWITTER_SELECTORS.TWEET_AUTHOR);
      author = authorElement?.textContent || 'Unknown';
      console.log('[ReplyGuy] Extracted author:', author);

      // Try to extract thread context
      const threadContext = extractThreadContext(tweetContainer);
      console.log('[ReplyGuy] Extracted thread context:', threadContext.length, 'tweets');

      return {
        text,
        author,
        threadContext: threadContext.length > 0 ? threadContext : undefined
      };
    } else {
      // Return a basic context even if we can't find the tweet
      console.warn('[ReplyGuy] Could not find tweet container, returning basic context');
      return {
        text: 'Tweet context not available',
        author: 'Unknown'
      };
    }
  } catch (error) {
    console.error('[ReplyGuy] Error extracting tweet context:', error);
    // Return a basic context instead of null
    return {
      text: 'Error extracting tweet',
      author: 'Unknown'
    };
  }
}

function extractThreadContext(currentTweet: Element): string[] {
  const context: string[] = [];
  
  try {
    // Look for parent tweets in the thread
    const allTweets = document.querySelectorAll('[data-testid="tweet"]');
    const currentIndex = Array.from(allTweets).indexOf(currentTweet as any);
    
    // Get up to 3 previous tweets for context
    for (let i = Math.max(0, currentIndex - 3); i < currentIndex; i++) {
      const tweet = allTweets[i];
      const tweetText = tweet?.querySelector(TWITTER_SELECTORS.TWEET_TEXT);
      if (tweetText?.textContent) {
        context.push(tweetText.textContent);
      }
    }
  } catch (error) {
    console.error("Error extracting thread context:", error);
  }
  
  return context;
}

export function findReplyTextarea(): HTMLElement | null {
  // Try multiple selectors
  const selectors = [
    TWITTER_SELECTORS.REPLY_TEXTAREA,
    TWITTER_SELECTORS.REPLY_TEXTAREA_ALT,
    TWITTER_SELECTORS.REPLY_TEXTAREA_ALT2
  ];
  
  for (const selector of selectors) {
    const element = document.querySelector(selector);
    if (element) {
      console.log('[ReplyGuy] Found textarea with selector:', selector);
      return element as HTMLElement;
    }
  }
  
  console.log('[ReplyGuy] No textarea found');
  return null;
}

export function insertTextIntoReply(text: string): void {
  const textarea = findReplyTextarea();
  if (!textarea) {
    console.warn('[ReplyGuy] No textarea found to insert text');
    return;
  }

  console.log('[ReplyGuy] Inserting text into reply:', text.substring(0, 50));

  // Check if it's a contenteditable div (Twitter uses these)
  if (textarea.getAttribute('contenteditable') === 'true') {
    // For contenteditable divs
    textarea.textContent = text;
    textarea.innerText = text;
    
    // Trigger input event
    textarea.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true }));
    textarea.dispatchEvent(new Event('change', { bubbles: true }));
  } else {
    // For actual textarea elements
    const nativeTextareaSetter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype,
      "value"
    )?.set;
    
    if (nativeTextareaSetter) {
      nativeTextareaSetter.call(textarea, text);
    } else {
      (textarea as any).value = text;
    }

    // Trigger input event to notify Twitter
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    textarea.dispatchEvent(new Event('change', { bubbles: true }));
  }
  
  // Focus on the textarea
  textarea.focus();
  console.log('[ReplyGuy] Text inserted successfully');
}
