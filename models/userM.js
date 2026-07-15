import pool from "../config/db.js";
import bcrypt from 'bcrypt';
import { redisClient } from "../server.js";
import crypto from 'crypto';
import { sendOTP } from "../utils/emailservice.js";
class UserM {
  async createTable() {
    try {
      const sql = `
      CREATE TABLE IF NOT EXISTS users(
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      email VARCHAR(100) NOT NULL UNIQUE,
      cnic VARCHAR(15) NOT NULL UNIQUE,
      password VARCHAR(255) NOT NULL,
      provinceId INTEGER REFERENCES province(id),
      cityId INTEGER REFERENCES city(id),
      areaId INTEGER REFERENCES area(id),
      role VARCHAR(20) CHECK (role IN ('admin', 'user', 'candidate')) DEFAULT 'user',
      is_verified BOOLEAN DEFAULT FALSE,    
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
      CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);`
      await pool.query(sql);
      console.log("Users table created or already exists.");
    } catch (err) {
      console.error("Error creating Users table:", err);
    }
  }
  async getAllUsers(page=1,limit=10) {
    try {
      const offset = (page - 1) * limit;
      const sql = `SELECT id,name,email,role,created_at,cnic,is_verified FROM users where role='user' ORDER BY created_at DESC LIMIT $1 OFFSET $2;`;
      const result = await pool.query(sql,[limit,offset]);
      const totalResult = await pool.query(`SELECT COUNT(*) FROM users;`);
      const totalUsers = parseInt(totalResult.rows[0].count);

      return {
        data: result.rows,
        meta: {
          total: totalUsers,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(totalUsers / limit)
        }
      };
    } catch (err) {
      console.error("Error fetching users:", err);
      throw new Error('Error fetching users');
    }
  }
  // userM.js
  async createUser(name, email, cnic, password, province, city, area, role) {
    try {
      // 1. Initialize IDs
      let province_id = null, city_id = null, area_id = null;
  
      // 2. Robust Location Lookup (Case-Insensitive & Trimmed)
      const locationRes = await pool.query(`
        SELECT p.id AS province_id, c.id AS city_id, a.id AS area_id
        FROM province p
        JOIN city c ON c.provinceid = p.id
        JOIN area a ON a.cityid = c.id
        WHERE LOWER(p.name) = LOWER($1) 
          AND LOWER(c.name) = LOWER($2) 
          AND LOWER(a.name) = LOWER($3)
      `, [province.trim(), city.trim(), area.trim()]); 
  
      // 3. Strict Check Logic
      if (locationRes.rows.length > 0) {
        // Found it!
        province_id = locationRes.rows[0].province_id;
        city_id = locationRes.rows[0].city_id;
        area_id = locationRes.rows[0].area_id;
      } 
      else {
        // Not Found
        if (role === 'admin') {
          console.log(`⚠️ System Notice: Creating Admin '${email}' without linked location.`);
        } else {
          // Throw explicit error showing exactly what failed
          throw new Error(`Invalid location details. The area '${area}' in city '${city}' (${province}) does not exist in our database.`);
        }
      }
  
      // ... (Rest of your insert logic remains the same) ...
      let isVerified = (role === 'admin' || role === 'candidate');
  
      const result = await pool.query(
        `INSERT INTO users (name, email, cnic, password, provinceId, cityId, areaId, role, is_verified) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) 
         RETURNING *`, 
        [name, email, cnic, password, province_id, city_id, area_id, role, isVerified]
      );
  
      return result.rows[0];
  
    } catch (err) {
      if (err.code === '23505') throw new Error('Email or CNIC already exists');
      throw err;
    }
  }
async signinUser(email, password,role){
  const ATTEMPTS_KEY = `login:attempts:${email}`;
  const LOCK_KEY = `login:locked:${email}`;
  const MAX_ATTEMPTS = 5;
  const LOCK_DURATION = 15 * 60; // 15 minutes in seconds

  try {
    // 1. CHECK: Is account currently locked in Redis?
    const isLocked = await redisClient.get(LOCK_KEY);
    if (isLocked) {
      const ttl = await redisClient.ttl(LOCK_KEY); // Get remaining time
      const minutes = Math.ceil(ttl / 60);
      throw new Error(`Account locked. Try again in ${minutes} minutes.`);
    }

    // 2. Find User (Main DB)
    const res = await pool.query(`SELECT id, name, email, password,is_verified,areaid,cnic FROM users WHERE email = $1 and role = $2`, [email,role]);
    if (res.rows.length === 0) throw new Error('User not found');
    const user = res.rows[0];
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      // Increment attempts in Redis
      const attempts = await redisClient.incr(ATTEMPTS_KEY);
      
      if (attempts === 1) {
        // Set expiry for the count itself (e.g., reset count after 1 hour if not locked)
        await redisClient.expire(ATTEMPTS_KEY, 3600);
      }

      if (attempts >= MAX_ATTEMPTS) {
        // LOCK THE ACCOUNT
        await redisClient.setEx(LOCK_KEY, LOCK_DURATION, '1'); // Lock for 15 mins
        await redisClient.del(ATTEMPTS_KEY); // Reset counter so it starts fresh after lock
        throw new Error('Too many failed attempts. Account locked for 15 mins.');
      } else {
        throw new Error(`Invalid password. ${MAX_ATTEMPTS - attempts} attempts remaining.`);
      }
    }
    // Clear any existing attempts upon success
    await redisClient.del(ATTEMPTS_KEY);
    return user;
  } catch (err) {
    throw err;
  }
}
async viewCandidatesForUserElection(areaId, electionId){
  console.log('Viewing from db:', areaId, 'and electionId:', electionId);
  try{
    const sql=`
    SELECT DISTINCT 
    c.*,
    cc.id AS candidateParticipatingId,
    cc.totalVotes,
    u.name,
    u.email,
    u.cnic,
    p.name AS partyName
FROM candidateConstituency cc
JOIN candidate c ON cc.candidateId = c.id
JOIN users u ON c.userId = u.id
LEFT JOIN party p ON c.partyId = p.id
JOIN constituency con ON cc.constituencyId = con.id
JOIN constituency_area ca ON ca.constituencyId = con.id
WHERE ca.areaId = $1
  AND cc.electionId = $2;

    `;
    const result=await pool.query(sql, [areaId, electionId]);
    return result.rows;
  }catch(err){
    console.error('Error viewing candidates for user election:', err);
    throw new Error('Error viewing candidates for user election');
  }
}
async EditProfile(userId,name,email,password){
  try{
    let parts=[] // this contains name , email , password
    let values=[] 
    let counter=1

    if(name){
      parts.push(`name=$${counter}`);
      values.push(name);
      counter++;
    }
    if(email){
      parts.push(`email=$${counter}`);
      values.push(email);
      counter++;
    }
    if (password){
      const hashedPassword = await bcrypt.hash(password, 10);
      parts.push(`password=$${counter}`);
      values.push(hashedPassword);
      counter++;
    }

    const sql = `
      UPDATE users 
      SET ${parts.join(', ')} 
      WHERE id = $${counter} 
      RETURNING id, name, email
    `;
    values.push(userId);
    const result = await pool.query(sql, values);
    return result.rows[0];
  }catch(err){
    if (err.code === '23505') throw new Error('Email already taken');
    throw err;
  }
}
//seed admin users
async PutAdmin(admins){
    for(const admin of admins){
      try{
      const hashedPassword = await bcrypt.hash(admin.password, 10);
      await this.createUser(admin.name, admin.email, admin.cnic, hashedPassword, admin.province, admin.city, admin.area,'admin');
      console.log(`Admin user ${admin.email} created.`);
  }catch(err){
    console.log(`Admin ${admin.name} Already Present`);
  } }
}

async generateAndSendOtp(userId, email,action) {
  const OTP_COOLDOWN_KEY = `otp:cooldown:${userId}`;
  const OTP_LIMIT_KEY = `otp:limit:${userId}`;
  const OTP_COOLDOWN_LEVEL_KEY = `otp:cooldownLevel:${userId}`;
  const COOLDOWN_TIMES = [60, 300, 900, 1800]; // 1 min, 5 min, 15 min
  const LIMIT_WINDOW = 3600;  // 1 hour window
  const MAX_REQUESTS = 4;     // Max 3 OTPs per hour

  try {
    // 1. CHECK COOLDOWN (Prevent spamming)
    const isCoolingDown = await redisClient.get(OTP_COOLDOWN_KEY);
    if (isCoolingDown) {
      const ttl = await redisClient.ttl(OTP_COOLDOWN_KEY);
      throw new Error(`Please wait ${ttl} seconds before requesting another code.`);
    }

    // 2. CHECK HOURLY LIMIT (Prevent abuse)
    const requestCount = await redisClient.incr(OTP_LIMIT_KEY);
    if (requestCount === 1) {
      await redisClient.expire(OTP_LIMIT_KEY, LIMIT_WINDOW);
    }
    if (requestCount > MAX_REQUESTS) {
      const ttl = await redisClient.ttl(OTP_LIMIT_KEY);
      const minutes = Math.ceil(ttl / 60);
      throw new Error(`Too many OTP requests. Try again in ${minutes} minutes.`);
    }

    // 3. GENERATE & STORE OTP
    const otp = crypto.randomInt(100000, 999999).toString();
    await redisClient.setEx(`otp:${userId}`, 600, otp); // 10 mins validity

    // 4. PROGRESSIVE COOLDOWN
    let level = await redisClient.get(OTP_COOLDOWN_LEVEL_KEY) || 0;
    level = parseInt(level);
    const cooldownTime = COOLDOWN_TIMES[Math.min(level, COOLDOWN_TIMES.length - 1)];

    await redisClient.setEx(OTP_COOLDOWN_KEY, cooldownTime, '1');
    await redisClient.setEx(OTP_COOLDOWN_LEVEL_KEY, LIMIT_WINDOW, (level + 1).toString());    // 5. SEND OTP
    await sendOTP(email, otp,action);
    return otp;

  } catch (err) {
    throw err;
  }
}
// 2. Verify OTP
async verifyOtp(userId, inputCode) {
  const storedCode = await redisClient.get(`otp:${userId}`);

  if (!storedCode) throw new Error("OTP has expired. Please request a new one.");
  if (storedCode !== inputCode) throw new Error("Invalid OTP code.");

  // Delete OTP after use so it can't be used twice
  await redisClient.del(`otp:${userId}`);
  
  return true;
}

// 3. Mark User as Verified (for Registration)
async markVerified(userId) {
  await pool.query(`UPDATE users SET is_verified = TRUE WHERE id = $1`, [userId]);
}
}
export default new UserM();
