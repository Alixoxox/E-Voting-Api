import express from 'express';
import ElectionC from '../controllers/ElectionC.js';
import CandidateC from '../controllers/candidateC.js';
import cityC from '../controllers/cityC.js';
import AreasC from '../controllers/areaC.js';
import ProvinceC from '../controllers/ProvinceC.js';
import ConstituencyC from '../controllers/ConstituencyC.js';
import Parties from '../controllers/partyC.js';
import userC from '../controllers/userC.js';
import validate from '../middleware/validate.js';
import { forgotPasswordSchema, resetPasswordSchema } from '../validation/schemas.js';
import { authLimiter } from '../config/rateLimits.js';
import adminC from '../controllers/adminC.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Public
 *   description: Publically Accessible endpoints
 */

// Parties
/**
 * @swagger
 * /api/public/parties:
 *   get:
 *     summary: Get all political parties
 *     tags: [Public]
 */
router.get('/parties', Parties.getParties);

// Areas
/**
 * @swagger
 * /api/public/areas:
 *   get:
 *     summary: Get all areas
 *     tags: [Public]
 */
router.get('/areas', AreasC.getAreas);

// Cities
/**
 * @swagger
 * /api/public/cities:
 *   get:
 *     summary: Get all cities
 *     tags: [Public]
 */
router.get('/cities', cityC.getCities);

// Dashboard Stats
/**
 * @swagger
 * /api/public/dashboard/stats:
 *   get:
 *     summary: Get Command Center Stats
 *     tags: [Public]
 */
router.get('/dashboard/stats', adminC.getDashboardStats);

// Password Reset (Step 1)
router.post('/password/forgot', authLimiter, validate(forgotPasswordSchema), userC.forgotPasswordRequest);

// Password Reset (Step 2)
router.post('/password/reset', authLimiter, validate(resetPasswordSchema), userC.resetPasswordWithOtp);

// Elections
router.get('/elections', ElectionC.getElections);

// Candidates
router.get('/candidates', CandidateC.getCandidates);

// Provinces
router.get('/province', ProvinceC.getProvinces);

// Constituencies
router.get('/constituencies', ConstituencyC.getConstituencies);

// Areas by Constituency
router.get('/area/constituency/:constituencyid', ConstituencyC.getAreaByConstituency);

// Active Elections
router.get('/active/Elections', ElectionC.getActiveElections);

// Resend OTP
router.post('/resend/otp', authLimiter, userC.resendOtp);

// Past Results
router.get('/elections/past-results', ElectionC.getPastResults);

// Active Provisional Constituencies
router.get('/active/constituencies/provisional', adminC.fetchAtiveProvisionalConstituencies);

// Active National Constituencies
router.get('/active/constiuencies/national', adminC.fetchActiveNationalConstituencies);

// Health Check
router.get('/health', adminC.healthCheck);

export default router;
