import express from 'express';
import partyC from '../controllers/partyC.js'; // standardized import
import CandidateC from '../controllers/candidateC.js';
import candidateConstituencyC from '../controllers/candConstC.js';
import { authenicator } from '../middleware/authenicator.js';
import validate from '../middleware/validate.js';
import { verifyOtpSchema, allocateCandidateSchema } from '../validation/schemas.js';
import { authLimiter } from '../config/rateLimits.js';
import { upload } from '../utils/imgUloader.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Parties
 *   description: Political party management endpoints
 */

/**
 * @swagger
 * /api/parties/candidates/fighting/elections/{electionId}:
 *   get:
 *     summary: Get all candidates with their fighting constituencies for a specific party and election
 *     tags: [Parties]
 */
router.get('/candidates/fighting/elections/:electionId', authenicator, candidateConstituencyC.getCandConstByPartyAndElection);

/**
 * @swagger
 * /api/parties/candidates:
 *   get:
 *     summary: Get all registered candidates for a specific party
 *     tags: [Parties]
 */
router.get('/candidates', authenicator, CandidateC.getCandidatesByPartyId);

/**
 * @swagger
 * /api/parties/create/candidate:
 *   post:
 *     summary: Create a new candidate
 *     tags: [Parties]
 */
router.post('/create/candidate', authenicator, upload.single('image'), CandidateC.CreateCandidate);

/**
 * @swagger
 * /api/parties/kick/candidate/{candidateId}:
 *   delete:
 *     summary: Remove a candidate from a specific party
 *     tags: [Parties]
 */
router.delete('/kick/candidate/:candidateId', authenicator, CandidateC.kickCandidate);

/**
 * @swagger
 * /api/parties/account/register:
 *   post:
 *     summary: Create a new party account with image
 *     tags: [Parties]
 */
router.post('/account/register', authLimiter, upload.single('image'), partyC.createParty);

/**
 * @swagger
 * /api/parties/account/signin:
 *   post:
 *     summary: Log Party account
 *     tags: [Parties]
 */
router.post('/account/signin', authLimiter, partyC.LoginParty);

/**
 * @swagger
 * /api/parties/account/verify:
 *   post:
 *     summary: Verify Party account
 *     tags: [Parties]
 */
router.post('/account/verify', validate(verifyOtpSchema), partyC.verifyParty);

/**
 * @swagger
 * /api/parties/candidate/fighting/constituency:
 *   post:
 *     summary: Allocate Candidate Wrt Constituency Seat for Election
 *     tags: [Parties]
 */
router.post('/candidate/fighting/constituency', authenicator, validate(allocateCandidateSchema), candidateConstituencyC.BookConstituencSeatForElectionForCandidate);

/**
 * @swagger
 * /api/parties/candidates/{candidateId}/won/seats:
 *   get:
 *     summary: Get all won seats for a specific candidate
 *     tags: [Parties]
 */
router.get('/candidates/:candidateId/won/seats', authenicator, candidateConstituencyC.GetwonSeats);

/**
 * @swagger
 * /api/parties/candidate/choose/seat:
 *   post:
 *     summary: Choose a seat for a candidate in a specific election and constituency
 *     tags: [Parties]
 */
router.post('/candidate/choose/seat', authenicator, candidateConstituencyC.ChooseSeat);

/**
 * @swagger
 * /api/parties/stats:
 *   get:
 *     summary: Get party dashboard statistics
 *     tags: [Parties]
 */
router.get("/stats", authenicator, partyC.stats);

/**
 * @swagger
 * /api/parties/recent-activity:
 *   get:
 *     summary: Get recent activity for a party
 *     tags: [Parties]
 */
router.get("/recent-activity", authenicator, partyC.getRecentActivity);

/**
 * @swagger
 * /api/parties/candidate/{candidateId}/allocations:
 *   get:
 *     summary: Get all constituencies a candidate is fighting in
 *     tags: [Parties]
 */
router.get('/candidate/:candidateId/allocations', authenicator, partyC.getCandidateAllocations);

/**
 * @swagger
 * /api/parties/candidates/won-seats:
 *   get:
 *     summary: Get all winning seats of the logged-in party's candidates
 *     tags: [Parties]
 */
router.get('/candidates/won-seats', authenicator, candidateConstituencyC.GetPartyWonSeats);

export default router;
