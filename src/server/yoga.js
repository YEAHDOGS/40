import { createYoga } from 'graphql-yoga';
import { makeExecutableSchema } from '@graphql-tools/schema';
import { addMocksToSchema, MockList } from '@graphql-tools/mock';
import { loadFilesSync } from '@graphql-tools/load-files';
import { mergeTypeDefs } from '@graphql-tools/merge';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load all schema files
const typesArray = loadFilesSync(path.join(__dirname, '../graphql'), {
  extensions: ['graphql']
});

const typeDefs = mergeTypeDefs(typesArray);

// Create base schema
const schema = makeExecutableSchema({ typeDefs });

const mockContents = [
  "They're tracking the metadata, not the message. Remember to rotate your encryption keys before the wipe. #opsec",
  "Just found out about 40Forty. Finally a place where I can speak freely without some corporate algorithm shadowbanning me. 🏴‍☠️",
  "The new Matrix theme is insane. It genuinely feels like I'm jacking into the mainframe.",
  "Does anyone else feel like the internet died in 2018? Everything now is just bots talking to bots to sell ads to humans.",
  "Just a reminder: everything on this server gets zeroed out in 14 days. Don't post anything you need to keep.",
  "Who else is using a burner device to access this node? Better safe than sorry.",
  "Spotted a corporate crawler trying to index the public feeds. IP banned them immediately. Nice try, fed.",
  "I miss the days when you could just browse a forum without needing 2FA and a blood sample.",
  "The temporary nature of this network is actually so liberating. No digital footprint, no past mistakes haunting you.",
  "Anyone got any good recommendations for open-source hardware wallets? Asking for a friend.",
  "If you're reading this, you are the resistance. Let's keep the decentralized dream alive.",
  "Just successfully compiled my custom kernel. It's the little victories.",
  "L33tcode is just modern day alchemy. Change my mind.",
  "Why does every social media app eventually turn into a shopping mall? Let's keep this place clean.",
  "Waking up and realizing your data isn't being harvested feels incredibly good.",
  "The aesthetic of this app makes me want to put on a leather trench coat and hack a mega-corporation.",
  "System wipe approaching in T-minus 15 days. Prepare to zero out your local caches.",
  "I'm building a custom scraper just to save these posts before they disappear forever.",
  "Wait, if everything deletes itself, what's the point of farming likes? Exactly. Just post.",
  "I found a vulnerability in the latest chromium engine. Dropping the zero-day payload in the premium random chat tonight."
];

const mockNames = [
  "ZeroCool", "AcidBurn", "CrashOverride", "Phantom", "GhostInTheShell",
  "Cipher", "Neo", "Trinity", "Morpheus", "Switch", "Apoc", "Mouse",
  "Anon_7734", "Glitch", "Byte", "N0m4d", "R00t", "SysAdmin", "NeuralNet",
  "CyberPunk", "NetRunner", "DataGhost", "VoidWalker"
];

// Add mocks
const mockedSchema = addMocksToSchema({
  schema,
  mocks: {
    DateTime: () => new Date().toISOString(),
    Upload: () => 'UploadMock',
    JSON: () => ({ mocked: true }),
    // Custom mocks for the 40Forty app
    User: () => {
      const name = mockNames[Math.floor(Math.random() * mockNames.length)];
      return {
        id: () => 'user-' + Math.random().toString(36).substr(2, 9),
        username: () => name.toLowerCase() + '_' + Math.floor(Math.random() * 10000),
        displayName: () => name,
        profileImage: () => 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + Math.random(),
        isVerified: () => Math.random() > 0.8,
      };
    },
    Post: () => ({
      id: () => 'post-' + Math.random().toString(36).substr(2, 9),
      content: () => mockContents[Math.floor(Math.random() * mockContents.length)],
      createdAt: () => new Date(Date.now() - Math.random() * 1000000000).toISOString(),
      likesCount: () => Math.floor(Math.random() * 5000),
      repliesCount: () => Math.floor(Math.random() * 500),
      isLiked: () => Math.random() > 0.8,
    }),
    PostConnection: () => ({
      edges: () => new MockList(50)
    })
  },
  preserveResolvers: false
});

// Create Yoga instance
const yoga = createYoga({
  schema: mockedSchema,
  graphqlEndpoint: '/graphql',
});

// Create Vite plugin
export default function graphqlYogaPlugin() {
  return {
    name: 'vite-plugin-graphql-yoga',
    configureServer(server) {
      server.middlewares.use(yoga.graphqlEndpoint, yoga);
    }
  };
}
