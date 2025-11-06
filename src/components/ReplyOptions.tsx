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
          <span>ReplyGuy</span>
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
          {/* First row: First 4 preset tones */}
          {PRESET_TONES.slice(0, 4).map((tone) => (
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
          
          {/* Second row: Remaining 3 preset tones + first custom profile (if exists) */}
          {PRESET_TONES.slice(4, 7).map((tone) => (
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
          
          {/* 4th slot in second row: First custom profile or empty */}
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
        
        {/* Additional custom profiles in separate rows if there are more than 1 */}
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
            {/* Fill remaining slots in the row to maintain grid alignment */}
            {Array.from({ length: (4 - (customProfiles.length - 1) % 4) % 4 }).map((_, i) => (
              <div key={`empty-${i}`} className="replyguy-option" style={{ opacity: 0, pointerEvents: 'none' }} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
