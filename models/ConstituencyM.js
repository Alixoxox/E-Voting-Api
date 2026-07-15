import db from '../config/db.js';
import format from 'pg-format';

class ConstituencyM{

    async createTable(){
        try{
            const sql=`
            CREATE TABLE IF NOT EXISTS Constituency(
            id SERIAL PRIMARY KEY,
            code VARCHAR(50) NOT NULL UNIQUE,
            name VARCHAR(100) NOT NULL UNIQUE,
            seatType VARCHAR(20) CHECK (seatType IN ('National','Provincial')) DEFAULT 'Provincial',
            status VARCHAR(20) CHECK (status IN ('Active', 'Inactive')) DEFAULT 'Active',
            UNIQUE(name, code, seatType));
      CREATE INDEX IF NOT EXISTS idx_constituency_seat_type ON constituency(seatType);`
            await db.query(sql);
            console.log('Constituency table created or already exists.');
        }catch(err){
            console.error('Error creating Constituency table:', err);
        }
    }
    async getAllConstituencies(){
        try{
            const sql=`SELECT DISTINCT ON (c.id)
            c.id, 
            c.name, 
            c.code, 
            c.seatType, 
            c.status,
            ci.id as "cityId",       
            ci.name as "cityName",
            ci.provinceId as "provinceId"
        FROM constituency c
        LEFT JOIN constituency_area ca ON c.id = ca.constituencyid
        LEFT JOIN area a ON ca.areaid = a.id
        LEFT JOIN city ci ON a.cityid = ci.id
        ORDER BY c.id ASC;`
            const result=await db.query(sql);
            console.log('Fetched Constituencies:', result.rows);
            return result.rows;
        }catch(err){
            console.error('Error fetching Constituencies:', err);
            throw new Error('Error fetching Constituencies');
        }
    }
    async insertConstituenciesFastest(data) {
        const client = await db.connect();
        try {
            await client.query('BEGIN');
    
            // 1️⃣ Prepare Constituency Data
            const constituencyValues = data.map(item => [
                item.code,
                item.name,
                item.seatType.trim().toLowerCase() === 'national' ? 'National' : 'Provincial',
                'Active'
            ]);
    
            // 2️⃣ Bulk Insert Constituencies
            await client.query(format(`
                INSERT INTO constituency (code, name, seatType, status)
                VALUES %L
                ON CONFLICT (code) DO NOTHING; -- Changed to (code) to be safe
            `, constituencyValues));
    
            // 3️⃣ Re-fetch IDs to handle existing + new ones
            const resCon = await client.query(`SELECT id, code FROM constituency`);
            const codeToId = {}; 
            resCon.rows.forEach(r => { codeToId[r.code] = r.id; });
    
            // 4️⃣ Fetch Areas & Normalize to Lowercase (CRITICAL FIX)
            const resArea = await client.query(`SELECT id, name FROM area`);
            const areaNameToId = {};
            resArea.rows.forEach(r => {
                areaNameToId[r.name.trim().toLowerCase()] = r.id;
            });
    
            // 5️⃣ Build Junctions
            const junctionValues = [];
            
            data.forEach(item => {
                const constituencyId = codeToId[item.code];
                
                if (constituencyId && item.areas) {
                    // Split by comma
                    const areaList = item.areas.split(',');
    
                    areaList.forEach(areaRaw => {
                        // Normalize CSV input to lowercase to match map
                        const areaClean = areaRaw.trim().toLowerCase();
                        const areaId = areaNameToId[areaClean];
    
                        if (areaId) {
                            junctionValues.push([constituencyId, areaId]);
                        } else {
                            console.log(`Skipped Area: "${areaRaw}" not found in DB.`);
                        }
                    });
                }
            });
    
            // 6️⃣ Bulk Insert Junctions
            if (junctionValues.length > 0) {
                await client.query(format(`
                    INSERT INTO constituency_area (constituencyid, areaid)
                    VALUES %L
                    ON CONFLICT (constituencyid, areaid) DO NOTHING;
                `, junctionValues));
            }
    
            await client.query('COMMIT');
            console.log('✅ Constituencies and area links inserted successfully');
    
        } catch (err) {
            await client.query('ROLLBACK');
            console.error('Error inserting constituencies:', err);
            throw err;
        } finally {
            client.release();
        }
}
async getAreaByConstituency(constituencyid){
    try{
        const sql=`
        SELECT con.*,a.name
      FROM constituency con
      JOIN constituency_area ca ON con.id = ca.constituencyid
      JOIN area a ON ca.areaid = a.id
      WHERE con.id = $1;`
        const result=await db.query(sql, [constituencyid]);
        return result.rows;
    }catch(err){
        console.error('Error fetching constituency by area ID:', err);
        throw new Error('Error fetching constituency by area ID');
    }
}
getAtiveProvisionalConstituencies = async () => {
    try {
      const sql = `SELECT * FROM Constituency WHERE seatType = 'Provincial' AND status = 'Active';`;
      const result = await db.query(sql);
      return result.rows;
    } catch (err) {
      console.error('Error fetching active provincial constituencies:', err);
      throw new Error('Error fetching active provincial constituencies');
    }
  }

  getActiveNationalConstituencies = async () => {
    try {
      const sql = `SELECT * FROM Constituency WHERE seatType = 'National' AND status = 'Active';`;
      const result = await db.query(sql);
      return result.rows;
    } catch (err) {
      console.error('Error fetching active national constituencies:', err);
      throw new Error('Error fetching active national constituencies');
    }
  }
  
}
export default new ConstituencyM();