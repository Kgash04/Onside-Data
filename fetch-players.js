// Onside Data — fetch-players.js
// Pulls detailed player stats for every marquee club's squad from API-Football,
// computes per-90 metrics, and writes to data/players.json
//
// Requires API_FOOTBALL_KEY as an environment variable (GitHub repo secret)
// Runs less frequently than fixtures (player stats change slower, and this API
// has a tighter free-tier quota — 100 requests/day)

const fs = require('fs');
const path = require('path');

const API_KEY = process.env.API_FOOTBALL_KEY;
const BASE_URL = 'https://v3.football.api-sports.io';
const SEASON = 2026; // adjust each year to match the current season's start year

// Marquee clubs — API-Football team IDs.
// IMPORTANT: verify these against the /teams?search=name endpoint before relying on them —
// if a team returns no players, its ID is likely wrong and needs correcting.
const MARQUEE_TEAMS = {
  42: { name: 'Arsenal', league: 'Premier League' },
  50: { name: 'Manchester City', league: 'Premier League' },
  33: { name: 'Manchester United', league: 'Premier League' },
  40: { name: 'Liverpool', league: 'Premier League' },
  49: { name: 'Chelsea', league: 'Premier League' },
  47: { name: 'Tottenham Hotspur', league: 'Premier League' },
  541: { name: 'Real Madrid', league: 'La Liga' },
  529: { name: 'Barcelona', league: 'La Liga' },
  530: { name: 'Atletico Madrid', league: 'La Liga' },
  157: { name: 'Bayern Munich', league: 'Bundesliga' },
  85: { name: 'Paris Saint Germain', league: 'Ligue 1' },
  505: { name: 'Inter', league: 'Serie A' },
  489: { name: 'AC Milan', league: 'Serie A' },
  496: { name: 'Juventus', league: 'Serie A' },
};

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

// Assigns a stat template based on API-Football's reported position
function positionTemplate(position) {
  if (!position) return 'midfielder';
  const p = position.toLowerCase();
  if (p.includes('goalkeeper')) return 'goalkeeper';
  if (p.includes('defender')) return 'defender';
  if (p.includes('attacker')) return 'attacker';
  return 'midfielder';
}

async function fetchFromApi(endpoint) {
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    headers: { 'x-apisports-key': API_KEY },
  });
  if (!res.ok) throw new Error(`API request failed: ${endpoint} — status ${res.status}`);
  await new Promise((resolve) => setTimeout(resolve, 7000)); // stay safely under free-tier rate limit
  return res.json();
}

async function fetchTeamPlayers(teamId, teamMeta) {
  console.log(`Fetching squad for ${teamMeta.name}...`);
  const players = [];
  let page = 1;
  let totalPages = 1;

  do {
    const data = await fetchFromApi(`/players?team=${teamId}&season=${SEASON}&page=${page}`);
    totalPages = data.paging?.total || 1;

    (data.response || []).forEach((entry) => {
      const stats = entry.statistics?.[0];
      if (!stats) return;

      const minutes = stats.games?.minutes || 0;
      const shots = stats.shots?.total || 0;
      const shotsOn = stats.shots?.on || 0;
      const per90 = (val) => (minutes > 0 ? Number(((val / minutes) * 90).toFixed(2)) : 0);

      players.push({
        id: entry.player.id,
        slug: slugify(entry.player.name),
        name: entry.player.name,
        team: teamMeta.name,
        league: teamMeta.league,
        position: stats.games?.position || 'Unknown',
        template: positionTemplate(stats.games?.position),
        age: entry.player.age,
        appearances: stats.games?.appearences || 0,
        minutes,
        goals: stats.goals?.total || 0,
        assists: stats.goals?.assists || 0,
        shots,
        shotsOnTarget: shotsOn,
        shotsPer90: per90(shots),
        shotsOnTargetPer90: per90(shotsOn),
        tackles: stats.tackles?.total || 0,
        interceptions: stats.tackles?.interceptions || 0,
        tacklesPer90: per90(stats.tackles?.total || 0),
        interceptionsPer90: per90(stats.tackles?.interceptions || 0),
        passAccuracy: stats.passes?.accuracy || null,
        keyPasses: stats.passes?.key || 0,
        keyPassesPer90: per90(stats.passes?.key || 0),
        saves: stats.goals?.saves || 0,
        goalsConceded: stats.goals?.conceded || 0,
      });
    });

    page += 1;
  } while (page <= totalPages);

  return players;
}

async function main() {
  if (!API_KEY) {
    console.error('Missing API_FOOTBALL_KEY environment variable. Aborting.');
    process.exit(1);
  }

  const allPlayers = [];

  for (const [teamId, teamMeta] of Object.entries(MARQUEE_TEAMS)) {
    try {
      const players = await fetchTeamPlayers(teamId, teamMeta);
      allPlayers.push(...players);
      console.log(`  → ${players.length} players`);
    } catch (err) {
      console.error(`Could not fetch ${teamMeta.name}: ${err.message}`);
    }
  }

  const output = {
    lastUpdated: new Date().toISOString(),
    players: allPlayers,
  };

  const outDir = path.join(__dirname, 'data');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'players.json'), JSON.stringify(output, null, 2));

  console.log(`Done. ${allPlayers.length} total players written to data/players.json`);
}

main();
