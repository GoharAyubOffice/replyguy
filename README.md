# ReplyGuy - AI Twitter Replies Extension

AI-powered browser extension that helps you generate engaging Twitter/X replies using OpenAI.

## Features

✨ **Preset Tones**: Choose from 7 built-in reply styles
- 😊 Friendly
- 👋 Casual
- 💪 Supportive
- 😄 Humorous
- 🤔 Thoughtful
- 📊 Analytical
- ✨ Creative

🎯 **Custom Profiles**: Create your own tone profiles with custom descriptions

🧵 **Thread Context**: Automatically analyzes thread context for better replies

⚡ **Multiple Models**: Support for GPT-3.5 Turbo, GPT-4 Turbo, and GPT-4

## Installation

### 1. Get Your OpenAI API Key
1. Go to [OpenAI Platform](https://platform.openai.com/api-keys)
2. Create an API key and copy it

### 2. Load the Extension

#### Chrome / Brave / Edge:
1. Open browser and go to `chrome://extensions/`
2. Enable "Developer mode" (top right)
3. Click "Load unpacked"
4. Select the `build/chrome-mv3-prod` folder from this project
5. The extension should now appear in your extensions list

### 3. Configure the Extension
1. Click the ReplyGuy extension icon in your browser toolbar
2. Paste your OpenAI API key
3. Select your preferred GPT model
4. (Optional) Create custom tone profiles

## Usage

1. Go to [Twitter/X](https://x.com) or [twitter.com](https://twitter.com)
2. Click on any tweet to reply
3. Click in the reply box
4. The ReplyGuy UI will appear below the reply textarea
5. Click on any tone option to generate a reply
6. The generated reply will be inserted into the reply box
7. Review and post!

## Custom Profiles

Create personalized tone profiles:

1. Click the extension icon
2. Click "+ Add" in the Custom Profiles section
3. Enter a profile name (e.g., "Professional")
4. Describe the tone you want (e.g., "formal, uses industry jargon, professional")
5. Click "Save Profile"
6. Your custom profile will now appear in the reply options

## Development

### Build from Source

```bash
# Install dependencies
npm install

# Development mode (with hot reload)
npm run dev

# Production build
npm run build

# Package for distribution
npm run package
```

### Project Structure

```
replyguy/
├── src/
│   ├── contents/          # Content scripts
│   ├── components/        # React components
│   ├── background/        # Background service worker
│   ├── popup/            # Extension popup/settings
│   ├── utils/            # Utilities (OpenAI, storage, Twitter)
│   └── types/            # TypeScript types
├── assets/               # Icons
└── build/                # Built extension
```

## Privacy & Security

- Your OpenAI API key is stored locally in your browser
- No data is sent to any server except OpenAI's API
- All processing happens on your device
- Open source - review the code yourself

## Tech Stack

- **Framework**: Plasmo
- **UI**: React + TypeScript
- **Styling**: TailwindCSS
- **API**: OpenAI
- **Manifest**: V3 (Chrome, Brave, Edge, Firefox compatible)

## Cost

This extension is **completely free**. You only pay for your OpenAI API usage based on OpenAI's pricing:
- GPT-3.5 Turbo: ~$0.001 per reply
- GPT-4 Turbo: ~$0.01 per reply
- GPT-4: ~$0.03 per reply

## Troubleshooting

### Extension not showing on Twitter
- Make sure you're on twitter.com or x.com
- Try refreshing the page
- Check if the extension is enabled in chrome://extensions/

### "API key required" error
- Click the extension icon and add your OpenAI API key
- Make sure the API key is valid and has credits

### Replies not generating
- Check your internet connection
- Verify your OpenAI API key has available credits
- Check browser console for errors (F12)

## Support

For issues or questions, please open an issue on GitHub.

## License

MIT License - Feel free to use and modify!
