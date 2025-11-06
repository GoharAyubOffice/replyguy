import type { TweetContext } from "~src/types";

export const TWITTER_SELECTORS = {
  // Multiple selectors to try for reply textarea
  REPLY_TEXTAREA: '[data-testid="tweetTextarea_0"]',
  REPLY_TEXTAREA_ALT: 'div[contenteditable="true"][role="textbox"]',
  REPLY_TEXTAREA_ALT2: '.public-DraftEditor-content',
  REPLY_COMPOSER: '[data-testid="toolBar"]', // The toolbar below textarea
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

  // Check if it's a contenteditable div (Twitter uses Draft.js with contenteditable)
  if (textarea.getAttribute('contenteditable') === 'true') {
    console.log('[ReplyGuy] Using Selection/Range API for contenteditable div');
    
    // Focus first
    textarea.focus();
    
    // Method 1: Try using execCommand for better Draft.js compatibility
    try {
      // Select all existing content
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(textarea);
      range.collapse(false); // Collapse to end
      selection?.removeAllRanges();
      selection?.addRange(range);
      
      // Select all and delete
      document.execCommand('selectAll', false);
      // Insert new text using insertText command (best for Draft.js)
      const success = document.execCommand('insertText', false, text);
      
      if (success) {
        console.log('[ReplyGuy] Text inserted using execCommand insertText');
        
        // Dispatch proper events for Draft.js
        textarea.dispatchEvent(new InputEvent('beforeinput', { 
          bubbles: true, 
          cancelable: true,
          inputType: 'insertText',
          data: text
        }));
        textarea.dispatchEvent(new InputEvent('input', { 
          bubbles: true, 
          cancelable: true,
          inputType: 'insertText',
          data: text
        }));
        
        // Focus again to ensure cursor is visible
        textarea.focus();
        return;
      }
    } catch (e) {
      console.log('[ReplyGuy] execCommand failed, trying alternative method:', e);
    }
    
    // Method 2: Fallback - Use Selection API with Range manipulation
    try {
      const selection = window.getSelection();
      if (selection) {
        // Select all content
        const range = document.createRange();
        range.selectNodeContents(textarea);
        range.deleteContents();
        
        // Create text node and insert
        const textNode = document.createTextNode(text);
        range.insertNode(textNode);
        
        // Move cursor to end
        range.setStartAfter(textNode);
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);
        
        // Dispatch events
        textarea.dispatchEvent(new InputEvent('beforeinput', { 
          bubbles: true, 
          cancelable: true,
          inputType: 'insertText',
          data: text
        }));
        textarea.dispatchEvent(new InputEvent('input', { 
          bubbles: true, 
          cancelable: true,
          inputType: 'insertText',
          data: text
        }));
        
        console.log('[ReplyGuy] Text inserted using Selection/Range API');
        textarea.focus();
        return;
      }
    } catch (e) {
      console.log('[ReplyGuy] Selection/Range API failed, using last resort:', e);
    }
    
    // Method 3: Last resort - direct manipulation (may not be fully editable)
    console.warn('[ReplyGuy] Using last resort textContent method (may not be fully editable)');
    textarea.textContent = text;
    textarea.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true }));
    textarea.focus();
    
  } else {
    // For actual textarea elements
    console.log('[ReplyGuy] Using textarea value setter');
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
    textarea.focus();
  }
  
  console.log('[ReplyGuy] Text insertion completed');
}
