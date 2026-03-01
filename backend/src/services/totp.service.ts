import { TOTP, Secret } from 'otpauth';
import QRCode from 'qrcode';
import crypto from 'crypto';
import { prisma } from '../config/database';
import { encrypt, decrypt } from '../utils/crypto';

const ISSUER = 'DeployPanel';

/**
 * Generate a new TOTP secret for a user
 */
export function generateTotpSecret(): string {
  const secret = new Secret({ size: 20 });
  return secret.base32;
}

/**
 * Create a TOTP URI for QR code scanning
 */
function createTotpUri(secret: string, username: string): string {
  const totp = new TOTP({
    issuer: ISSUER,
    label: username,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: Secret.fromBase32(secret),
  });
  return totp.toString();
}

/**
 * Generate a QR code data URL from a TOTP secret
 */
export async function generateQRCodeDataUrl(secret: string, username: string): Promise<string> {
  const uri = createTotpUri(secret, username);
  return QRCode.toDataURL(uri);
}

/**
 * Verify a TOTP token against a secret
 */
export function verifyTotpToken(secret: string, token: string): boolean {
  const totp = new TOTP({
    issuer: ISSUER,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: Secret.fromBase32(secret),
  });

  const delta = totp.validate({ token, window: 1 });
  return delta !== null;
}

/**
 * Generate backup codes (10 codes, 8 chars each)
 */
export function generateBackupCodes(): string[] {
  const codes: string[] = [];
  for (let i = 0; i < 10; i++) {
    codes.push(crypto.randomBytes(4).toString('hex').toUpperCase());
  }
  return codes;
}

/**
 * Setup 2FA for a user: generate secret + QR code + backup codes
 */
export async function setup2FA(userId: string): Promise<{
  secret: string;
  qrCode: string;
  backupCodes: string[];
}> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error('User not found');

  const secret = generateTotpSecret();
  const qrCode = await generateQRCodeDataUrl(secret, user.username);
  const backupCodes = generateBackupCodes();

  // Store encrypted secret and backup codes temporarily
  // They will be confirmed when user verifies with a valid token
  await prisma.user.update({
    where: { id: userId },
    data: {
      totpSecret: encrypt(secret),
      backupCodes: backupCodes.map(code => encrypt(code)),
    },
  });

  return { secret, qrCode, backupCodes };
}

/**
 * Confirm 2FA setup by verifying a token
 */
export async function confirm2FA(userId: string, token: string): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.totpSecret) throw new Error('2FA not set up');

  const secret = decrypt(user.totpSecret);
  const valid = verifyTotpToken(secret, token);

  if (valid) {
    await prisma.user.update({
      where: { id: userId },
      data: { totpEnabled: true },
    });
    return true;
  }

  return false;
}

/**
 * Verify 2FA token for login
 */
export async function verify2FALogin(userId: string, token: string): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.totpSecret || !user.totpEnabled) return false;

  const secret = decrypt(user.totpSecret);

  // Try TOTP token first
  if (verifyTotpToken(secret, token)) {
    return true;
  }

  // Try backup codes
  if (user.backupCodes && Array.isArray(user.backupCodes)) {
    const codes = user.backupCodes as string[];
    for (let i = 0; i < codes.length; i++) {
      try {
        const decryptedCode = decrypt(codes[i] as string);
        if (decryptedCode === token.toUpperCase()) {
          // Remove used backup code
          const updatedCodes = [...codes];
          updatedCodes.splice(i, 1);
          await prisma.user.update({
            where: { id: userId },
            data: { backupCodes: updatedCodes },
          });
          return true;
        }
      } catch {
        continue;
      }
    }
  }

  return false;
}
