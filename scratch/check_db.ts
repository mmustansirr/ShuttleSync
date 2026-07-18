import { readDB } from '../lib/db';

async function main() {
  process.env.UPSTASH_REDIS_REST_URL = "https://evolved-dogfish-165483.upstash.io";
  process.env.UPSTASH_REDIS_REST_TOKEN = "gQAAAAAAAoZrAAIgcDI3NGJkNTViYmVlZTc0NTg5OTBiMWFlMDM2NmE3ZTU2Mw";
  
  try {
    const db = await readDB();
    console.log("=== TOURNEY COUNT ===", db.tournaments.length);
    console.log("=== TOURNEY LIST ===");
    db.tournaments.forEach(t => {
      console.log(`ID: ${t.id}, Name: ${t.name}, Status: ${t.status}`);
    });
  } catch (error) {
    console.error("Error checking DB:", error);
  }
}

main();
