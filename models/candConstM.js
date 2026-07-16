import db from "../config/db.js";
class candConstM {
  async createTable() {
    try {
      const sql = `
            CREATE TABLE IF NOT EXISTS candidateConstituency(
            id SERIAL PRIMARY KEY,
            candidateId INTEGER REFERENCES candidate(id),
            totalVotes INTEGER DEFAULT 0,
            approvalstatus VARCHAR(20) CHECK (approvalstatus IN ('Pending', 'Won' , 'Lost')) DEFAULT 'Pending',
            constituencyId INTEGER REFERENCES Constituency(id),
            electionId INTEGER REFERENCES elections(id),
            UNIQUE(candidateId, constituencyId,electionId));
      CREATE INDEX IF NOT EXISTS idx_cand_const_election_const ON candidateConstituency(electionId, constituencyId);
      CREATE INDEX IF NOT EXISTS idx_cand_const_constituency ON candidateConstituency(constituencyId);
      CREATE INDEX IF NOT EXISTS idx_cand_const_leaderboard ON candidateConstituency(electionId, totalVotes DESC);`;
      await db.query(sql);
      console.log("candidateConstituency table created or already exists.");
    } catch (err) {
      console.error("Error creating candidateConstituency table:", err);
    }
  }

  // show candidates holding a constituency wrt party and election
  async getCandidatesInConstituencyWrtPartyAndElection(partyId, electionId) {
    try {
      const sql = `
        SELECT 
          cc.id AS candidateConstituencyId,
          u.name AS candidateName,
          u.email,
          u.cnic,
          p.name AS partyName,
          con.name AS constituencyName
        FROM candidateConstituency cc
        JOIN candidate c ON cc.candidateId = c.id
        JOIN users u ON c.userId = u.id
        JOIN party p ON c.partyId = p.id
        JOIN constituency con ON cc.constituencyId = con.id
        WHERE c.partyId = $1
          AND cc.electionId = $2;`;
      const result = await db.query(sql, [partyId, electionId]);
      return result.rows;
    } catch (err) {
      console.error("Error fetching party candidates in constituency for election:", err);
      throw new Error("Error fetching party candidates in constituency for election") ;}
  }
  async getCandidateAllocations(candidateId) {
    try {
        const sql = `
            SELECT 
                cc.id,
                e.name as election_name,
                e.seatType,
                e.status as election_status,
                con.name as constituency_name,
                con.code as constituency_code,
                cc.approvalStatus
            FROM candidateConstituency cc
            JOIN elections e ON cc.electionId = e.id
            JOIN constituency con ON cc.constituencyId = con.id
            WHERE cc.candidateId = $1
            ORDER BY e.startDate DESC;
        `;
        const result = await db.query(sql, [candidateId]);
        return result.rows;
    } catch (err) {
        console.error("Error fetching candidate allocations:", err);
        throw new Error("Error fetching candidate allocations");
    }
}
  async allocateCandidateEllectionConst(candidateId, electionId, constituencyId) {
    try {
        // 1. Fetch Election Details
        const electionRes = await db.query(
            `SELECT seatType, provinceId FROM elections WHERE id = $1`,
            [electionId]
        );

        if (electionRes.rows.length === 0) throw new Error("Election not found");

        const { seattype, provinceid: electionProvinceId } = electionRes.rows[0];

        // ======================================================
        // LOGIC: PROVINCIAL ELECTIONS
        // ======================================================
        if (seattype === 'Provincial') {
            
            // --- A. Validate CANDIDATE's Province ---
            const candidateRes = await db.query(
                `SELECT u.provinceId 
                 FROM candidate c 
                 JOIN users u ON c.userId = u.id 
                 WHERE c.id = $1`,
                [candidateId]
            );

            if (candidateRes.rows.length === 0) throw new Error("Candidate user not found");
            
            const candidateProvinceId = candidateRes.rows[0].provinceid;

            if (candidateProvinceId !== electionProvinceId) {
                throw new Error("Candidate is not eligible: You can only contest provincial elections in your home province.");
            }

            // --- B. Validate CONSTITUENCY'S Province (The Fix) ---
            // We join Constituency -> Constituency_Area -> Area -> City -> Province
            const constituencyRes = await db.query(
                `SELECT ci.provinceId
                 FROM constituency c
                 JOIN constituency_area ca ON c.id = ca.constituencyid
                 JOIN area a ON ca.areaid = a.id
                 JOIN city ci ON a.cityid = ci.id
                 WHERE c.id = $1
                 LIMIT 1`, 
                 [constituencyId]
            );

            if (constituencyRes.rows.length === 0) {
                // If no rows, it means the constituency has no areas assigned yet, 
                // OR the constituency ID is wrong.
                throw new Error("Invalid Constituency: It has no mapped areas or does not exist.");
            }

            const constProvinceId = constituencyRes.rows[0].provinceid;

            if (constProvinceId !== electionProvinceId) {
                throw new Error("Invalid Constituency: This constituency does not belong to the province of this election.");
            }
        }

        // ======================================================
        // LOGIC: NATIONAL ELECTIONS
        // ======================================================
        // If National, we skipped the block above.
        // We allow the candidate to fight for ANY constituency.
        // However, we should still ensure the constituency exists.
        
        // 3. Final Insert
        const sql = `INSERT INTO candidateConstituency (candidateId, electionId, constituencyId) VALUES ($1, $2, $3);`;
        await db.query(sql, [candidateId, electionId, constituencyId]);

    } catch (err) {
        // Handle constraint errors or custom errors
        if (err.message.includes("Candidate is not eligible") || err.message.includes("Invalid Constituency")) {
            throw err; // Throw our custom validation errors
        }
        if (err.code === "23503") {
            throw new Error("Reference error: Data provided does not exist.");
        } else if (err.code === "23505") {
            throw new Error("Candidate is already allocated to this constituency for this election.");
        }
        throw err;
    }
}
  async chooseSeat(candidateId,electionId,constituencyId) {

    try {
      // 1️⃣ Get all winning seats
      const { rows: wins } = await db.query(`
        SELECT id, constituencyid, totalvotes
        FROM candidateconstituency
        WHERE candidateid = $1 AND electionid = $2 AND approvalstatus = 'Won'
      `, [candidateId, electionId]);
  
      if (wins.length <= 1)
        throw new Error("Only one or no seat won, nothing to remove." );
  
      // 2️⃣ Identify chosen seat
      const chosenSeat = wins.find(w => w.constituencyid === constituencyId);
      if (!chosenSeat)
       throw new Error("Invalid seat selection." );
  
      // 3️⃣ Delete other won seats
      const { rows: deletedSeats } = await db.query(`
        DELETE FROM candidateconstituency
        WHERE candidateid = $1 AND electionid = $2 
        AND constituencyid != $3 AND approvalstatus = 'Won'
        RETURNING constituencyid
      `, [candidateId, electionId, constituencyId]);
  
      // 4️⃣ Promote runner-up for each deleted seat
      for (const seat of deletedSeats) {
        const { rows: runnerUp } = await db.query(`
          SELECT id FROM candidateconstituency
          WHERE constituencyid = $1 AND electionid = $2
          ORDER BY totalvotes DESC
          LIMIT 1
        `, [seat.constituencyid, electionId]);
  
        if (runnerUp.length) {
          await db.query(`
            UPDATE candidateconstituency
            SET approvalstatus = 'Won'
            WHERE id = $1
          `, [runnerUp[0].id]);
        }
      }
  
    } catch (err) {
      console.error("Error choosing seat:", err);
      throw new Error( err.message ||"Error choosing seat" );
    }
  }
    async getWonSeats(candidateId) {
      try {
    
        const { rows } = await db.query(`
          SELECT 
            cc.id AS seat_id,
            cc.constituencyid,
            c.name AS constituency_name,
            e.name AS election_name,
            cc.totalvotes
          FROM candidateconstituency cc
          JOIN constituency c ON c.id = cc.constituencyid
          JOIN elections e ON e.id = cc.electionid
          WHERE cc.candidateid = $1
            AND cc.approvalstatus = 'Won'
            AND e.status = 'Ended' 
            AND e.finalized = false
        `, [candidateId]);
    
        if (!rows.length)
          throw new Error ("You have no winning seats." );
    
        return{
          message: "Won seats retrieved successfully",
          seats: rows
        };
    
      } catch (err) {
        console.error("Error fetching won seats:", err);
        throw new Error (err.message||"Error fetching won seats" );
      }
    }
    async getPartyWonSeats(partyId) {
      try {
          const { rows } = await db.query(`
              SELECT 
                  cc.id AS seat_id,
                  cc.constituencyid,
                  c.name AS constituency_name,
                  e.name AS election_name,
                  cc.totalvotes,
                  u.id AS candidate_id,
                  u.name AS candidate_name
              FROM candidateconstituency cc
              JOIN candidate cand ON cand.id = cc.candidateid
              JOIN users u ON u.id = cand.userid
              JOIN constituency c ON c.id = cc.constituencyid
              JOIN elections e ON e.id = cc.electionid
              WHERE cand.partyid = $1
                AND cc.approvalstatus = 'Won'
                AND e.status = 'Ended'
                AND e.finalized = true
              ORDER BY e.id, c.id;
          `, [partyId]);
  
          // FIX: Return empty array if no rows, don't throw error or return message object
          return rows; 
  
      } catch (err) {
          throw new Error(err.message || "Error fetching party won seats");
      }
  }
}
export default new candConstM();
