import { Router } from "express";
import type { Request } from "express";
import { storage, db } from "../storage";
import { isAuthenticated } from "../auth/google";
import { users } from "@shared/schema";
import type { InsertLoginAuditLog } from "@shared/schema";
import { eq } from "drizzle-orm";
import { z, ZodError } from "zod";
import logger from "../logger";
import { ObjectStorageService } from "../objectStorage";

const router = Router();

/** Extract IP + user-agent from request and log an auth event. Fire-and-forget. */
function logAuthEvent(req: Request, event: Omit<InsertLoginAuditLog, 'ipAddress' | 'userAgent'>) {
  const ipAddress = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || 'unknown';
  const userAgent = req.headers['user-agent'] || null;
  storage.createLoginAuditLog({ ...event, ipAddress, userAgent }).catch(err => {
    logger.error('[Auth] Failed to write login audit log:', err);
  });
}

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
      logAuthEvent(req, { userId: user.id, email: email, eventType: 'login_success', hospitalId: hospital.id });
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
      logAuthEvent(req, { userId: user?.id ?? null, email, eventType: 'login_failed', failureReason: 'user_not_found' });
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const bcrypt = await import('bcrypt');
    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      logAuthEvent(req, { userId: user.id, email, eventType: 'login_failed', failureReason: 'invalid_password' });
      return res.status(401).json({ message: "Invalid email or password" });
    }

    // Check if user is allowed to login
    if (user.archivedAt) {
      logAuthEvent(req, { userId: user.id, email, eventType: 'login_failed', failureReason: 'account_archived' });
      return res.status(403).json({ message: "Your account has been deactivated. Please contact an administrator." });
    }
    if (user.canLogin === false) {
      logAuthEvent(req, { userId: user.id, email, eventType: 'login_failed', failureReason: 'account_disabled' });
      return res.status(403).json({ message: "Your account is not enabled for app access. Please contact an administrator." });
    }

    // Resolve hospital for audit log
    let loginHospitalId: string | null = null;
    try {
      const hospitals = await storage.getUserHospitals(user.id);
      if (hospitals.length > 0) loginHospitalId = hospitals[0].id;
    } catch { /* best effort */ }

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
      logAuthEvent(req, { userId: user.id, email, eventType: 'login_success', hospitalId: loginHospitalId });
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

// Verify another user's credentials for "Sign as..." flow
router.post('/api/auth/verify-for-signing', isAuthenticated, async (req: any, res) => {
  try {
    const { userId, password } = req.body;
    if (!userId || !password) {
      return res.status(400).json({ message: "userId and password are required" });
    }

    const user = await storage.getUser(userId);
    if (!user || !user.passwordHash) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const bcrypt = await import('bcrypt');
    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    res.json({
      valid: true,
      user: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        briefSignature: user.briefSignature,
      },
    });
  } catch (error: any) {
    logger.error("Error verifying credentials for signing:", error);
    res.status(500).json({ message: error.message || "Verification failed" });
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

    logAuthEvent(req, { userId, email: user.email || 'unknown', eventType: 'password_change' });
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

    // Get user's hospital language preference (default to 'de' for Swiss clinics)
    let language = 'de';
    try {
      const userHospitals = await storage.getUserHospitals(foundUser.id);
      if (userHospitals.length > 0) {
        const hospital = await storage.getHospital(userHospitals[0].id);
        language = (hospital?.defaultLanguage as string) || 'de';
      }
    } catch {
      // Fall back to default 'de'
    }

    await sendPasswordResetEmail(
      foundUser.email!,
      resetUrl,
      foundUser.firstName || undefined,
      language
    );

    logAuthEvent(req, { userId: foundUser.id, email: foundUser.email || email, eventType: 'password_reset_request' });
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

    logAuthEvent(req, { userId: foundUser.id, email: foundUser.email || 'unknown', eventType: 'password_reset_complete' });
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
    
    const { passwordHash, kioskPinHash, ...sanitizedUser } = user;

    res.json({
      ...sanitizedUser,
      hasKioskPin: !!kioskPinHash,
      hospitals,
      mustChangePassword: user.mustChangePassword || false,
      // Explicit: clients gate the /admin/groups nav + pages on this flag.
      isPlatformAdmin: !!user.isPlatformAdmin,
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
      isClinicModule: false,
      isLogisticModule: false,
      showInventory: true,
      showAppointments: true,
      showControlledMedications: false,
      questionnairePhone: null,
      infoFlyerUrl: null,
      hasOwnCalendar: false,
    });

    await storage.createUnit({
      hospitalId: hospital.id,
      name: "Operating Room (OR)",
      type: "or",
      parentId: null,
      isAnesthesiaModule: false,
      isSurgeryModule: true,
      isBusinessModule: false,
      isClinicModule: false,
      isLogisticModule: false,
      showInventory: true,
      showAppointments: true,
      showControlledMedications: false,
      questionnairePhone: null,
      infoFlyerUrl: null,
      hasOwnCalendar: false,
    });

    await storage.createUnit({
      hospitalId: hospital.id,
      name: "Emergency Room (ER)",
      type: "er",
      parentId: null,
      isAnesthesiaModule: false,
      isSurgeryModule: false,
      isBusinessModule: false,
      isClinicModule: false,
      isLogisticModule: false,
      showInventory: true,
      showAppointments: true,
      showControlledMedications: false,
      questionnairePhone: null,
      infoFlyerUrl: null,
      hasOwnCalendar: false,
    });

    await storage.createUnit({
      hospitalId: hospital.id,
      name: "Intensive Care Unit (ICU)",
      type: "icu",
      parentId: null,
      isAnesthesiaModule: false,
      isSurgeryModule: false,
      isBusinessModule: false,
      isClinicModule: false,
      isLogisticModule: false,
      showInventory: true,
      showAppointments: true,
      showControlledMedications: false,
      questionnairePhone: null,
      infoFlyerUrl: null,
      hasOwnCalendar: false,
    });

    await storage.createUserHospitalRole({
      userId,
      hospitalId: hospital.id,
      unitId: anesthesiaUnit.id,
      role: "admin",
      isBookable: false,
      publicCalendarEnabled: false,
      isDefaultLogin: false,
      availabilityMode: "always_available",
      calcomUserId: null,
      calcomEventTypeId: null,
      bookingServiceName: null,
      bookingLocation: null,
    });

    // Seed the remaining defaults (surgery rooms, administration groups,
    // medications, anesthesia settings). Idempotent: skips items that already
    // exist; the four units we created above are detected and not re-created.
    try {
      const { seedHospitalData } = await import('../seed-hospital');
      await seedHospitalData(hospital.id);
    } catch (seedError) {
      logger.error('[Signup] seedHospitalData failed; hospital still created:', seedError);
    }

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

// Update user profile fields (phone, briefSignature, timebutlerIcsUrl)
router.patch('/api/user/profile', isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user.id;

    const profileSchema = z.object({
      phone: z.string().nullable().optional(),
      briefSignature: z.string().nullable().optional(),
      timebutlerIcsUrl: z.string().nullable().optional(),
      profileImageUrl: z.string().nullable().optional(),
    });

    const data = profileSchema.parse(req.body);

    // Validate Timebutler URL if provided
    if (data.timebutlerIcsUrl && !data.timebutlerIcsUrl.startsWith('https://')) {
      return res.status(400).json({ message: "Timebutler URL must use HTTPS" });
    }

    // Build update object with only provided fields
    const updateFields: Record<string, any> = { updatedAt: new Date() };
    if ('phone' in data) updateFields.phone = data.phone || null;
    if ('briefSignature' in data) updateFields.briefSignature = data.briefSignature || null;
    if ('timebutlerIcsUrl' in data) updateFields.timebutlerIcsUrl = data.timebutlerIcsUrl || null;
    if ('profileImageUrl' in data) updateFields.profileImageUrl = data.profileImageUrl || null;

    await db.update(users)
      .set(updateFields)
      .where(eq(users.id, userId));

    res.json({ success: true });
  } catch (error: any) {
    if (error instanceof ZodError) {
      return res.status(400).json({ message: "Invalid request", details: error.errors });
    }
    logger.error("Error updating user profile:", error);
    res.status(500).json({ message: "Failed to update profile" });
  }
});

// Profile image upload URL
router.post('/api/user/profile-image/upload-url', isAuthenticated, async (req: any, res) => {
  try {
    const objectStorageService = new ObjectStorageService();
    if (!objectStorageService.isConfigured()) {
      return res.status(500).json({ message: "Object storage not configured" });
    }

    const { filename } = req.body;
    const result = await objectStorageService.getUploadURLForFolder('uploads/profile-images', filename || 'profile.jpg');
    res.json({ uploadUrl: result.uploadURL, storageKey: result.storageKey });
  } catch (error) {
    logger.error("Error generating profile image upload URL:", error);
    res.status(500).json({ message: "Failed to generate upload URL" });
  }
});

// Get own profile image (authenticated, for settings preview)
router.get('/api/user/profile-image', isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user.id;
    const [user] = await db.select({ profileImageUrl: users.profileImageUrl })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user?.profileImageUrl) {
      return res.status(404).json({ message: "No profile image" });
    }

    const objectStorageService = new ObjectStorageService();
    if (!objectStorageService.isConfigured()) {
      return res.status(500).json({ message: "Object storage not configured" });
    }

    const downloadUrl = await objectStorageService.getObjectDownloadURL(user.profileImageUrl, 3600);
    res.redirect(downloadUrl);
  } catch (error) {
    logger.error("Error serving own profile image:", error);
    res.status(500).json({ message: "Failed to load profile image" });
  }
});

// Public proxy for profile images (serves S3 objects without auth for booking page)
router.get('/api/public/profile-image/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const [user] = await db.select({ profileImageUrl: users.profileImageUrl })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user?.profileImageUrl) {
      return res.status(404).json({ message: "No profile image" });
    }

    const objectStorageService = new ObjectStorageService();
    if (!objectStorageService.isConfigured()) {
      return res.status(500).json({ message: "Object storage not configured" });
    }

    const downloadUrl = await objectStorageService.getObjectDownloadURL(user.profileImageUrl, 3600);
    res.redirect(downloadUrl);
  } catch (error) {
    logger.error("Error serving profile image:", error);
    res.status(500).json({ message: "Failed to load profile image" });
  }
});

// Self-service kiosk PIN management
router.post('/api/user/kiosk-pin', isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user.id;
    const pinSchema = z.object({
      pin: z.string().regex(/^\d{4}$/, "PIN must be exactly 4 digits"),
    });

    const { pin } = pinSchema.parse(req.body);
    await storage.setUserKioskPin(userId, pin);

    res.json({ success: true });
  } catch (error: any) {
    if (error instanceof ZodError) {
      return res.status(400).json({ message: "PIN must be exactly 4 digits" });
    }
    logger.error("Error setting own kiosk PIN:", error);
    res.status(500).json({ message: "Failed to set kiosk PIN" });
  }
});

router.delete('/api/user/kiosk-pin', isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user.id;
    await storage.clearUserKioskPin(userId);
    res.json({ success: true });
  } catch (error) {
    logger.error("Error clearing own kiosk PIN:", error);
    res.status(500).json({ message: "Failed to clear kiosk PIN" });
  }
});

export default router;
