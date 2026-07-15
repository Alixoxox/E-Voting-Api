import auditLogsM from "../models/auditLogsM.js";
import ElectionM from "../models/ElectionM.js";
import votesM from "../models/votesM.js";
import db from "../config/db.js"; // Ensure this import exists for getPastResults

class ElectionC {
  getElections = async (req, res) => {
    try {
      const elections = await ElectionM.getAllElections();
      return res.json(elections);
    } catch (err) {
      console.error(err);
      await auditLogsM.logAction(req, 'FAILED_FETCH_ELECTIONS', 'User_' + req.user.id, { error: err.message || 'Failed to fetch elections', email: req.user.email, status: 'Error' });
      res.status(500).json({ error: err.message || 'Failed to fetch elections' });
    }
  }

  CreateEllection = async (req, res) => {
    try {
      let { name, startDate, endDate, seatType, Province } = req.body;

      // 1. Normalize Input
      const lowerType = seatType.trim().toLowerCase();

      // 2. Determine Correct Database Value & Logic
      let dbSeatType = 'Provincial';

      if (lowerType === "national") {
        dbSeatType = "National";
        Province = null;
      } else {
        dbSeatType = "Provincial";
        if (!Province) {
          return res.status(400).json({ error: "Province is required for Provincial elections." });
        }
      }

      await ElectionM.createElection(name, startDate, endDate, dbSeatType, Province);

      await auditLogsM.logAction(
        req,
        'CREATE_ELECTION',
        'New_Election',
        { name, seatType: dbSeatType, province: Province, status: 'Success' }
      );

      return res.json({ message: 'Election created successfully' });

    } catch (Err) {
      console.error(Err);
      await auditLogsM.logAction(req, 'FAILED_CREATE_ELECTION', 'SYSTEM', { error: Err.message, status: 'Error' });
      return res.status(500).json({ error: Err.message });
    }
  }

  getActiveElections = async (req, res) => {
    try {
      let curentDate = new Date().toISOString().split('T')[0];
      const elections = await ElectionM.getActiveElections(curentDate);
      return res.json(elections);
    } catch (err) {
      console.error(err);
      await auditLogsM.logAction(req, 'FAILED_FETCH_ACTIVE_ELECTIONS', 'User_' + req.user.id, { error: err.message || 'Failed to fetch active elections', email: req.user.email, status: 'Error' });
      res.status(500).json({ error: err.message || 'Failed to fetch active elections' });
    }
  }

  verifyElectionIntegrity = async (req, res) => {
    try {
      const { electionId } = req.params;
      console.log(electionId);
      const result = await votesM.verifyElectionIntegrity(electionId);
      await auditLogsM.logAction(req, 'VERIFY_ELECTION_INTEGRITY', 'Votes_' + req.user.id, { electionId: electionId, msg: "Election integrity verified successfully", status: 'Success' });
      return res.json(result);
    } catch (err) {
      console.error(err);
      await auditLogsM.logAction(req, 'FAILED_VERIFY_ELECTION_INTEGRITY', 'Votes_', { error: err.message || 'Failed to verify election integrity', email: req.user.email, status: 'Error' });
      res.status(500).json({ error: err.message || 'Failed to verify election integrity' });
    }
  }

  // --- THIS METHOD PREVENTS THE CRASH ---
  getPastResults = async (req, res) => {
    try {
      const query = `
        SELECT 
            e.id as election_id, 
            e.name as election_name, 
            e.end_date,
            u.name as candidate_name,
            p.name as party_name,
            c.name as constituency_name,
            cc.totalvotes
        FROM elections e
        LEFT JOIN candidateconstituency cc ON cc.electionid = e.id AND cc.approvalstatus = 'Won'
        LEFT JOIN candidate cand ON cc.candidateid = cand.id
        LEFT JOIN users u ON cand.userid = u.id
        LEFT JOIN party p ON cand.partyid = p.id
        LEFT JOIN constituency c ON cc.constituencyid = c.id
        WHERE e.status = 'Ended'
        ORDER BY e.end_date DESC
      `;

      const { rows } = await db.query(query);

      // Group by Election
      const electionsMap = new Map();

      rows.forEach(row => {
        if (!electionsMap.has(row.election_id)) {
          electionsMap.set(row.election_id, {
            id: row.election_id,
            name: row.election_name,
            endDate: row.end_date,
            winners: []
          });
        }

        if (row.candidate_name) {
          electionsMap.get(row.election_id).winners.push({
            candidate_name: row.candidate_name,
            party_name: row.party_name,
            constituency_name: row.constituency_name,
            votes: row.totalvotes
          });
        }
      });

      const results = Array.from(electionsMap.values());
      return res.json(results);

    } catch (err) {
      console.error("Error fetching past results:", err);
      return res.status(500).json({ error: "Failed to fetch election results" });
    }
  }
}
export default new ElectionC();