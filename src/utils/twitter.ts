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
    const isDMTextarea = element.getAttribute('data-testid') === 'dmComposerTextInput';
    const isDMParent = element.closest('[data-testid="DMDrawer"]') || 
                       element.closest('[data-testid="DMComposer"]');
    const isDMOnPage = document.querySelector('[data-testid="DMDrawer"]');
    
    if (isDMTextarea || isDMParent || isDMOnPage) {
      return extractDMContext();
    }
    
    let tweetContainer = element.closest('[data-testid="tweet"]');
    
    if (!tweetContainer) {
      tweetContainer = document.querySelector('[data-testid="tweet"]');
    }
    
    let text = '';
    let author = 'Unknown';
    
    if (tweetContainer) {
      const tweetTextElement = tweetContainer.querySelector(TWITTER_SELECTORS.TWEET_TEXT);
      text = tweetTextElement?.textContent || '';

      const authorElement = tweetContainer.querySelector(TWITTER_SELECTORS.TWEET_AUTHOR);
      author = authorElement?.textContent || 'Unknown';

      const threadContext = extractThreadContext(tweetContainer);

      return {
        text,
        author,
        threadContext: threadContext.length > 0 ? threadContext : undefined
      };
    } else {
      return {
        text: 'Tweet context not available',
        author: 'Unknown'
      };
    }
  } catch (error) {
    return {
      text: 'Error extracting tweet',
      author: 'Unknown'
    };
  }
}

function extractDMContext(): TweetContext | null {
  try {
    let messages: NodeListOf<Element> | null = null;
    
    messages = document.querySelectorAll('[data-testid="messageEntry"]');
    
    if (messages.length === 0) {
      messages = document.querySelectorAll('[data-testid*="message"]');
    }
    
    if (messages.length === 0) {
      const main = document.querySelector('main');
      if (main) {
        messages = main.querySelectorAll('div[data-testid*="DM"], article, [role="article"]');
      }
    }
    
    if (messages.length === 0) {
      messages = document.querySelectorAll('[data-testid="tweetText"]');
    }
    
    if (messages.length === 0) {
      const main = document.querySelector('main');
      if (main) {
        messages = main.querySelectorAll('div[dir="auto"]');
      }
    }
    
    if (!messages || messages.length === 0) {
      return {
        text: 'No messages in conversation',
        author: 'Unknown'
      };
    }

    const last5Messages = Array.from(messages).slice(-5);
    
    const messageTexts: string[] = [];
    
    for (let i = 0; i < last5Messages.length; i++) {
      const message = last5Messages[i];
      let messageText = '';
      
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
      
      if (!messageText || messageText.trim().length === 0) {
        messageText = message.textContent || '';
      }
      
      messageText = messageText.replace(/\d{1,2}:\d{2}\s?(AM|PM)?/gi, '').trim();
      
      if (messageText && messageText.length > 0) {
        messageTexts.push(messageText);
      }
    }
    
    if (messageTexts.length === 0) {
      return {
        text: 'Message text not available',
        author: 'Unknown'
      };
    }
    
    const lastMessageText = messageTexts[messageTexts.length - 1];
    const contextMessages = messageTexts.slice(0, -1);
    
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
    return {
      text: 'Error extracting DM message',
      author: 'Unknown'
    };
  }
}

function extractThreadContext(currentTweet: Element): string[] {
  const context: string[] = [];
  
  try {
    const allTweets = document.querySelectorAll('[data-testid="tweet"]');
    const currentIndex = Array.from(allTweets).indexOf(currentTweet as any);
    
    for (let i = Math.max(0, currentIndex - 3); i < currentIndex; i++) {
      const tweet = allTweets[i];
      const tweetText = tweet?.querySelector(TWITTER_SELECTORS.TWEET_TEXT);
      if (tweetText?.textContent) {
        context.push(tweetText.textContent);
      }
    }
  } catch (error) {
  }
  
  return context;
}

export function findReplyTextarea(): HTMLElement | null {
  const selectors = [
    TWITTER_SELECTORS.REPLY_TEXTAREA,
    TWITTER_SELECTORS.REPLY_TEXTAREA_ALT,
    TWITTER_SELECTORS.REPLY_TEXTAREA_ALT2
  ];
  
  for (const selector of selectors) {
    const element = document.querySelector(selector);
    if (element) {
      return element as HTMLElement;
    }
  }
  
  return null;
}

export function insertTextIntoReply(text: string): void {
  const textarea = findReplyTextarea();
  if (!textarea) {
    return;
  }

  textarea.focus();
  textarea.click();

  if (textarea.getAttribute('contenteditable') === 'true') {
    const dataTransfer = new DataTransfer();
    dataTransfer.setData('text/plain', text);
    
    const pasteEvent = new ClipboardEvent('paste', {
      bubbles: true,
      cancelable: true,
      clipboardData: dataTransfer
    });
    
    textarea.dispatchEvent(pasteEvent);
    
    textarea.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true }));
  } else {
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
}
