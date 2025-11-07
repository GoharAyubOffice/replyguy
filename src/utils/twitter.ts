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
    console.log('[ReplyGuy] Extracting context from element:', element);
    
    // Check if we're in a DM context
    const isDM = element.closest('[data-testid="DMDrawer"]') || 
                 element.closest('[data-testid="DMComposer"]') ||
                 document.querySelector('[data-testid="DMDrawer"]');
    
    if (isDM) {
      console.log('[ReplyGuy] DM context detected, extracting DM message...');
      return extractDMContext();
    }
    
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

function extractDMContext(): TweetContext | null {
  try {
    // Find the message container in DMs
    const dmDrawer = document.querySelector('[data-testid="DMDrawer"]');
    if (!dmDrawer) {
      console.warn('[ReplyGuy] DM Drawer not found');
      return {
        text: 'DM context not available',
        author: 'Unknown'
      };
    }

    // Get all messages in the conversation
    const messages = dmDrawer.querySelectorAll('[data-testid="messageEntry"]');
    
    if (messages.length === 0) {
      console.warn('[ReplyGuy] No messages found in DM');
      return {
        text: 'No messages in conversation',
        author: 'Unknown'
      };
    }

    // Get the last message (most recent)
    const lastMessage = messages[messages.length - 1];
    
    // Extract message text - try multiple selectors
    let messageText = '';
    const textSelectors = [
      '[data-testid="tweetText"]',
      '[lang]',
      'span[dir="auto"]'
    ];
    
    for (const selector of textSelectors) {
      const textElement = lastMessage.querySelector(selector);
      if (textElement && textElement.textContent) {
        messageText = textElement.textContent;
        break;
      }
    }
    
    // If still no text, get all text content
    if (!messageText) {
      messageText = lastMessage.textContent || 'Message text not available';
    }
    
    console.log('[ReplyGuy] Extracted DM message:', messageText.substring(0, 50));
    
    // Try to get sender name
    let author = 'DM Sender';
    const authorElement = lastMessage.querySelector('[data-testid="User-Name"]');
    if (authorElement) {
      author = authorElement.textContent || 'DM Sender';
    }
    
    console.log('[ReplyGuy] DM sender:', author);
    
    return {
      text: messageText.trim(),
      author: author.trim()
    };
  } catch (error) {
    console.error('[ReplyGuy] Error extracting DM context:', error);
    return {
      text: 'Error extracting DM message',
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

  // Focus and click to activate editor
  textarea.focus();
  textarea.click();

  // For Draft.js editors (what Twitter uses), use paste event
  if (textarea.getAttribute('contenteditable') === 'true') {
    // Create a paste event with the text
    const dataTransfer = new DataTransfer();
    dataTransfer.setData('text/plain', text);
    
    const pasteEvent = new ClipboardEvent('paste', {
      bubbles: true,
      cancelable: true,
      clipboardData: dataTransfer
    });
    
    textarea.dispatchEvent(pasteEvent);
    
    // Also trigger input event
    textarea.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true }));
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

    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    textarea.dispatchEvent(new Event('change', { bubbles: true }));
  }
  
  textarea.focus();
  console.log('[ReplyGuy] Text inserted via paste event');
}
