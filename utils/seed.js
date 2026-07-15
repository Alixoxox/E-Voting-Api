import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import csv from 'csv-parser';
import pool from '../config/db.js';
import bcrypt from 'bcrypt';


const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(__dirname, '..', 'demoData');
const PW = await bcrypt.hash('password123', 10);

function readCSV(file) {
  return new Promise((resolve, reject) => {
    const rows = [];
    fs.createReadStream(path.join(DATA, file))
      .pipe(csv())
      .on('data', r => rows.push(r))
      .on('end', () => resolve(rows))
      .on('error', reject);
  });
}

function readJSON(file) {
  return JSON.parse(fs.readFileSync(path.join(DATA, file), 'utf-8'));
}

async function insertProvinces(rows) {
  for (const r of rows) {
    await pool.query('INSERT INTO province (name) VALUES ($1) ON CONFLICT DO NOTHING', [r.name.trim()]);
  }
}

async function insertCities(rows) {
  const provs = await pool.query('SELECT id, LOWER(name) AS name FROM province');
  const pMap = Object.fromEntries(provs.rows.map(p => [p.name, p.id]));
  for (const r of rows) {
    const pid = pMap[r.province.trim().toLowerCase()];
    if (pid) await pool.query('INSERT INTO city (name, provinceId) VALUES ($1,$2) ON CONFLICT DO NOTHING', [r.name.trim(), pid]);
  }
}

async function insertAreas(rows) {
  const cities = await pool.query('SELECT id, LOWER(name) AS name FROM city');
  const cMap = Object.fromEntries(cities.rows.map(c => [c.name, c.id]));
  for (const r of rows) {
    const cid = cMap[r.city.trim().toLowerCase()];
    if (cid) await pool.query('INSERT INTO area (name, cityId) VALUES ($1,$2) ON CONFLICT DO NOTHING', [r.name.trim(), cid]);
  }
}

async function insertParties(rows) {
  for (const r of rows) {
    await pool.query(
      `INSERT INTO party (name, abbreviation, logo, email, password, "approvalStatus")
       VALUES ($1,$2,$3,$4,$5,'Approved') ON CONFLICT (abbreviation) DO NOTHING`,
      [r.name, r.abbreviation, r.logo, r.email, await bcrypt.hash(r.password, 10)]
    );
  }
  await pool.query('UPDATE party SET "approvalStatus" = \'Approved\'');
}

async function insertUsers(rows) {
  const provs = await pool.query('SELECT id, LOWER(name) AS name FROM province');
  const pMap = Object.fromEntries(provs.rows.map(p => [p.name, p.id]));
  const cities = await pool.query('SELECT id, LOWER(name) AS name FROM city');
  const cMap = Object.fromEntries(cities.rows.map(c => [c.name, c.id]));
  const areas = await pool.query('SELECT id, LOWER(name) AS name FROM area');
  const aMap = Object.fromEntries(areas.rows.map(a => [a.name, a.id]));

  for (const u of rows) {
    const provinceId = pMap[u.province.trim().toLowerCase()];
    const cityId = cMap[u.city.trim().toLowerCase()];
    const areaId = aMap[u.area.trim().toLowerCase()];
    if (!provinceId || !cityId || !areaId) {
      console.log(`  Skipping ${u.email}: location not found`);
      continue;
    }
    await pool.query(
      `INSERT INTO users (name,email,cnic,password,provinceId,cityId,areaId,role,is_verified)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'user',true) ON CONFLICT (email) DO NOTHING`,
      [u.name, u.email, u.cnic, PW, provinceId, cityId, areaId]
    );
  }
}

async function insertCandidates(rows) {
  const users = await pool.query('SELECT id, email FROM users');
  const uMap = Object.fromEntries(users.rows.map(u => [u.email, u.id]));
  const parties = await pool.query('SELECT id, abbreviation FROM party');
  const pMap = Object.fromEntries(parties.rows.map(p => [p.abbreviation, p.id]));

  for (const c of rows) {
    const userId = uMap[c.userEmail];
    const partyId = pMap[c.partyAbbr];
    if (!userId || !partyId) continue;
    await pool.query(
      `INSERT INTO candidate (userId, partyId, imageUrl, manifesto) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
      [userId, partyId, c.imageUrl, c.manifesto]
    );
  }
}

async function insertConstituencies(rows) {
  const provs = await pool.query('SELECT id, LOWER(name) AS name FROM province');
  const pMap = Object.fromEntries(provs.rows.map(p => [p.name, p.id]));
  const areas = await pool.query('SELECT id, LOWER(name) AS name FROM area');
  const aMap = Object.fromEntries(areas.rows.map(a => [a.name, a.id]));

  for (const r of rows) {
    const seatType = r.seatType.trim().toLowerCase() === 'national' ? 'National' : 'Provincial';
    await pool.query(
      'INSERT INTO constituency (code, name, seatType) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
      [r.code.trim(), r.name.trim(), seatType]
    );
  }

  for (const r of rows) {
    if (!r.areas) continue;
    const constRes = await pool.query('SELECT id FROM constituency WHERE code = $1', [r.code.trim()]);
    if (!constRes.rows.length) continue;
    const constId = constRes.rows[0].id;
    for (const areaName of r.areas.split(',')) {
      const clean = areaName.trim().toLowerCase();
      const areaId = aMap[clean];
      if (areaId) {
        await pool.query('INSERT INTO constituency_area (constituencyid, areaid) VALUES ($1,$2) ON CONFLICT DO NOTHING', [constId, areaId]);
      }
    }
  }
}

async function insertElections(elections) {
  for (const e of elections) {
    const today = new Date();
    const start = new Date(today);
    const end = new Date(today);
    if (e.startDateOffset) start.setDate(today.getDate() + e.startDateOffset);
    if (e.endDateOffset) end.setDate(today.getDate() + e.endDateOffset);

    let provinceId = null;
    if (e.province) {
      const p = await pool.query('SELECT id FROM province WHERE LOWER(name) = LOWER($1)', [e.province]);
      if (p.rows.length) provinceId = p.rows[0].id;
    }
    await pool.query(
      `INSERT INTO elections (name, seatType, provinceId, startDate, end_date, status, finalized)
       VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING`,
      [e.name, e.seatType, provinceId, start.toISOString().split('T')[0], end.toISOString().split('T')[0], e.status, e.finalized || false]
    );

    const election = await pool.query('SELECT id FROM elections WHERE name = $1', [e.name]);
    if (!election.rows.length) continue;
    const electionId = election.rows[0].id;

    const users = await pool.query('SELECT id, email FROM users');
    const uMap = Object.fromEntries(users.rows.map(u => [u.email, u.id]));
    const consts = await pool.query('SELECT id, code FROM constituency');
    const cMap = Object.fromEntries(consts.rows.map(c => [c.code, c.id]));
    const candidates = await pool.query('SELECT id, userId FROM candidate');
    const candByUser = Object.fromEntries(candidates.rows.map(c => [c.userid, c.id]));

    for (const a of e.allocations) {
      const userId = uMap[a.userEmail];
      const constId = cMap[a.constituencyCode];
      const candId = candByUser[userId];
      if (!candId || !constId) continue;
      const totalVotes = e.status === 'Ended' ? Math.floor(Math.random() * 100) : 0;
      const approvalStatus = e.status === 'Ended' ? (Math.random() > 0.5 ? 'Won' : 'Lost') : 'Pending';
      await pool.query(
        `INSERT INTO candidateConstituency (candidateId, electionId, constituencyId, totalVotes, approvalStatus)
         VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`,
        [candId, electionId, constId, totalVotes, approvalStatus]
      );
    }

    if (e.status === 'Ended') {
      const ccs = await pool.query('SELECT id FROM candidateConstituency WHERE electionId = $1', [electionId]);
      const voterEmails = (await pool.query('SELECT email FROM users WHERE role = \'user\'')).rows.map(r => r.email);
      for (let i = 0; i < Math.min(10, voterEmails.length); i++) {
        const voter = await pool.query('SELECT id FROM users WHERE email = $1', [voterEmails[i]]);
        if (!voter.rows.length) continue;
        const cc = ccs.rows[i % ccs.rows.length];
        const prevHash = i === 0 ? 'GENESIS_HASH_START_0000000000' : `hash_seed_${i - 1}`;
        const currHash = `hash_seed_${i}`;
        await pool.query(
          `INSERT INTO votes (userId, candidateConstId, electionId, previous_hash, current_hash)
           VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`,
          [voter.rows[0].id, cc.id, electionId, prevHash, currHash]
        );
      }
    }
  }
}

async function seed() {
  console.log('Seeding provinces...');
  await insertProvinces(await readCSV('Provinces.csv'));
  console.log('Seeding cities...');
  await insertCities(await readCSV('cities.csv'));
  console.log('Seeding areas...');
  await insertAreas(await readCSV('areas.csv'));
  console.log('Seeding parties...');
  await insertParties(await readCSV('parties.csv'));
  console.log('Seeding users...');
  await insertUsers(readJSON('users.json'));
  console.log('Seeding candidates...');
  await insertCandidates(readJSON('candidates.json'));
  console.log('Seeding constituencies...');
  await insertConstituencies(await readCSV('Constituencies.csv'));
  console.log('Seeding elections & allocations...');
  await insertElections(readJSON('elections.json'));

  const counts = await pool.query(`
    SELECT 'provinces' AS tbl, count(*) FROM province
    UNION ALL SELECT 'cities', count(*) FROM city
    UNION ALL SELECT 'areas', count(*) FROM area
    UNION ALL SELECT 'parties', count(*) FROM party
    UNION ALL SELECT 'users', count(*) FROM users
    UNION ALL SELECT 'candidates', count(*) FROM candidate
    UNION ALL SELECT 'constituencies', count(*) FROM constituency
    UNION ALL SELECT 'elections', count(*) FROM elections
    UNION ALL SELECT 'votes', count(*) FROM votes
  `);
  console.log('\n Summary:');
  for (const r of counts.rows) {
    console.log(`  ${r.tbl.padEnd(16)} ${r.count}`);
  }
}

(async () => {
  await seed();
  await pool.end();
  console.log('\nDone. Run `npm start` to launch.\n');
})();
