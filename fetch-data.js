// Onside Data — fetch-data.js
// Pulls upcoming fixtures + current standings for all tracked competitions
// from football-data.org, and writes them to data/fixtures.json
//
// Runs automatically via GitHub Actions on a schedule (see .github/workflows/update-data.yml)
// Requires FOOTBALL_API_KEY as an environment variable (set as a GitHub repo secret — never hardcoded)

const fs = require('fs');
const path = require('path');

const API_KEY = process.env.FOOTBALL_API_KEY;
const BASE_URL = 'https://api.football-data.org/v4';

// football-data.org competition codes for our tracked leagues
const COMPETITIONS = {
  PL: 'Premier League',
  PD: 'La Liga',
  BL1: 'Bundesliga',
  SA: 'Serie A',
  FL1: 'Ligue 1',
  CL: 'Champions League',
};

async function fetchFromApi(endpoint) {
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    headers: { 'X-Auth-Token': API_KEY },
  });

  if (!res.ok) {
    throw new Error(`API request failed: ${endpoint} — status ${res.status}`);
  }

  // Free tier is rate-limited (10 requests/minute) — small delay keeps us safely under that
  await new Promise((resolve) => setTimeout(resolve, 6500));

  return res.json();
}

async function fetchCompetitionData(code, name) {
  console.log(`Fetching ${name} (${code})...`);

  const result = { code, name, fixtures: [], standings: [] };

  try {
    const matchesData = await fetchFromApi(`/competitions/${code}/matches?status=SCHEDULED`);
    result.fixtures = (matchesData.matches || []).slice(0, 20).map((m) => ({
      homeTeam: m.homeTeam.name,
      awayTeam: m.awayTeam.name,
      utcDate: m.utcDate,
      matchday: m.matchday,
      status: m.status,
    }));
  } catch (err) {
    console.error(`Could not fetch fixtures for ${name}: ${err.message}`);
  }

  try {
    const standingsData = await fetchFromApi(`/competitions/${code}/standings`);
    const table = standingsData.standings?.find((s) => s.type === 'TOTAL');
    result.standings = (table?.table || []).map((row) => ({
      position: row.position,
      team: row.team.name,
      played: row.playedGames,
      won: row.won,
      draw: row.draw,
      lost: row.lost,
      points: row.points,
    }));
  } catch (err) {
    console.error(`Could not fetch standings for ${name}: ${err.message}`);
  }

  return result;
}

async function main() {
  if (!API_KEY) {
    console.error('Missing FOOTBALL_API_KEY environment variable. Aborting.');
    process.exit(1);
  }

  const output = {
    lastUpdated: new Date().toISOString(),
    competitions: {},
  };

  for (const [code, name] of Object.entries(COMPETITIONS)) {
    output.competitions[code] = await fetchCompetitionData(code, name);
  }

  const outDir = path.join(__dirname, 'data');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  fs.writeFileSync(
    path.join(outDir, 'fixtures.json'),
    JSON.stringify(output, null, 2)
  );

  console.log('Done. Data written to data/fixtures.json');
}

main();
