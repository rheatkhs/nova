import { ApplicationCommandType, type ApplicationCommandDataResolvable } from 'discord.js';

export const BOT_COMMANDS: readonly ApplicationCommandDataResolvable[] = [
  { name: 'help', description: 'Show bot commands, capabilities, and active tools' },
  { name: 'stats', description: 'View live bot operational metrics, model, and memory stats' },
  {
    name: 'ask-thread',
    description: 'Ask Nova a question and create a dedicated discussion thread for the answer',
    options: [
      {
        name: 'question',
        description: 'Your question or topic to discuss in a new thread',
        type: 3, // ApplicationCommandOptionType.String
        required: true,
      },
    ],
  },
  {
    name: 'reset',
    description: 'Clear conversation memory for this channel',
    options: [
      {
        name: 'recap',
        description: 'Generate a summary of the conversation before clearing memory',
        type: 5, // ApplicationCommandOptionType.Boolean
        required: false,
      },
    ],
  },
  {
    name: 'export',
    description: 'Export and download conversation history for this channel',
    options: [
      {
        name: 'format',
        description: 'File format (default: markdown)',
        type: 3, // ApplicationCommandOptionType.String
        required: false,
        choices: [
          { name: 'Markdown (.md)', value: 'markdown' },
          { name: 'JSON (.json)', value: 'json' },
        ],
      },
    ],
  },
  {
    name: 'prompt',
    description: 'View, set, or clear custom AI system prompt for this channel',
    options: [
      {
        name: 'text',
        description: 'New system prompt (leave empty to view, type "reset" to clear)',
        type: 3, // ApplicationCommandOptionType.String
        required: false,
      },
    ],
  },
  {
    name: 'model',
    description: 'View, set, or clear custom AI model for this channel',
    options: [
      {
        name: 'name',
        description: 'Model identifier (leave empty for dropdown menu, type "reset" to clear)',
        type: 3, // ApplicationCommandOptionType.String
        required: false,
        autocomplete: true,
      },
    ],
  },
  {
    name: 'temperature',
    description: 'View, set, or clear AI temperature (0.0 to 2.0) for this channel',
    options: [
      {
        name: 'value',
        description: 'Creativity value (0.0 = deterministic/coding, 1.0 = creative, "reset" to clear)',
        type: 3, // ApplicationCommandOptionType.String
        required: false,
      },
    ],
  },
  {
    name: 'language',
    description: 'View, set, or clear preferred response language for this channel',
    options: [
      {
        name: 'name',
        description: 'Language name (e.g. Vietnamese, English, Japanese, or "reset" to clear)',
        type: 3, // ApplicationCommandOptionType.String
        required: false,
        autocomplete: true,
      },
    ],
  },
  {
    name: 'bahasa',
    description: 'Switch bot UI language between English and Indonesian (Bahasa Indonesia)',
    options: [
      {
        name: 'lang',
        description: 'Target language (en for English, id for Indonesia)',
        type: 3, // ApplicationCommandOptionType.String
        required: false,
        choices: [
          { name: 'English (en)', value: 'en' },
          { name: 'Bahasa Indonesia (id)', value: 'id' },
        ],
      },
    ],
  },
  {
    name: 'voice',
    description: 'View, set, or clear preferred TTS voice locale for this channel',
    options: [
      {
        name: 'locale',
        description: 'Voice locale code (e.g. en-US, en-GB, vi, ja, fr, or "reset" to clear)',
        type: 3, // ApplicationCommandOptionType.String
        required: false,
        autocomplete: true,
      },
    ],
  },
  {
    name: 'remind',
    description: 'Schedule a timed reminder ping in this channel',
    options: [
      {
        name: 'duration',
        description: 'Time duration, e.g. "30s", "10m", or "2h"',
        type: 3, // ApplicationCommandOptionType.String
        required: true,
      },
      {
        name: 'message',
        description: 'What do you want to be reminded about?',
        type: 3, // ApplicationCommandOptionType.String
        required: true,
      },
    ],
  },
  {
    name: '247',
    description: 'Enable or disable 24/7 persistent voice mode for this server (admins)',
    options: [
      {
        name: 'mode',
        description: 'Toggle 24/7 mode on or off',
        type: 3, // ApplicationCommandOptionType.String
        required: true,
        choices: [
          { name: 'On (Enable 24/7)', value: 'on' },
          { name: 'Off (Disable 24/7)', value: 'off' },
        ],
      },
    ],
  },
  {
    name: 'memory',
    description: 'Inspect or surgically prune SQLite conversation memory for this channel (admins)',
    options: [
      {
        name: 'action',
        description: 'Memory action to perform',
        type: 3, // ApplicationCommandOptionType.String
        required: true,
        choices: [
          { name: 'View messages', value: 'view' },
          { name: 'Inspect database stats', value: 'inspect' },
        ],
      },
    ],
  },
  {
    name: 'Explain with Nova',
    type: ApplicationCommandType.Message,
  },
  {
    name: 'Summarize with Nova',
    type: ApplicationCommandType.Message,
  },
];
