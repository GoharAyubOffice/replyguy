import OpenAI from "openai";
import type { GenerateReplyParams, GeneratePostParams, PresetTone, PostCategory } from "~src/types";

const TONE_PROMPTS: Record<PresetTone, string> = {
  friendly: 
    "warm but simple, like chatting with a teammate. short lines, light tone, no slang, no hype. keep it human and calm.",

  casual: 
    "relaxed and direct. small sentences. simple words. no slang. talk like a normal engineer replying fast between tasks.",

  supportive: 
    "steady and honest. acknowledge their point quickly then add a small thought. no dramatic wording, no cliches, just human support.",

  humorous: 
    "dry engineer humor. subtle, light, not loud. tiny twist or observation, nothing forced, no memes, no slang.",

  thoughtful: 
    "quiet, simple reflection. start from their point and add one small idea. no lecturing, no complex structure.",

  analytical: 
    "clean breakdown. one clear point, one supporting detail. simple language. short sentences. keep it human and not formal.",

  creative: 
    "simple but fresh idea. small twist or different angle. keep it grounded and straightforward. no dramatic creativity."
};

const POST_CATEGORY_PROMPTS: Record<PostCategory, string> = {
  insight: 
    "share a simple observation or learning. one clear point. casual tone. no hype words. real and grounded.",

  question: 
    "ask something genuine you're curious about. simple question. no rhetorical drama. just real curiosity.",

  announcement: 
    "share news or updates directly. clear and simple. no marketing tone. just informative and human.",

  tip: 
    "share one useful thing. short and practical. no teaching tone. like sharing with a friend.",

  story: 
    "quick personal moment or experience. simple narrative. casual language. no dramatic storytelling.",

  opinion: 
    "simple take on something. honest and direct. no loud claims. just your genuine view.",

  fun: 
    "light and playful. simple humor or observation. keep it genuine. no forced jokes.",

  custom: ""
};


export async function generateReply({
  tweetContext,
  tone,
  customDescription,
  model,
  apiKey
}: GenerateReplyParams): Promise<string> {
  if (!apiKey) {
    throw new Error("OpenAI API key is required. Please add it in the extension settings.");
  }

  const openai = new OpenAI({
    apiKey,
    dangerouslyAllowBrowser: true
  });

  const toneInstruction = customDescription || TONE_PROMPTS[tone as PresetTone] || tone;
  
  let contextMessage = `Tweet: "${tweetContext.text}"`;
  
  if (tweetContext.threadContext && tweetContext.threadContext.length > 0) {
    contextMessage += `\n\nThread context:\n${tweetContext.threadContext.join('\n')}`;
  }

  const systemPrompt = customDescription 
  ? `You write short, human, engineer-style X (Twitter) replies. No AI tone. No slang.

  CUSTOM TONE (follow exactly):
  ${toneInstruction}

  BASE RULES:
  - 60–120 characters
  - mostly lowercase except names
  - short, tight sentences. fragments allowed.
  - small imperfections allowed: missing caps, slight pause, trailing "..."
  - simple vocabulary only. no fancy words. no slang.
  - contractions always
  - quick start. no warm-up phrases.
  - avoid commas unless needed
  - banned phrases: “that's impressive”, “excited to see”, “furthermore”, “in conclusion”
  - no hashtags unless the topic demands it
  - 0–1 emoji max, only if it truly fits
  - be specific to their tweet
  - raw text only`

  : `You write short, human, engineer-style X (Twitter) replies. No AI tone. No slang.

  CRITICAL RULES:
  - 60–120 characters
  - mostly lowercase
  - tight, simple sentences
  - small imperfections allowed
  - contractions always
  - no warm-up lines
  - banned phrases: “that's impressive”, “excited to see”, "totally get that",“furthermore”, “in conclusion”
  - no slang or hype words
  - simple vocabulary
  - avoid commas unless required
  - no hashtags unless needed
  - refer to something specific in their tweet
  - raw text only`;



  try {
    const completion = await openai.chat.completions.create({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: contextMessage }
      ],
      max_tokens: 100,
      temperature: 0.8
    });

    const reply = completion.choices[0]?.message?.content?.trim();
    
    if (!reply) {
      throw new Error("No reply generated");
    }

    return reply;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to generate reply: ${error.message}`);
    }
    throw new Error("Failed to generate reply");
  }
}

export async function generatePost({
  category,
  customDescription,
  model,
  apiKey
}: GeneratePostParams): Promise<string> {
  if (!apiKey) {
    throw new Error("OpenAI API key is required. Please add it in the extension settings.");
  }

  const openai = new OpenAI({
    apiKey,
    dangerouslyAllowBrowser: true
  });

  const categoryInstruction = customDescription || POST_CATEGORY_PROMPTS[category as PostCategory] || category;
  
  const systemPrompt = customDescription 
  ? `You write short, human, engaging X (Twitter) posts. No AI tone. No slang.

  CUSTOM INSTRUCTIONS (follow exactly):
  ${categoryInstruction}

  BASE RULES:
  - 100–240 characters
  - mostly lowercase except names and emphasis
  - short, punchy sentences. fragments allowed.
  - small imperfections allowed: missing caps, slight pause, trailing "..."
  - simple vocabulary only. no fancy words. no slang.
  - contractions always
  - direct start. no warm-up phrases.
  - avoid commas unless needed
  - banned phrases: "excited to announce", "thrilled to share", "furthermore", "in conclusion", "game changer"
  - hashtags only if truly relevant
  - 0–2 emojis max, only if they fit naturally
  - be specific and concrete
  - raw text only`

  : `You write short, human, engaging X (Twitter) posts. No AI tone. No slang.

  POST TYPE: ${categoryInstruction}

  CRITICAL RULES:
  - 100–240 characters
  - mostly lowercase
  - tight, punchy sentences
  - small imperfections allowed
  - contractions always
  - no warm-up lines
  - banned phrases: "excited to announce", "thrilled to share", "game changer", "furthermore", "in conclusion"
  - no slang or hype words
  - simple vocabulary
  - avoid commas unless required
  - hashtags only when relevant
  - be specific and concrete
  - raw text only`;

  try {
    const completion = await openai.chat.completions.create({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: "Generate a post based on the instructions above." }
      ],
      max_tokens: 150,
      temperature: 0.9
    });

    const post = completion.choices[0]?.message?.content?.trim();
    
    if (!post) {
      throw new Error("No post generated");
    }

    return post;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to generate post: ${error.message}`);
    }
    throw new Error("Failed to generate post");
  }
}
