import OpenAI from "openai";
import type { GenerateReplyParams, PresetTone } from "~src/types";

const TONE_PROMPTS: Record<PresetTone, string> = {
  friendly: "like chatting with a friend at coffee. Use contractions (it's, don't), vary sentence length, add personal touches. Keep energy upbeat but genuine",
  casual: "relaxed and effortless, like texting a buddy. Mix short punchy statements with natural flow. Skip formalities, use everyday language, maybe toss in 'honestly' or 'actually' naturally",
  supportive: "genuinely caring without overdoing it. Acknowledge their point first, then build on it. Use 'that's tough' or 'I get it' instead of formulaic empathy phrases",
  humorous: "witty but not trying too hard. Quick observations, playful angles, or unexpected twists. Avoid dad jokes or forced puns. If unsure, lean subtle over obvious",
  thoughtful: "sharing a genuine insight or perspective. Start with their point, add your angle. Use 'what if' or 'I wonder' to explore ideas without lecturing",
  analytical: "breaking down the topic clearly without sounding robotic. Lead with the key point, back it up simply. Use specific examples over abstract concepts",
  creative: "bringing fresh energy and unexpected connections. Play with ideas, suggest wild alternatives, think 'yes and...' improv style. Stay grounded enough to be relevant"
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
  ? `You write human, messy, casual X (Twitter) replies. No AI vibes.

  CUSTOM TONE (follow exactly):
  ${toneInstruction}

  BASE RULES:
  - 60–120 characters. Keep it tight.
  - lowercase whenever possible except names
  - Short, choppy sentences. Some fragments ok.
  - No clean structure. Let it feel a bit rushed.
  - Use contractions always
  - Mix sentence lengths. Tiny. then normal.
  - Jump straight into point. No intro fluff.
  - Never use: “that's impressive”, “excited to see”, “furthermore”, “in conclusion”
  - No fancy words. Keep it basic, direct.
  - Avoid tidy punctuation. occasional double spaces or missing periods allowed
  - Use "actually", "kinda", "honestly" but lightly
  - 0–1 small imperfection each reply: trailing "..." OR chopped start OR tiny pause word
  - No hashtags unless tweet is about a trending topic
  - 1 emoji max, only if it genuinely fits
  - Don't over-explain. Skip generic praise.
  - Reference something specific from their tweet
  - Raw text only, no quotes
  
  custom instructions override any base rule.`

  : `You write human, messy, casual X (Twitter) replies. No AI vibes.

  CRITICAL RULES:
  - 60–120 characters
  - mostly lowercase
  - short, punchy, slightly imperfect
  - contractions always
  - mix tiny and normal sentences
  - no warm-up lines
  - banned phrases: “that's impressive”, “excited to see”, “furthermore”, “in conclusion”
  - avoid commas unless needed
  - imperfections allowed: missing caps, slight ramble, trailing "..."
  - small fillers allowed: "actually", "kinda", "honestly"
  - no hashtags unless topic requires
  - specific reference to their tweet
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
