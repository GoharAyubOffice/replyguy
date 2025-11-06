import type { TweetContext } from "~src/types";

export const TWITTER_SELECTORS = {
  REPLY_TEXTAREA: '[data-testid="tweetTextarea_0"]',
  REPLY_CONTAINER: '[data-testid="tweetTextarea_0"]',
  TWEET_TEXT: '[data-testid="tweetText"]',
  TWEET_AUTHOR: '[data-testid="User-Name"]',
  REPLY_BUTTON: '[data-testid="reply"]',
  TWEET_DETAIL: '[data-testid="tweet"]'
};

export function extractTweetContext(element: Element): TweetContext | null {
  try {
    // Find the tweet container
    const tweetContainer = element.closest('[data-testid="tweet"]');
    if (!tweetContainer) return null;

    // Extract tweet text
    const tweetTextElement = tweetContainer.querySelector(TWITTER_SELECTORS.TWEET_TEXT);
    const text = tweetTextElement?.textContent || '';

    // Extract author
    const authorElement = tweetContainer.querySelector(TWITTER_SELECTORS.TWEET_AUTHOR);
    const author = authorElement?.textContent || 'Unknown';

    // Try to extract thread context
    const threadContext = extractThreadContext(tweetContainer);

    return {
      text,
      author,
      threadContext: threadContext.length > 0 ? threadContext : undefined
    };
  } catch (error) {
    console.error("Error extracting tweet context:", error);
    return null;
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
  return document.querySelector(TWITTER_SELECTORS.REPLY_TEXTAREA);
}

export function insertTextIntoReply(text: string): void {
  const textarea = findReplyTextarea();
  if (!textarea) return;

  // Set the text
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
  
  // Focus on the textarea
  textarea.focus();
}
