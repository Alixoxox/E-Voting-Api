import db from "../config/db.js";

class ConstituencyAreaM {

async createTable() {
    try{
    const query = `
      CREATE TABLE IF NOT EXISTS constituency_area (
  constituencyid INT REFERENCES constituency(id),
  areaid INT REFERENCES area(id),
  PRIMARY KEY (constituencyid, areaid)
);
CREATE INDEX IF NOT EXISTS idx_const_area_area ON constituency_area(areaid);`;
    await db.query(query);
    console.log("constituency_area table created or already exists.");
  }catch (err) {
    console.error("Error creating constituency_area table:", err);
  }
}
}
export default new ConstituencyAreaM();