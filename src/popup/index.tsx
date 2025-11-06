import { useState, useEffect } from "react";
import { storage } from "~src/utils/storage";
import type { Settings, CustomProfile, OpenAIModel } from "~src/types";
import "~src/style.css";

export default function IndexPopup() {
  const [settings, setSettings] = useState<Settings>({
    apiKey: '',
    model: 'gpt-3.5-turbo'
  });
  const [customProfiles, setCustomProfiles] = useState<CustomProfile[]>([]);
  const [showApiKey, setShowApiKey] = useState(false);
  const [saved, setSaved] = useState(false);
  
  // New profile modal state
  const [showNewProfile, setShowNewProfile] = useState(false);
  const [newProfileName, setNewProfileName] = useState('');
  const [newProfileDescription, setNewProfileDescription] = useState('');

  useEffect(() => {
    loadSettings();
    loadCustomProfiles();
  }, []);

  async function loadSettings() {
    const loadedSettings = await storage.getSettings();
    setSettings(loadedSettings);
  }

  async function loadCustomProfiles() {
    const profiles = await storage.getCustomProfiles();
    setCustomProfiles(profiles);
  }

  async function handleSaveSettings() {
    await storage.setApiKey(settings.apiKey);
    await storage.setModel(settings.model);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function handleAddProfile() {
    if (!newProfileName.trim() || !newProfileDescription.trim()) {
      alert("Please fill in both profile name and description");
      return;
    }

    const profile: CustomProfile = {
      id: Date.now().toString(),
      name: newProfileName.trim(),
      description: newProfileDescription.trim(),
      createdAt: Date.now()
    };

    await storage.saveCustomProfile(profile);
    await loadCustomProfiles();
    
    setNewProfileName('');
    setNewProfileDescription('');
    setShowNewProfile(false);
  }

  async function handleDeleteProfile(id: string) {
    if (confirm("Are you sure you want to delete this profile?")) {
      await storage.deleteCustomProfile(id);
      await loadCustomProfiles();
    }
  }

  return (
    <div className="w-[400px] h-[600px] p-6 bg-gray-50">
      <div className="bg-white rounded-lg shadow-sm p-6 mb-4">
        <h1 className="text-2xl font-bold text-gray-900 mb-2 flex items-center gap-2">
          <span>✨</span> ReplyGuy AI
        </h1>
        <p className="text-sm text-gray-600 mb-4">
          AI-powered Twitter reply generator
        </p>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              OpenAI API Key
            </label>
            <div className="relative">
              <input
                type={showApiKey ? "text" : "password"}
                value={settings.apiKey}
                onChange={(e) => setSettings({ ...settings, apiKey: e.target.value })}
                placeholder="sk-..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <button
                onClick={() => setShowApiKey(!showApiKey)}
                className="absolute right-2 top-2 text-gray-500 hover:text-gray-700"
              >
                {showApiKey ? '🙈' : '👁️'}
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Get your API key from{' '}
              <a 
                href="https://platform.openai.com/api-keys" 
                target="_blank"
                className="text-blue-500 hover:underline"
              >
                OpenAI Platform
              </a>
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Model
            </label>
            <select
              value={settings.model}
              onChange={(e) => setSettings({ ...settings, model: e.target.value as OpenAIModel })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="gpt-3.5-turbo">GPT-3.5 Turbo (Fast & Cheap)</option>
              <option value="gpt-4-turbo">GPT-4 Turbo (Balanced)</option>
              <option value="gpt-4">GPT-4 (Best Quality)</option>
            </select>
          </div>

          <button
            onClick={handleSaveSettings}
            className="w-full bg-blue-500 hover:bg-blue-600 text-white font-medium py-2 px-4 rounded-lg transition-colors"
          >
            {saved ? '✓ Saved!' : 'Save Settings'}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">
            Custom Profiles
          </h2>
          <button
            onClick={() => setShowNewProfile(!showNewProfile)}
            className="bg-purple-500 hover:bg-purple-600 text-white text-sm font-medium py-1 px-3 rounded-lg transition-colors"
          >
            + Add
          </button>
        </div>

        {showNewProfile && (
          <div className="mb-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
            <input
              type="text"
              value={newProfileName}
              onChange={(e) => setNewProfileName(e.target.value)}
              placeholder="Profile name (e.g., Professional)"
              maxLength={30}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg mb-2 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            />
            <textarea
              value={newProfileDescription}
              onChange={(e) => setNewProfileDescription(e.target.value)}
              placeholder="Describe the tone you want (e.g., formal, professional, using industry jargon...)"
              maxLength={500}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg mb-2 focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
            />
            <div className="flex gap-2">
              <button
                onClick={handleAddProfile}
                className="flex-1 bg-purple-500 hover:bg-purple-600 text-white text-sm font-medium py-2 px-4 rounded-lg transition-colors"
              >
                Save Profile
              </button>
              <button
                onClick={() => {
                  setShowNewProfile(false);
                  setNewProfileName('');
                  setNewProfileDescription('');
                }}
                className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-700 text-sm font-medium py-2 px-4 rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        <div className="space-y-2 max-h-[200px] overflow-y-auto">
          {customProfiles.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-4">
              No custom profiles yet. Add one to get started!
            </p>
          ) : (
            customProfiles.map((profile) => (
              <div
                key={profile.id}
                className="flex items-start justify-between p-3 bg-purple-50 rounded-lg border border-purple-200"
              >
                <div className="flex-1">
                  <div className="font-medium text-gray-900">{profile.name}</div>
                  <div className="text-xs text-gray-600 mt-1 line-clamp-2">
                    {profile.description}
                  </div>
                </div>
                <button
                  onClick={() => handleDeleteProfile(profile.id)}
                  className="ml-2 text-red-500 hover:text-red-700 text-lg"
                  title="Delete profile"
                >
                  🗑️
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
