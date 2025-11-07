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
    
    // Check if we're in a DM context - check the element itself first!
    const isDMTextarea = element.getAttribute('data-testid') === 'dmComposerTextInput';
    const isDMParent = element.closest('[data-testid="DMDrawer"]') || 
                       element.closest('[data-testid="DMComposer"]');
    const isDMOnPage = document.querySelector('[data-testid="DMDrawer"]');
    
    console.log('[DEBUG] DM detection - textarea:', isDMTextarea, 'parent:', !!isDMParent, 'onPage:', !!isDMOnPage);
    
    if (isDMTextarea || isDMParent || isDMOnPage) {
      console.log('[ReplyGuy] ✓ DM context detected, extracting DM messages...');
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
    console.log('[DEBUG DM] Starting DM extraction...');
    
    // Don't require DMDrawer - search the entire page for messages
    // When in an active conversation, messages are in the main content area
    
    // Try multiple strategies to find messages
    let messages: NodeListOf<Element> | null = null;
    
    // Strategy 1: Look for message entries anywhere on page
    messages = document.querySelectorAll('[data-testid="messageEntry"]');
    console.log('[DEBUG DM] Strategy 1 - [data-testid="messageEntry"]:', messages.length);
    
    // Strategy 2: Look for any element with "message" in testid
    if (messages.length === 0) {
      messages = document.querySelectorAll('[data-testid*="message"]');
      console.log('[DEBUG DM] Strategy 2 - [data-testid*="message"]:', messages.length);
    }
    
    // Strategy 3: Look for conversation items in main
    if (messages.length === 0) {
      const main = document.querySelector('main');
      console.log('[DEBUG DM] Strategy 3 - main element found:', !!main);
      if (main) {
        // Look for typical DM message containers
        messages = main.querySelectorAll('div[data-testid*="DM"], article, [role="article"]');
        console.log('[DEBUG DM] Strategy 3 - conversation items in main:', messages.length);
      }
    }
    
    // Strategy 4: Look for tweetText elements (DMs use same component)
    if (messages.length === 0) {
      messages = document.querySelectorAll('[data-testid="tweetText"]');
      console.log('[DEBUG DM] Strategy 4 - [data-testid="tweetText"]:', messages.length);
    }
    
    // Strategy 5: Very broad search for any text containers with dir attribute
    if (messages.length === 0) {
      const main = document.querySelector('main');
      if (main) {
        messages = main.querySelectorAll('div[dir="auto"]');
        console.log('[DEBUG DM] Strategy 5 - div[dir="auto"] in main:', messages.length);
      }
    }
    
    if (!messages || messages.length === 0) {
      console.warn('[ReplyGuy] No messages found with any strategy');
      return {
        text: 'No messages in conversation',
        author: 'Unknown'
      };
    }

    // Extract last 5 messages for context
    const last5Messages = Array.from(messages).slice(-5);
    console.log('[DEBUG DM] Extracting last', last5Messages.length, 'messages');
    
    const messageTexts: string[] = [];
    
    for (let i = 0; i < last5Messages.length; i++) {
      const message = last5Messages[i];
      let messageText = '';
      
      // Try specific selectors
      const textSelectors = [
        '[data-testid="tweetText"]',
        'span[data-testid="tweetText"]',
        '[lang]',
        'span[dir="auto"]',
        'div[dir="ltr"]',
        'div[dir="auto"]'
      ];
      
      for (const selector of textSelectors) {
        const textElement = message.querySelector(selector);
        if (textElement && textElement.textContent && textElement.textContent.trim()) {
          messageText = textElement.textContent;
          break;
        }
      }
      
      // Fallback to full text
      if (!messageText || messageText.trim().length === 0) {
        messageText = message.textContent || '';
      }
      
      // Clean up (remove timestamps, reactions)
      messageText = messageText.replace(/\d{1,2}:\d{2}\s?(AM|PM)?/gi, '').trim();
      
      if (messageText && messageText.length > 0) {
        messageTexts.push(messageText);
        console.log('[DEBUG DM] Message', i + 1, ':', messageText.substring(0, 50));
      }
    }
    
    if (messageTexts.length === 0) {
      console.warn('[ReplyGuy] No message text extracted from any messages');
      return {
        text: 'Message text not available',
        author: 'Unknown'
      };
    }
    
    // Use the last message as primary text, others as context
    const lastMessageText = messageTexts[messageTexts.length - 1];
    const contextMessages = messageTexts.slice(0, -1);
    
    console.log('[ReplyGuy] ✓ Extracted DM - Last message:', lastMessageText.substring(0, 100));
    console.log('[ReplyGuy] ✓ Context messages:', contextMessages.length);
    
    // Get sender name
    const lastMessage = last5Messages[last5Messages.length - 1];
    let author = 'DM Sender';
    const authorElement = lastMessage.querySelector('[data-testid="User-Name"]');
    if (authorElement) {
      author = authorElement.textContent || 'DM Sender';
    }
    
    return {
      text: lastMessageText.trim(),
      author: author.trim(),
      threadContext: contextMessages.length > 0 ? contextMessages : undefined
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
