// Onside Data — fetch-scorers.js
// Pulls current-season top scorers (goals, assists, appearances) across all tracked
// leagues from football-data.org — the same free API already powering fixtures/standings.
// Real, current data only — no stale placeholder seasons.
//
// Requires FOOTBALL_API_KEY as an environment variable (same GitHub secret already set up)

const fs = require('fs');
const path = require('path');

const API_KEY = process.env.FOOTBALL_API_KEY;
const BASE_URL = 'https://api.football-data.org/v4';

const COMPETITIONS = {
  PL: 'Premier League',
  PD: 'La Liga',
  BL1: 'Bundesliga',
  SA: 'Serie A',
  FL1: 'Ligue 1',
  CL: 'Champions League',
};

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

async function fetchFromApi(endpoint) {
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    headers: { 'X-Auth-Token': API_KEY },
  });
  if (!res.ok) throw new Error(`API request failed: ${endpoint} — status ${res.status}`);
  await new Promise((resolve) => setTimeout(resolve, 6500)); // stay safely under free-tier rate limit
  return res.json();
}

async function fetchCompetitionScorers(code, name) {
  console.log(`Fetching top scorers for ${name} (${code})...`);
  try {
    const data = await fetchFromApi(`/competitions/${code}/scorers?limit=20`);
    const scorers = (data.scorers || []).map((entry) => ({
      slug: slugify(entry.player.name),
      name: entry.player.name,
      team: entry.team.name,
      league: name,
      leagueCode: code,
      nationality: entry.player.nationality || null,
      goals: entry.goals || 0,
      assists: entry.assists || 0,
      penalties: entry.penalties || 0,
      playedMatches: entry.playedMatches || 0,
    }));
    console.log(`  → ${scorers.length} players`);
    return scorers;
  } catch (err) {
    console.error(`  Could not fetch ${name}: ${err.message}`);
    return [];
  }
}

async function main() {
  if (!API_KEY) {
    console.error('Missing FOOTBALL_API_KEY environment variable. Aborting.');
    process.exit(1);
  }

  const allScorers = [];
  for (const [code, name] of Object.entries(COMPETITIONS)) {
    const scorers = await fetchCompetitionScorers(code, name);
    allScorers.push(...scorers);
  }

  const output = {
    lastUpdated: new Date().toISOString(),
    players: allScorers,
  };

  const outDir = path.join(__dirname, 'data');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'scorers.json'), JSON.stringify(output, null, 2));

  console.log(`Done. ${allScorers.length} total players written to data/scorers.json`);
}

main();
