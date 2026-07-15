import db from "../config/db.js";
import format from 'pg-format';
class areaM {
  async createTable() {
    try {
      const sql = `
            CREATE TABLE IF NOT EXISTS area(
            id SERIAL PRIMARY KEY,
            name VARCHAR(100) NOT NULL,
            cityId INTEGER REFERENCES city(id),
            UNIQUE(name, cityId));`;
      await db.query(sql);
      console.log("Area table created or already exists.");
    } catch (err) {
      console.error("Error creating area table:", err);
    }
  }
  async getAllAreas() {
    try {
      const sql = `SELECT * FROM area;`;
      const result = await db.query(sql);
      return result.rows;
    } catch (err) {
      console.error("Error fetching areas:", err);
      throw new Error("Error fetching areas");
    }
  }

  async AddAreasCsv(cities) {
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const { rows: City } = await db.query("SELECT id, name FROM city");
      const cityMap = {};
      City.forEach((p) => {
        cityMap[p.name.trim().toLowerCase()] = p.id;
      });

      const values = cities
        .map((c) => {
          const cityId = cityMap[c.city.trim().toLowerCase()]; // map name → id
          if (!cityId) {
            console.warn(
              `City "${c.city}" not found, skipping area "${c.name}"`
            );
            return null; // skip cities with invalid province
          }
          const areaName = c.name.trim().toLowerCase();
          return [areaName, cityId];
        })
        .filter(Boolean); // remove nulls
      if (!values.length|| values.length===0) {
        throw new Error("No valid cities to insert.");
      }
      // pg-format builds placeholders automatically
      const sql = format(
        `INSERT INTO area (name, cityid)
        VALUES %L
        ON CONFLICT (name, cityid) DO NOTHING
        Returning id;
        `,
        values
      );
        await client.query(sql);
        await client.query('COMMIT');
        
    } catch (err) {
      await client.query('ROLLBACK');
      console.error("Error inserting cities:", err);
      throw err;
    }finally {
      client.release();
    }
  }
}
export default new areaM();
