import express from 'express';
import userC from '../controllers/userC.js'; // standardized import
import { authenicator } from '../middleware/authenicator.js';
import validate from '../middleware/validate.js';
import { createUserSchema, signinSchema, verifyOtpSchema, castVoteSchema, editProfileSchema } from '../validation/schemas.js';
import { authLimiter, voteLimiter } from '../config/rateLimits.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: User
 *   description: User management endpoints
 */

/**
 * @swagger
 * /api/users/account/create:
 *   post:
 *     summary: Register a new user
 *     tags: [User]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - email
 *               - cnic
 *               - password
 *               - province
 *               - city
 *               - area
 *             properties:
 *               name:
 *                 type: string
 *                 example: Ali Ahmed
 *               email:
 *                 type: string
 *                 format: email
 *                 example: ali@gmail.com
 *               cnic:
 *                 type: string
 *                 example: 42101-1234567-8
 *               password:
 *                 type: string
 *                 format: password
 *                 example: secure123
 *               province:
 *                 type: string
 *                 example: Sindh
 *               city:
 *                 type: string
 *                 example: Karachi
 *               area:
 *                 type: string
 *                 example: Gulistan-e-Jauhar
 *     responses:
 *       200:
 *         description: User created successfully
 *       400:
 *         description: Invalid input data
 *       500:
 *         description: Server error
 */
router.post("/account/create", authLimiter, validate(createUserSchema), userC.createUser);

/**
 * @swagger
 * /api/users/account/verify:
 *   post:
 *     summary: Verify Account (Registration Step 2)
 *     tags: [User]
 */
router.post('/account/verify', validate(verifyOtpSchema), userC.verifyAccount);

/**
 * @swagger
 * /api/users/account/signin:
 *   post:
 *     summary: Sign in an existing user
 *     tags: [User]
 */
router.post('/account/signin', authLimiter, validate(signinSchema), userC.signinUser);

/**
 * @swagger
 * /api/users/view/Candidates/{electionId}:
 *   get:
 *     summary: Get candidates for a user's election area and current election
 *     tags: [User]
 */
router.get('/view/Candidates/:electionId', authenicator, userC.viewCandidatesForUserElection);

router.get('/voting/history/', authenicator, userC.votingHistory);

/**
 * @swagger
 * /api/users/cast/vote:
 *   post:
 *     summary: Cast a vote for a candidate
 *     tags: [User]
 */
router.post('/cast/vote', authenicator, voteLimiter, validate(castVoteSchema), userC.castVote);

/**
 * @swagger
 * /api/users/EditProfile:
 *   post:
 *     summary: Edit user profile
 *     tags: [User]
 */
router.post('/EditProfile', authenicator, validate(editProfileSchema), userC.EditProfile);

export default router;
