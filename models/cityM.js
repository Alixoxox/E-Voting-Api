import db from '../config/db.js';
import format from 'pg-format';

class cityM{

    async createTable(){
        try{
            const sql=`
            CREATE TABLE IF NOT EXISTS city(
            id SERIAL PRIMARY KEY,
            name VARCHAR(100) NOT NULL,
            provinceId INTEGER REFERENCES province(id),
            UNIQUE(name, provinceId));`
            await db.query(sql);
            console.log('city table created or already exists.');
        }catch(err){
            console.error('Error creating city table:', err);
        }
    }
    async getAllCities(){
        try{
            const sql=`SELECT * FROM city;`;
            const result=await db.query(sql);
            return result.rows;
        }catch(err){
            console.error('Error fetching cities:', err);
            throw new Error('Error fetching cities');
        }
    }
    async AddCitycsv(cities) {
      const client = await db.connect();
    try {
      await client.query('BEGIN');
      const { rows: provinces } = await db.query('SELECT id, name FROM province');
      
      const provinceMap = {};
      provinces.forEach(p => {
        provinceMap[p.name.trim().toLowerCase()] = p.id;
      });
      const values = cities
        .map(c => {
          // Skip rows with missing data
          if (!c.name || !c.province) {
            console.warn(`⚠️ Skipping invalid row:`, c);
            return null;
          }
          const provinceName = c.province.trim().toLowerCase();
          const provinceId = provinceMap[provinceName];
          if (!provinceId) {
            console.warn(`⚠️ Province "${c.province}" not found in DB, skipping city "${c.name}"`);
            return null;
          }
          const cityName = c.name.trim().toLowerCase();
          return [cityName, provinceId];
        })
        .filter(Boolean); // Remove nulls

      if (!values.length) {
        throw new Error('No valid cities to insert. Check province names in DB.');
      }

      const sql = format(
        `INSERT INTO city (name, provinceid) 
         VALUES %L 
         ON CONFLICT (name, provinceid) DO NOTHING`,
        values
      );

    await client.query(sql);
    await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('Error inserting cities:', err);
      throw err;
    }finally {
      client.release();
    }
  }
}
export default new cityM();