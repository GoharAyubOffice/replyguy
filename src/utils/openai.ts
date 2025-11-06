import OpenAI from "openai";
import type { GenerateReplyParams, PresetTone } from "~src/types";

const TONE_PROMPTS: Record<PresetTone, string> = {
  friendly: "in a warm and friendly tone, like you're talking to a good friend",
  casual: "in a casual and relaxed tone, keeping it light and conversational",
  supportive: "in a supportive and encouraging tone, showing empathy and understanding",
  humorous: "in a humorous and witty tone, adding a touch of humor without being offensive",
  thoughtful: "in a thoughtful and reflective tone, adding meaningful insights",
  analytical: "in an analytical and logical tone, focusing on facts and reasoning",
  creative: "in a creative and imaginative tone, thinking outside the box"
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

  const systemPrompt = `You are a helpful assistant that generates short, engaging Twitter replies. 
Generate a reply ${toneInstruction}. 
Keep the reply under 200 characters.
Make it natural and conversational.
Do not use hashtags unless absolutely relevant.
Do not include quotes around the reply.`;

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
