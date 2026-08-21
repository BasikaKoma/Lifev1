const fs = require('fs');
const path = require('path');
const { loadEnv } = require('./load-env.cjs');

loadEnv();

const url = process.env.VITE_SUPABASE_URL?.trim() || 'https://fxdnbepmiphyzebqdkyf.supabase.co';
const anonKey = process.env.VITE_SUPABASE_ANON_KEY?.trim();
const owner = process.env.GITHUB_OWNER?.trim() || 'BasikaKoma';
const repo = process.env.GITHUB_REPO?.trim() || 'Lifev1';

if (!anonKey || anonKey === 'your-anon-key-here') {
  console.error('Missing VITE_SUPABASE_ANON_KEY in .env');
  process.exit(1);
}

const outPath = path.join(__dirname, '..', 'landing', 'js', 'config.js');
const contents = `window.LIFEV1_CONFIG = ${JSON.stringify(
  {
    supabaseUrl: url,
    supabaseAnonKey: anonKey,
    githubOwner: owner,
    githubRepo: repo,
    appName: 'lifev1',
  },
  null,
  2
)};
`;

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, contents, 'utf8');
console.log(`Wrote ${outPath}`);
