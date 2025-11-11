import { useState, useEffect } from "react";
import type { PostCategory, CustomProfile } from "~src/types";
import { storage } from "~src/utils/storage";
import { generatePost } from "~src/utils/openai";
import { insertTextIntoCompose } from "~src/utils/twitter";
import iconUrl from "data-base64:../../assets/icon.png";

const POST_CATEGORIES: { value: PostCategory; label: string; emoji: string }[] = [
  { value: 'insight', label: 'Insight', emoji: '💡' },
  { value: 'question', label: 'Question', emoji: '❓' },
  { value: 'announcement', label: 'News', emoji: '📢' },
  { value: 'tip', label: 'Tip', emoji: '✨' },
  { value: 'story', label: 'Story', emoji: '📖' },
  { value: 'opinion', label: 'Opinion', emoji: '💭' },
  { value: 'fun', label: 'Fun', emoji: '🎉' }
];

interface PostOptionsProps {
  onClose: () => void;
}

export default function PostOptions({ onClose }: PostOptionsProps) {
  const [customProfiles, setCustomProfiles] = useState<CustomProfile[]>([]);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [customInstruction, setCustomInstruction] = useState('');
  const [showCustomInput, setShowCustomInput] = useState(false);

  useEffect(() => {
    loadCustomProfiles();
  }, []);

  async function loadCustomProfiles() {
    const profiles = await storage.getCustomProfiles();
    setCustomProfiles(profiles);
  }

  async function handleCategoryClick(category: PostCategory) {
    await handleGenerate(category);
  }

  async function handleCustomProfileClick(profile: CustomProfile) {
    await handleGenerate(profile.name, profile.description);
  }

  async function handleCustomInstructionGenerate() {
    if (!customInstruction.trim()) {
      setError("Please enter custom instructions");
      return;
    }
    await handleGenerate('custom', customInstruction);
  }

  async function handleGenerate(category: string, customDescription?: string) {
    setLoading(category);
    setError(null);

    try {
      const settings = await storage.getSettings();
      
      if (!settings.apiKey) {
        setError("Please add your OpenAI API key in the extension settings");
        setLoading(null);
        return;
      }

      const post = await generatePost({
        category: category as PostCategory,
        customDescription,
        model: settings.model,
        apiKey: settings.apiKey
      });

      insertTextIntoCompose(post);
      
      setLoading(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate post");
      setLoading(null);
    }
  }

  return (
    <div className="replyguy-container">
      <div className="replyguy-header">
        <div className="replyguy-title">
          <img src={iconUrl} alt="PostGuy" className="replyguy-icon" style={{width: '20px', height: '20px'}} />
          <span>PostGuy - Generate Post</span>
        </div>
        <button 
          onClick={onClose}
          className="replyguy-close"
          aria-label="Close"
        >
          ✕
        </button>
      </div>

      {error && (
        <div className="replyguy-error">
          {error}
        </div>
      )}

      <div className="replyguy-section">
        <div className="replyguy-options">
          {POST_CATEGORIES.slice(0, 4).map((cat) => (
            <button
              key={cat.value}
              onClick={() => handleCategoryClick(cat.value)}
              disabled={loading !== null}
              className="replyguy-option"
            >
              {loading === cat.value ? (
                <span className="replyguy-spinner">⏳</span>
              ) : (
                <span className="replyguy-emoji">{cat.emoji}</span>
              )}
              <span>{cat.label}</span>
            </button>
          ))}
          
          {POST_CATEGORIES.slice(4, 7).map((cat) => (
            <button
              key={cat.value}
              onClick={() => handleCategoryClick(cat.value)}
              disabled={loading !== null}
              className="replyguy-option"
            >
              {loading === cat.value ? (
                <span className="replyguy-spinner">⏳</span>
              ) : (
                <span className="replyguy-emoji">{cat.emoji}</span>
              )}
              <span>{cat.label}</span>
            </button>
          ))}
          
          {customProfiles.length > 0 ? (
            <button
              key={customProfiles[0].id}
              onClick={() => handleCustomProfileClick(customProfiles[0])}
              disabled={loading !== null}
              className="replyguy-option replyguy-custom"
            >
              {loading === customProfiles[0].name ? (
                <span className="replyguy-spinner">⏳</span>
              ) : (
                <span className="replyguy-emoji">👤</span>
              )}
              <span>{customProfiles[0].name}</span>
            </button>
          ) : (
            <div className="replyguy-option" style={{ opacity: 0, pointerEvents: 'none' }} />
          )}
        </div>
        
        {customProfiles.length > 1 && (
          <div className="replyguy-options replyguy-custom-row">
            {customProfiles.slice(1).map((profile) => (
              <button
                key={profile.id}
                onClick={() => handleCustomProfileClick(profile)}
                disabled={loading !== null}
                className="replyguy-option replyguy-custom"
              >
                {loading === profile.name ? (
                  <span className="replyguy-spinner">⏳</span>
                ) : (
                  <span className="replyguy-emoji">👤</span>
                )}
                <span>{profile.name}</span>
              </button>
            ))}
            {Array.from({ length: (4 - (customProfiles.length - 1) % 4) % 4 }).map((_, i) => (
              <div key={`empty-${i}`} className="replyguy-option" style={{ opacity: 0, pointerEvents: 'none' }} />
            ))}
          </div>
        )}

        <div className="replyguy-custom-section">
          <button
            onClick={() => setShowCustomInput(!showCustomInput)}
            className="replyguy-toggle-custom"
          >
            {showCustomInput ? '▼' : '▶'} Custom Instructions
          </button>
          
          {showCustomInput && (
            <div className="replyguy-custom-input-container">
              <textarea
                value={customInstruction}
                onChange={(e) => setCustomInstruction(e.target.value)}
                placeholder="Example: 'Write a post about AI trends, keep it under 100 chars, use casual tone'"
                className="replyguy-custom-textarea"
                rows={4}
              />
              <button
                onClick={handleCustomInstructionGenerate}
                disabled={loading !== null || !customInstruction.trim()}
                className="replyguy-generate-custom"
              >
                {loading === 'custom' ? '⏳ Generating...' : '✨ Generate'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
