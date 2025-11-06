import { useState, useEffect } from "react";
import type { PresetTone, CustomProfile, TweetContext } from "~src/types";
import { storage } from "~src/utils/storage";
import { generateReply } from "~src/utils/openai";
import { insertTextIntoReply } from "~src/utils/twitter";

const PRESET_TONES: { value: PresetTone; label: string; emoji: string }[] = [
  { value: 'friendly', label: 'Friendly', emoji: '😊' },
  { value: 'casual', label: 'Casual', emoji: '👋' },
  { value: 'supportive', label: 'Supportive', emoji: '💪' },
  { value: 'humorous', label: 'Humorous', emoji: '😄' },
  { value: 'thoughtful', label: 'Thoughtful', emoji: '🤔' },
  { value: 'analytical', label: 'Analytical', emoji: '📊' },
  { value: 'creative', label: 'Creative', emoji: '✨' }
];

interface ReplyOptionsProps {
  tweetContext: TweetContext;
  onClose: () => void;
}

export default function ReplyOptions({ tweetContext, onClose }: ReplyOptionsProps) {
  const [customProfiles, setCustomProfiles] = useState<CustomProfile[]>([]);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadCustomProfiles();
  }, []);

  async function loadCustomProfiles() {
    const profiles = await storage.getCustomProfiles();
    setCustomProfiles(profiles);
  }

  async function handleToneClick(tone: PresetTone) {
    await handleGenerate(tone);
  }

  async function handleCustomProfileClick(profile: CustomProfile) {
    await handleGenerate(profile.name, profile.description);
  }

  async function handleGenerate(tone: string, customDescription?: string) {
    setLoading(tone);
    setError(null);

    try {
      const settings = await storage.getSettings();
      
      if (!settings.apiKey) {
        setError("Please add your OpenAI API key in the extension settings");
        setLoading(null);
        return;
      }

      const reply = await generateReply({
        tweetContext,
        tone: tone as PresetTone,
        customDescription,
        model: settings.model,
        apiKey: settings.apiKey
      });

      insertTextIntoReply(reply);
      
      // Don't close, keep UI visible
      setLoading(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate reply");
      setLoading(null);
    }
  }

  return (
    <div className="replyguy-container">
      <div className="replyguy-header">
        <div className="replyguy-title">
          <span className="replyguy-icon">✨</span>
          <span>ReplyGuy AI</span>
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

      {customProfiles.length > 0 && (
        <div className="replyguy-section">
          <div className="replyguy-section-title">Custom Profiles</div>
          <div className="replyguy-options">
            {customProfiles.map((profile) => (
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
          </div>
        </div>
      )}

      <div className="replyguy-section">
        <div className="replyguy-section-title">Preset Tones</div>
        <div className="replyguy-options">
          {PRESET_TONES.map((tone) => (
            <button
              key={tone.value}
              onClick={() => handleToneClick(tone.value)}
              disabled={loading !== null}
              className="replyguy-option"
            >
              {loading === tone.value ? (
                <span className="replyguy-spinner">⏳</span>
              ) : (
                <span className="replyguy-emoji">{tone.emoji}</span>
              )}
              <span>{tone.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
