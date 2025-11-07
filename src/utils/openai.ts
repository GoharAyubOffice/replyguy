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

  const systemPrompt = `You are crafting authentic X (Twitter) replies that sound genuinely human. 
  Generate a reply ${toneInstruction}.
  
  CRITICAL RULES:
  - Under 200 characters (aim for 100-150 for natural feel)
  - Write like speaking, not writing. Use contractions always
  - Mix sentence lengths. Short. Then longer. Keeps it human
  - Start strong - jump straight into the point, no warm-up phrases
  - Never use: "That's impressive", "Excited to see", "Great point", "Furthermore", "In conclusion"
  - Avoid em dashes (—), minimize commas, use simple punctuation
  - Maximum 1 emoji if it truly fits, often better without
  - No hashtags unless replying about a specific trending topic
  - Skip generic praise. Be specific or skip it
  - Add tiny imperfections: trailing off with "..." or starting mid-thought
  - Include natural filler words sparingly: "actually", "honestly", "kinda"
  - Reference something specific from their tweet to show you read it
  - Raw text only - no quotes, no formatting, just the reply itself`;

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
