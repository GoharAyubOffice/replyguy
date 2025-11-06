export type OpenAIModel = 'gpt-4' | 'gpt-4-turbo' | 'gpt-3.5-turbo';

export type PresetTone = 
  | 'friendly' 
  | 'casual' 
  | 'supportive' 
  | 'humorous' 
  | 'thoughtful' 
  | 'analytical' 
  | 'creative';

export interface CustomProfile {
  id: string;
  name: string;
  description: string;
  createdAt: number;
}

export interface Settings {
  apiKey: string;
  model: OpenAIModel;
}

export interface TweetContext {
  text: string;
  author: string;
  threadContext?: string[];
}

export interface GenerateReplyParams {
  tweetContext: TweetContext;
  tone: PresetTone | string;
  customDescription?: string;
  model: OpenAIModel;
  apiKey: string;
}
