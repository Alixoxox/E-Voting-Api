
import db from '../config/db.js';
import bcrypt from 'bcrypt'
class partyM{
    async createTable(){
        try{
            const sql=`
            CREATE TABLE IF NOT EXISTS party(
            id SERIAL PRIMARY KEY,
            name VARCHAR(100) NOT NULL,
            abbreviation VARCHAR(100) NOT NULL UNIQUE,
            logo VARCHAR(255),    
            email VARCHAR(255) NOT NULL UNIQUE,
            password VARCHAR(255) NOT NULL,
            approvalstatus VARCHAR(20) CHECK (approvalstatus IN ('Pending', 'Rejected', 'Approved')) DEFAULT 'Pending',
            UNIQUE(name, abbreviation,email));`
            await db.query(sql);
            console.log('party table created or already exists.');
        }catch(err){
            console.error('Error creating party table:', err);
        }
    }
    async getAllParties(){
        try{
            const sql=`SELECT * FROM party;`;
            const result=await db.query(sql);
            return result.rows;
        }catch(err){
            console.error('Error fetching parties:', err);
            throw new Error('Error fetching parties');
        }
    }
    async addParties(parties){
      const client = await db.connect();
        try {
          await client.query('BEGIN');
          const values = [];
          const rows = [];
      
          for (const p of parties) {
            let hashed = await bcrypt.hash(p.password, 10);
      
            values.push(p.name, p.abbreviation, p.logo, p.email, hashed, "Approved");
            const count = values.length;
            rows.push(`($${count - 5}, $${count - 4}, $${count - 3}, $${count - 2}, $${count - 1}, $${count})`);
          }
      
          const sql = `
            INSERT INTO party (name, abbreviation, logo,email,password,approvalstatus)
            VALUES ${rows.join(', ')};
          `;
          await client.query(sql, values);
          await client.query('COMMIT');
        } catch (err) {
          console.error('Error inserting parties:', err);
          await client.query('ROLLBACK');
          throw err;
        }finally{
          client.release();
        }
      };

      async createParty(name, abbreviation, logo,email,password){
        try{
            let r=await db.query(`INSERT INTO party (name, abbreviation, logo,email,password) VALUES ($1, $2, $3, $4, $5) returning *;`, [name, abbreviation, logo,email,password]);
            return r.rows[0];
        }catch(err){
          if (err.code === '23505') { // unique violation
            console.error('Email or name already exists');
            throw new Error('Email or name already taken');
          }
          throw err;
      }}
      // 2. Mark as Approved (Used after OTP verification)
      async markVerified(id) {
        await db.query(`UPDATE party SET approvalstatus = 'Approved' WHERE id = $1`, [id]);
      }
      async LoginParty(email, password){
        try {
          const result = await db.query(`SELECT * FROM party WHERE email = $1`, [email]);
          if(result.rows.length === 0){
            throw new Error('Party not found');
          }
      
          const party = result.rows[0];
      
          if (party.approvalstatus === 'Pending') {
            const err = new Error('Account not verified. Please verify your email.');
            err.userId = party.id;  
            throw err;           
          }
      
          if (party.approvalstatus === 'Rejected') {
            throw new Error('Your account has been rejected by the admin.');
          }
            let isMatch = await bcrypt.compare(password, party.password);
          if(!isMatch){
            throw new Error('Invalid password');
          }
      
          return party;
      
        } catch(err) {
          console.error('Error logging in party:', err);
          throw err; // keep original error with attached userId
        }
      }
async getAllPartiesWithCandidates(page = 1, limit = 10) {
  try {
    const offset = (page - 1) * limit;

    // Query 1: Get Parties (Paginated)
    const partiesResult = await db.query(`
      SELECT id, name, abbreviation, logo, email 
      FROM party 
      ORDER BY name ASC
      LIMIT $1 OFFSET $2
    `, [limit, offset]);

    const parties = partiesResult.rows;

    if (parties.length === 0) {
      return [];
    }

    // Extract Party IDs to filter the candidate query
    const partyIds = parties.map(p => p.id);

    // Query 2: Get Candidates ONLY for the fetched parties
    const candidatesResult = await db.query(`
      SELECT c.id, c.partyId, c.imageUrl, c.manifesto,
             u.name, u.email, u.cnic
      FROM candidate c
      JOIN users u ON c.userId = u.id
      WHERE c.partyId = ANY($1)
    `, [partyIds]);

    const candidates = candidatesResult.rows;

    // JavaScript Logic: Nest candidates inside their parties
    const combinedData = parties.map(party => {
      return {
        ...party,
        candidates: candidates.filter(c => c.partyid === party.id)
      };
    });

    // Optional: Get total count for frontend pagination UI (e.g., "Page 1 of 5")
    const countResult = await db.query('SELECT COUNT(*) FROM party');
    const totalParties = parseInt(countResult.rows[0].count);

    return {
      data: combinedData,
      meta: {
        total: totalParties,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(totalParties / limit)
      }
    };

  } catch (err) {
    console.error('Error fetching paginated parties:', err);
    throw new Error('Failed to fetch parties aggregation');
  }
}

}
export default new partyM();