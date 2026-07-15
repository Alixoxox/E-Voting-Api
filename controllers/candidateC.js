import candidateM from "../models/candidateM.js";
import bcrypt from "bcrypt";
import { redisClient } from "../server.js";
import auditLogsM from "../models/auditLogsM.js";
class CandiateC {
  getCandidates = async (req, res) => {
    try {
      if (await redisClient.exists("AllCandidatesInfo")) {
        let cachedCandidates = await redisClient.get("AllCandidatesInfo");
        return res.json(JSON.parse(cachedCandidates));
      }
      const candidates = await candidateM.getAllCandidates();
      await redisClient.setEx(
        "AllCandidatesInfo",
        3600,
        JSON.stringify(candidates)
      );
      return res.json(candidates);
    } catch (err) {
      console.error(err);
      await auditLogsM.logAction(req, "FAILED_FETCH_CANDIDATES", "SYSTEM", {
        error: err.message || "Failed to fetch candidates",
        email: req.user.email,
        status: "Error",
      });
      res
        .status(500)
        .json({ error: err.message || "Failed to fetch candidates" });
    }
  };
  getCandidatesByPartyId = async (req, res) => {
    try {
      const partyId = req.user.id;
      const candidates = await candidateM.getCandidatesByPartyId(partyId);
      return res.json(candidates);
    } catch (err) {
      console.error(err);
      await auditLogsM.logAction(
        req,
        "FAILED_FETCH_CANDIDATES_BY_PARTY_ID",
        "Party_" + req.user.id,
        {
          error: err.message || "Failed to fetch candidates by party ID",
          email: req.user.email,
          status: "Error",
        }
      );
      res
        .status(500)
        .json({
          error: err.message || "Failed to fetch candidates by party ID",
        });
    }
  };
  CreateCandidate = async (req, res) => {
    try {
      console.log('Raw body:', req.body);
      console.log('File:', req.file);
      
      // Parse JSON strings from multipart form data
      const userData = typeof req.body.UserData === 'string' 
        ? JSON.parse(req.body.UserData) 
        : req.body.UserData;
      
      const candidateData = typeof req.body.Candidate === 'string' 
        ? JSON.parse(req.body.Candidate) 
        : req.body.Candidate;
      
      const { name, email, cnic, password, province, city, area } = userData;
      const { partyId, manifesto } = candidateData;
      
      let imageUrl = req.file?req.file.path:null;
      
      console.log(
        name,
        email,
        cnic,
        password,
        province,
        city,
        area,
        partyId,
        manifesto,
        imageUrl
      );
      
      let hashedPassword = await bcrypt.hash(password, 10);
      
      const result = await candidateM.createCandidate(
        name,
        email,
        cnic,
        hashedPassword,
        province,
        city,
        area,
        partyId,
        manifesto,
        imageUrl
      );
      
      await auditLogsM.logAction(
        req,
        "ADD_CANDIDATE",
        "Candidate_" + result.candId,
        {
          email: email,
          msg: "Candidate creation successful",
          status: "Success",
        }
      );
      
      return res.json({ 
        message: "Candidate created successfully",
        candidateId: result.candId,
        imageUploaded: !!imageUrl
      });
      
    } catch (err) {
      console.error(err);
      await auditLogsM.logAction(
        req,
        "FAILED_ADD_CANDIDATE",
        "Candidate_CREATION_FAILED",
        {
          error: err.message || "Failed to create candidate",
          email: req.user?.email || 'unknown',
          status: "Error",
        }
      );
      res
        .status(500)
        .json({ error: err.message || "Failed to create candidate" });
    }
  };
  async kickCandidate(req,res) {
    const candidateId = Number(req.params.candidateId);
    try {
      console.log("Kicking candidate with ID:", candidateId);
      // 1. Delete all votes referencing this candidate (via candidateConstId)
      await candidateM.kickCandidate(candidateId);
      await auditLogsM.logAction(
        req,
        "CANDIDATE_REMOVED",
        `Party_${req.user.id}`, 
        {
            msg: `Removed candidate (ID: ${candidateId}) and deleted their user account.`,
            candidateId: candidateId,
            status: "Success",
        }
    );
      return res.json({ message: "Candidate removed successfully" });
      
    } catch (err) {
      await auditLogsM.logAction(
        null,
        "FAILED_REMOVE_CANDIDATE",
        "Candidate_" + candidateId,
        {
          error: err.message || "Failed to kick candidate",
          status: "Error",
        }
      );
      console.error("Error kicking candidate:", err);
      throw new Error("Error kicking candidate");
    }
  }
}

export default new CandiateC();
