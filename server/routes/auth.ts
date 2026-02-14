import { Router } from "express";
import { storage, db } from "../storage";
import { isAuthenticated } from "../auth/google";
import { users } from "@shared/schema";
import { eq } from "drizzle-orm";
import logger from "../logger";

const router = Router();

function validatePassword(pw: string): string | null {
  if (pw.length < 8) return "Password must be at least 8 characters";
  if (!/[a-z]/.test(pw)) return "Password must contain a lowercase letter";
  if (!/[A-Z]/.test(pw)) return "Password must contain an uppercase letter";
  if (!/[0-9]/.test(pw)) return "Password must contain a number";
  return null;
}

router.post('/api/auth/signup', async (req, res) => {
  try {
    const { email, password, firstName, lastName, hospitalName } = req.body;

    if (!email || !password || !firstName || !lastName || !hospitalName) {
      return res.status(400).json({
        message: "Email, password, first name, last name, and hospital name are required"
      });
    }

    const passwordError = validatePassword(password);
    if (passwordError) {
      return res.status(400).json({ message: passwordError });
    }

    const existingUser = await storage.searchUserByEmail(email);
    if (existingUser) {
      return res.status(409).json({ message: "User with this email already exists" });
    }

    const user = await storage.createUserWithPassword(email, password, firstName, lastName);
    const hospital = await storage.createHospital(hospitalName);

    const { seedHospitalData } = await import('../seed-hospital');
    await seedHospitalData(hospital.id, user.id);
    
    logger.info(`[Auth] Created and seeded new hospital for user ${user.id}`);

    req.login({ 
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      profileImageUrl: user.profileImageUrl,
      expires_at: Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60)
    }, (err) => {
      if (err) {
        logger.error("Error logging in user:", err);
        return res.status(500).json({ message: "Account created but login failed" });
      }
      res.status(201).json({ 
        message: "Account created successfully",
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName
        },
        hospital
      });
    });
  } catch (error: any) {
    logger.error("Error during signup:", error);
    res.status(500).json({ message: error.message || "Failed to create account" });
  }
});

router.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    const user = await storage.searchUserByEmail(email);
    if (!user || !user.passwordHash) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const bcrypt = await import('bcrypt');
    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    // Check if user is allowed to login
    if (user.canLogin === false) {
      return res.status(403).json({ message: "Your account is not enabled for app access. Please contact an administrator." });
    }

    req.login({
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      profileImageUrl: user.profileImageUrl,
      expires_at: Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60),
      mustChangePassword: user.mustChangePassword
    }, (err) => {
      if (err) {
        logger.error("[Auth] Error logging in user:", err);
        return res.status(500).json({ message: "Login failed" });
      }
      res.json({ 
        message: "Login successful",
        mustChangePassword: user.mustChangePassword,
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName
        }
      });
    });
  } catch (error: any) {
    logger.error("Error during login:", error);
    res.status(500).json({ message: error.message || "Login failed" });
  }
});

router.post('/api/auth/change-password', isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user.id;
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: "Current and new password are required" });
    }

    const passwordError = validatePassword(newPassword);
    if (passwordError) {
      return res.status(400).json({ message: passwordError });
    }

    const user = await storage.getUser(userId);
    if (!user || !user.passwordHash) {
      return res.status(400).json({ message: "User does not have a password set" });
    }

    const bcrypt = await import('bcrypt');
    const isValid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isValid) {
      return res.status(401).json({ message: "Current password is incorrect" });
    }

    await storage.updateUserPassword(userId, newPassword);
    await db.update(users).set({ mustChangePassword: false }).where(eq(users.id, userId));

    req.user.mustChangePassword = false;

    res.json({ message: "Password changed successfully" });
  } catch (error: any) {
    logger.error("Error changing password:", error);
    res.status(500).json({ message: error.message || "Failed to change password" });
  }
});

router.post('/api/auth/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    const user = await db.select().from(users).where(eq(users.email, email)).limit(1);
    
    if (!user || user.length === 0 || !user[0].passwordHash) {
      return res.json({ message: "If an account with that email exists, a password reset link has been sent." });
    }

    const foundUser = user[0];

    const crypto = await import('crypto');
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenExpiry = new Date(Date.now() + 60 * 60 * 1000);

    await db.update(users)
      .set({ 
        resetToken, 
        resetTokenExpiry 
      })
      .where(eq(users.id, foundUser.id));

    const { sendPasswordResetEmail } = await import('../resend.js');
    const baseUrl = process.env.PRODUCTION_URL || 'http://localhost:5000';
    const resetUrl = `${baseUrl}/reset-password?token=${resetToken}`;
    
    await sendPasswordResetEmail(
      foundUser.email!,
      resetUrl,
      foundUser.firstName || undefined
    );

    res.json({ message: "If an account with that email exists, a password reset link has been sent." });
  } catch (error: any) {
    logger.error("Error in forgot password:", error);
    res.status(500).json({ message: "An error occurred. Please try again later." });
  }
});

router.post('/api/auth/reset-password', async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({ message: "Token and new password are required" });
    }

    const passwordError = validatePassword(newPassword);
    if (passwordError) {
      return res.status(400).json({ message: passwordError });
    }

    const user = await db.select()
      .from(users)
      .where(eq(users.resetToken, token))
      .limit(1);

    if (!user || user.length === 0) {
      return res.status(400).json({ message: "Invalid or expired reset token" });
    }

    const foundUser = user[0];

    if (!foundUser.resetTokenExpiry || foundUser.resetTokenExpiry < new Date()) {
      return res.status(400).json({ message: "Reset token has expired" });
    }

    await storage.updateUserPassword(foundUser.id, newPassword);
    await db.update(users)
      .set({ 
        resetToken: null, 
        resetTokenExpiry: null,
        mustChangePassword: false
      })
      .where(eq(users.id, foundUser.id));

    res.json({ message: "Password reset successfully" });
  } catch (error: any) {
    logger.error("Error resetting password:", error);
    res.status(500).json({ message: "Failed to reset password" });
  }
});

router.get('/api/auth/user', isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user.id;
    const user = await storage.getUser(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    
    const hospitals = await storage.getUserHospitals(userId);
    
    const { passwordHash, ...sanitizedUser } = user;
    
    res.json({
      ...sanitizedUser,
      hospitals,
      mustChangePassword: user.mustChangePassword || false,
    });
  } catch (error) {
    logger.error("Error fetching user:", error);
    res.status(500).json({ message: "Failed to fetch user" });
  }
});

router.post('/api/signup', isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user.id;
    const { hospitalName } = req.body;

    if (!hospitalName) {
      return res.status(400).json({ message: "Hospital name is required" });
    }

    const hospital = await storage.createHospital(hospitalName);

    const anesthesiaUnit = await storage.createUnit({
      hospitalId: hospital.id,
      name: "Anesthesia",
      type: "anesthesia",
      parentId: null,
      isAnesthesiaModule: true,
      isSurgeryModule: false,
      isBusinessModule: false,
    });
    
    await storage.createUnit({
      hospitalId: hospital.id,
      name: "Operating Room (OR)",
      type: "or",
      parentId: null,
      isAnesthesiaModule: false,
      isSurgeryModule: true,
      isBusinessModule: false,
    });
    
    await storage.createUnit({
      hospitalId: hospital.id,
      name: "Emergency Room (ER)",
      type: "er",
      parentId: null,
      isAnesthesiaModule: false,
      isSurgeryModule: false,
      isBusinessModule: false,
    });
    
    await storage.createUnit({
      hospitalId: hospital.id,
      name: "Intensive Care Unit (ICU)",
      type: "icu",
      parentId: null,
      isAnesthesiaModule: false,
      isSurgeryModule: false,
      isBusinessModule: false,
    });

    await storage.createUserHospitalRole({
      userId,
      hospitalId: hospital.id,
      unitId: anesthesiaUnit.id,
      role: "admin",
    });

    res.status(201).json({ 
      message: "Hospital created successfully",
      hospital,
    });
  } catch (error) {
    logger.error("Error during signup:", error);
    res.status(500).json({ message: "Failed to create hospital" });
  }
});

router.get('/api/user/preferences', isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user.id;
    const user = await db.select({ preferences: users.preferences })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    
    if (!user || user.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }
    
    res.json(user[0].preferences || {});
  } catch (error) {
    logger.error("Error fetching user preferences:", error);
    res.status(500).json({ message: "Failed to fetch preferences" });
  }
});

router.patch('/api/user/preferences', isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user.id;
    const newPreferences = req.body;
    
    const user = await db.select({ preferences: users.preferences })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    
    if (!user || user.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }
    
    const currentPreferences = (user[0].preferences as Record<string, any>) || {};
    const mergedPreferences = { ...currentPreferences, ...newPreferences };
    
    if (newPreferences.clinicProviderFilter) {
      mergedPreferences.clinicProviderFilter = {
        ...(currentPreferences.clinicProviderFilter || {}),
        ...newPreferences.clinicProviderFilter,
      };
    }
    
    await db.update(users)
      .set({ preferences: mergedPreferences, updatedAt: new Date() })
      .where(eq(users.id, userId));
    
    res.json(mergedPreferences);
  } catch (error) {
    logger.error("Error updating user preferences:", error);
    res.status(500).json({ message: "Failed to update preferences" });
  }
});

// Update user's Timebutler ICS URL
router.put('/api/user/timebutler-url', isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user.id;
    const { url } = req.body;
    
    // Validate URL if provided
    if (url && !url.startsWith('https://')) {
      return res.status(400).json({ message: "URL must use HTTPS" });
    }
    
    await db.update(users)
      .set({ timebutlerIcsUrl: url || null, updatedAt: new Date() })
      .where(eq(users.id, userId));
    
    res.json({ success: true });
  } catch (error) {
    logger.error("Error updating Timebutler URL:", error);
    res.status(500).json({ message: "Failed to update Timebutler URL" });
  }
});

export default router;
