import db from '../config/db.js';
import userM from './userM.js';
class candidateM{

    async createTable(){
        try{
            const sql=`
            CREATE TABLE IF NOT EXISTS candidate(
            id SERIAL PRIMARY KEY,
            userId INTEGER REFERENCES users(id),
            partyId INTEGER REFERENCES party(id),
            imageUrl VARCHAR(255) Not null,
            manifesto TEXT,
            UNIQUE(userId, partyId));
      CREATE INDEX IF NOT EXISTS idx_candidate_user ON candidate(userId);
      CREATE INDEX IF NOT EXISTS idx_candidate_party ON candidate(partyId);`
            await db.query(sql);
            console.log('candidate table created or already exists.');
        }catch(err){
            console.error('Error creating candidate table:', err);
        }
    }
    async getAllCandidates(){
        try{
            const sql=`SELECT c.*, u.name, u.email, u.cnic, p.name as partyName,p.logo as partyLogo
            FROM candidate c
            Join party p on c.partyId=p.id
            JOIN users u ON c.userId = u.id;`
            const result=await db.query(sql);
            return result.rows;
        }catch(err){
            console.error('Error fetching candidates:', err);
            throw new Error('Error fetching candidates');
        }
    }
    async createCandidate(name, email, cnic, password, province, city, area, partyId, manifesto, imageUrl) {
        try {
          // Check if user already exists
          let result = await db.query(`SELECT id FROM users WHERE email = $1`, [email]);
          
          let userId;
          
          if (result.rows.length === 0) {
            // User doesn't exist, create new user
            const newUser = await userM.createUser(name, email, cnic, password, province, city, area, 'candidate');
            userId = newUser.id; // Adjust based on what createUser returns
          } else {
            // User exists, use existing user id
            userId = result.rows[0].id;
          }
          
          // Create candidate record
          const candResult = await db.query(
            `INSERT INTO candidate (userId, partyId, manifesto, imageUrl) 
             VALUES ($1, $2, $3, $4) 
             RETURNING id`, 
            [userId, partyId, manifesto, imageUrl]
          );
          
          return { candId: candResult.rows[0].id };
          
        } catch (err) {
          console.error('Error creating candidate:', err);
          throw new Error('Error creating candidate: ' + err.message);
        }
      }
      async getCandidatesByPartyId(partyId) {
        try {
            const sql = `
                SELECT 
                    c.*, 
                    u.name, 
                    u.email, 
                    u.cnic,
                    p.name as province,   
                    ci.name as city,     
                    a.name as area,      
                    u.provinceId,
                    u.cityId,
                    u.areaId
                FROM candidate c
                JOIN users u ON c.userId = u.id
                LEFT JOIN province p ON u.provinceId = p.id
                LEFT JOIN city ci ON u.cityId = ci.id
                LEFT JOIN area a ON u.areaId = a.id
                WHERE c.partyId = $1
                ORDER BY c.id DESC;
            `;
            const result = await db.query(sql, [partyId]);
            return result.rows; // Simply return the data
        } catch (err) {
            console.error('Error fetching candidates by party ID:', err);
            throw new Error('Error fetching candidates by party ID');
        }
    }
    async kickCandidate(candidateId) {
        const client = await db.connect(); // Get a dedicated client for transaction
        try {
            await client.query('BEGIN'); // Start Transaction
            // 1. FETCH USER ID FIRST
            // We need this to delete the user account later. 
            // We must get it before deleting the candidate row.
            const userRes = await client.query(
                `SELECT userId FROM candidate WHERE id = $1`, 
                [candidateId]
            );

            if (userRes.rows.length === 0) {
                throw new Error("Candidate not found");
            }
            const userId = userRes.rows[0].userid;

            // 2. DELETE VOTES (Dependencies)
            // Delete votes cast for this candidate in their assigned constituency
            await client.query(
                `DELETE FROM votes 
                 WHERE candidateConstId IN (
                    SELECT id FROM candidateconstituency WHERE candidateId = $1
                 )`,
                [candidateId]
            );

            // 3. DELETE CONSTITUENCY ALLOCATION
            await client.query(
                `DELETE FROM candidateconstituency WHERE candidateId = $1`,
                [candidateId]
            );

            // 4. DELETE CANDIDATE PROFILE
            await client.query(
                `DELETE FROM candidate WHERE id = $1`,
                [candidateId]
            );

            // 5. DELETE USER ACCOUNT (Crucial Step)
            await client.query(
                `DELETE FROM users WHERE id = $1`,
                [userId]
            );

            await client.query('COMMIT'); // Commit changes
            return true;

        } catch (err) {
            await client.query('ROLLBACK'); // Undo everything if error
            console.error("Error in kickCandidate transaction:", err);
            throw err;
        } finally {
            client.release(); // Release client back to pool
        }
    }
        
}
export default new candidateM();