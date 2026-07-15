import jwt  from "jsonwebtoken";
import dotenv from "dotenv";

dotenv.config(); // loads variables from .env into process.env

const SECRET_KEY = process.env.SECRET_KEY;
const initialV = (req) => {
    const authheader = req.headers.authorization;
    if (!authheader || !authheader.startsWith("Bearer ")) {
        throw new Error("Missing or malformed token");
    }
    const token = authheader.split(" ")[1];
    if (!token) {
        throw new Error("Token value missing after Bearer");
    }
    return token;
};
export const authenicator = (req, res, next) => {
    try {
        const token = initialV(req); // now this throws if token is missing
        const decoded = jwt.decode(token);
        if (decoded?.exp < Math.floor(Date.now() / 1000)) {
            return res.status(401).json({ success: false, error: { message: "Invalid or expired token" } });
        }
        jwt.verify(token, SECRET_KEY, (err, user) => {
            if (err) {
                console.log("JWT Verification Error:", err);
                if (err.name === 'TokenExpiredError') {
                    return res.status(401).json({ success: false, error: { message: "Session Expired. Please log in again." } });
                }
                return res.status(401).json({ success: false, error: { message: "Invalid or expired token" } });
            }
            req.user = user;
            next();
        });
    } catch (err) {
        return res.status(400).json({ message: err.message || "Unauthorized" });
    }
};