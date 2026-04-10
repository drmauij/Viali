export { encryptPatientData, decryptPatientData, ENCRYPTION_KEY } from "./encryption";
export { 
  getUserUnitForHospital, 
  getActiveUnitIdFromRequest, 
  getUserRole, 
  verifyUserHospitalUnitAccess,
  canWrite,
  requireWriteAccess,
  requireAdminWriteAccess,
  requireHospitalAccess,
  requireStrictHospitalAccess,
  requireStrictWriteAccess,
  requireHospitalAdmin,
  requireSurgeryPlanAccess,
  requireResourceAccess,
  requireResourceAdmin,
  verifyRecordBelongsToHospital,
  userHasHospitalAccess,
  getHospitalIdFromResource,
  isUserInLogisticUnit,
  hasLogisticsAccess,
  canAccessOrder,
  WRITE_ROLES,
  READ_ONLY_ROLES,
  requirePermission,
  userHasPermission,
  type PermissionFlag
} from "./accessControl";
export {
  getLicenseLimit,
  getBulkImportImageLimit,
  checkLicenseLimit
} from "./licensing";
export { anonymize, anonymizeWithOpenMed, logAiOutbound } from "./anonymize";
