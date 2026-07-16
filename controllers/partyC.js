import partyM from "../models/partyM.js";
import bcrypt from "bcrypt"
import dotenv from "dotenv";
import jwt from "jsonwebtoken";
import { redisClient } from "../server.js";
dotenv.config(); // loads variables from .env into process.env

const SECRET_KEY = process.env.SECRET_KEY;
import parseCsvWithValidation from "../utils/parseCsv.js";
import auditLogsM from "../models/auditLogsM.js";
import userM from "../models/userM.js";
import pool from "../config/db.js";
import candConstM from "../models/candConstM.js";
class Parties {
  getParties = async (req, res) => {
    try {
      if(await redisClient.exists("AllPartiesInfo")){
        let cachedParty=await redisClient.get("AllPartiesInfo");
        return res.json(JSON.parse(cachedParty));
      }
      const parties = await partyM.getAllParties();
      await redisClient.setEx("AllPartiesInfo", 3600, JSON.stringify(parties));
      return res.json(parties);
    } catch (err) {
      console.error(err);
      await auditLogsM.logAction(req,'FETCH_PARTIES_FAILED','FETCH_PARTIES_FAILED',{error:err.message,status: 'Error'});
      res.status(500).json({ error: err.message||"Failed to fetch parties" });
    }
  };
  AddPartiesCsv = async (req, res) => {
    try {
      const required = ["name", "abbreviation", "logo","email","password"];
      // validate file existence
      if (!req.file) {
        return res.status(400).json({ error: "No CSV file uploaded" });
      }
      const data = await parseCsvWithValidation(req.file.path, required);
      if (data.length === 0)
        return res
          .status(400)
          .json({ error: "CSV file is empty or has no valid data" });
      // now insert to db
        await partyM.addParties(data)
        await auditLogsM.logAction(req,'PARTY_CSV_UPLOAD','PARTY_CSV_UPLOAD',{rowsAdded:data.length,status: 'Success'});
        res.json({ message: "Parties added successfully from CSV" });
      
    } catch (err) {
      console.error(err);
      await auditLogsM.logAction(req,'PARTY_CSV_UPLOAD_FAILED','PARTY_CSV_UPLOAD_FAILED',{error:err.message,status: 'Error'});
      res.status(500).json({ error: "Failed to add parties from CSV\n"+err });
    }
  };
  async createParty(req, res) {
    try {
      const imageUrl = req.file.path; // Cloudinary URL
      const fileId = req.file.filename; // Cloudinary public_id
      console.log("Uploaded file to Cloudinary:", imageUrl, fileId);
      const { name, abbreviation, email, password } = req.body;
      console.log(name, abbreviation, email, password);
      let hashedpass=await bcrypt.hash(password,10)
      let result= await partyM.createParty(name, abbreviation, imageUrl,email,hashedpass);
      await userM.generateAndSendOtp(`party:${result.id}`, email, 'Party Account Verification');
      await auditLogsM.logAction(req, 'PARTY_REGISTERED', `Party_${result.id}`, { partyName: result.name, status: 'Pending Verification' });
      return res.json({message: "Party registered. Please verify your email to activate account.", partyId: result.id });     
    } catch (Err) {
      console.log(Err);
      await auditLogsM.logAction(req,'PARTY_CREATION_FAILED','PARTY_CREATION_FAILED',{error:Err.message,status: 'Error'});
      return res.status(500).json({ error: Err.message||"Failed to create party" });
    }
  }
  async verifyParty(req, res) {
    try {
      const { partyId, otp } = req.body;
        await userM.verifyOtp(`party:${partyId}`, otp);
  
      // 2. Update Status to 'Approved'
      await partyM.markVerified(partyId);
  
      return res.json({ message: "Account Approved! You can now log in." });
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  }
  async LoginParty(req, res) {
    try {
      const { email, password } = req.body;
      const result = await partyM.LoginParty(email, password);
      const PartyData={id:result.id,name:result.name,email:result.email};
      const token=jwt.sign(PartyData, SECRET_KEY, {expiresIn:'24h'})
      return res.json({ message: "Party logged in successfully",PartyData,token });
    } catch (err) {
      console.error(err);
      await auditLogsM.logAction( req,'PARTY_LOGIN_FAILED','PARTY_LOGIN_FAILED',{ email: req.body.email, error: err.message, status: 'Error' });
      // Send userId back if present
      if (err.userId) {
        return res.status(400).json({ error: err.message, userId: err.userId, areaId: err.areaId });
      }
    
      return res.status(500).json({ error: err.message || "Failed to login party" });
    }
  }
  async RejectPartyRegistration(req, res) {
    try {
      const { partyId } = req.params;
      await pool.query(`UPDATE party SET approvalstatus = 'Rejected' WHERE id = $1`, [partyId]);
      auditLogsM.logAction(req,'PARTY_REGISTRATION_REJECTED',`Party_${partyId}`,{status: 'Success'});
      return res.json({ message: "Party registration rejected successfully" });
    } catch (err) {
      console.error(err);
      auditLogsM.logAction(req,'PARTY_REGISTRATION_REJECTION_FAILED',`Party_${req.params.partyId}`,{error:err.message,status: 'Error'});
      return res.status(500).json({ error: err.message||"Failed to reject party registration" });
    }
  }async getRecentActivity(req, res) {
    try {
      // 1. Use the Party Name from the token (e.g., "Sufi Pulse")
      // Ensure your authenticator middleware adds 'name' to req.user
      const partyName = req.user.name; 
      const partyId = req.user.id;

      // 2. Query: Fetch logs where Actor is Party Name OR Party ID (for flexibility)
      const sql = `
        SELECT actor_name, action, details, timestamp
        FROM audit_logs
        WHERE actor_name = $1 
           OR target_id = $2 
        ORDER BY timestamp DESC
        LIMIT 20
      `;

      // We check both "Sufi Pulse" and "Party_9" formats to cover all bases
      const { rows } = await pool.query(sql, [partyName, `Party_${partyId}`]);

      const activities = rows.map(row => {
        let message = "";
        // Parse details safely
        const d = typeof row.details === 'string' ? JSON.parse(row.details) : row.details || {};

        switch (row.action) {
          case "PARTY_REGISTERED":
            message = `Party registered (${d.status || 'Pending'})`;
            break;

          case "ADD_CANDIDATE":
            message = `Candidate added: ${d.email || 'Unknown'}`;
            break;

          case "ALLOCATE_CANDIDATE_ELECTION_CONST":
            message = d.msg || "Allocated seat to candidate";
            break;

          case "CANDIDATE_REMOVED":
            message = d.msg || `Candidate removed (ID: ${d.candidateId})`;
            break;

          case "FAILED_FETCH_WON_SEATS":
            message = "Checked winning seats (No seats found)";
            break;

          case "FAILED_ADD_CANDIDATE":
            message = `Failed to add candidate: ${d.error}`;
            break;

          case "FAILED_ALLOCATE_CANDIDATE_ELECTION_CONST":
             message = `Allocation failed: ${d.error}`;
             break;

          default:
            // Fallback: Use msg from details, or format the action string
            message = d.msg || d.message || d.error || row.action.replace(/_/g, ' ');
        }

        return {
          actor: row.actor_name,
          action: row.action,
          message: message,
          createdAt: row.timestamp
        };
      });

      res.json(activities);

    } catch (err) {
      console.error("Error fetching recent activity:", err);
      res.status(500).json({ error: err.message || "Failed to fetch activity" });
    }
  }

    getCandidateAllocations = async (req, res) => {
      try {
          const { candidateId } = req.params;
          const data = await candConstM.getCandidateAllocations(candidateId);
          return res.json(data);
      } catch (err) {
          console.error(err);
          return res.status(500).json({ error: err.message || 'Failed to fetch candidate allocations' });
      }
  }
   async stats(req,res){
        try {
          const partyId = req.user.id
      
          // Total candidates for this party
          const { rows: candidates } = await pool.query(`
            SELECT COUNT(*) AS total
            FROM candidate
            WHERE partyid = $1
          `, [partyId]);
      
          // Active elections
          const { rows: activeElections } = await pool.query(`
            SELECT COUNT(*) AS total
            FROM elections
            WHERE status = 'Active'
          `);
      
          // Allocated seats (all seats assigned to this party)
          const { rows: allocatedSeats } = await pool.query(`
            SELECT COUNT(*) AS total
            FROM candidateconstituency
            WHERE candidateid IN (
              SELECT id FROM candidate WHERE partyid = $1
            )
          `, [partyId]);
      
          // Won seats
          const { rows: wonSeats } = await pool.query(`
            SELECT COUNT(*) AS total
            FROM candidateconstituency
            WHERE candidateid IN (
              SELECT id FROM candidate WHERE partyid = $1
            )
            AND approvalstatus = 'Won'
          `, [partyId]);
      
          res.json({
            totalCandidates: parseInt(candidates[0].total, 10),
            activeElections: parseInt(activeElections[0].total, 10),
            allocatedSeats: parseInt(allocatedSeats[0].total, 10),
            wonSeats: parseInt(wonSeats[0].total, 10)
          });
        } catch (err) {
          console.error(err);
          res.status(500).json({ error: err.message });
        }
      }
  }


export default new Parties();
