import nodemailer from "nodemailer"
import { prisma } from "../db/client"
import { decrypt } from "../utils/encryption"

// ---- Types ----

interface SmtpCredentials {
  smtp_host: string
  smtp_port: string
  smtp_user: string
  smtp_password: string
  from_email: string
  from_name: string
}

interface SendEmailOptions {
  to: string
  subject: string
  text?: string
  html?: string
}

// ---- Core functions ----

/**
 * Retrieves and decrypts SMTP credentials from the tenant's vault.
 * Returns null if the tenant doesn't have email configured.
 */
async function getSmtpCredentials(tenantId: string): Promise<SmtpCredentials | null> {
  const platform = await prisma.integrationPlatform.findUnique({
    where: { slug: "email" },
  })

  if (!platform) return null

  const integration = await prisma.tenantIntegration.findUnique({
    where: {
      tenantId_platformId: { tenantId, platformId: platform.id },
    },
  })

  if (!integration || !integration.isActive) return null

  try {
    const decrypted = JSON.parse(decrypt(integration.credentialsEncrypted, integration.iv))
    return decrypted as SmtpCredentials
  } catch {
    console.error(`[email] Failed to decrypt SMTP credentials for tenant ${tenantId}`)
    return null
  }
}

/**
 * Creates a nodemailer transporter using the tenant's SMTP credentials.
 */
function createTransporter(creds: SmtpCredentials) {
  return nodemailer.createTransport({
    host: creds.smtp_host,
    port: parseInt(creds.smtp_port, 10) || 587,
    secure: parseInt(creds.smtp_port, 10) === 465,
    auth: {
      user: creds.smtp_user,
      pass: creds.smtp_password,
    },
  })
}

/**
 * Sends an email using the tenant's SMTP credentials from the vault.
 * Each tenant uses their own SMTP configuration.
 *
 * @param tenantId - The tenant whose SMTP credentials to use
 * @param options - Email options (to, subject, text/html)
 * @returns true if sent, false if credentials missing or send failed
 */
export async function sendEmail(tenantId: string, options: SendEmailOptions): Promise<boolean> {
  const creds = await getSmtpCredentials(tenantId)

  if (!creds) {
    console.error(`[email] No SMTP credentials configured for tenant ${tenantId}`)
    return false
  }

  const transporter = createTransporter(creds)

  try {
    await transporter.sendMail({
      from: `"${creds.from_name}" <${creds.from_email}>`,
      to: options.to,
      subject: options.subject,
      text: options.text,
      html: options.html,
    })
    console.log(`[email] Sent to ${options.to} for tenant ${tenantId}`)
    return true
  } catch (error) {
    console.error(`[email] Failed to send email for tenant ${tenantId}:`, error)
    return false
  }
}

/**
 * Sends an email to the owner of a tenant.
 * Looks up the owner's email from the users table.
 */
export async function sendEmailToOwner(
  tenantId: string,
  subject: string,
  html: string
): Promise<boolean> {
  const owner = await prisma.user.findFirst({
    where: {
      tenantId,
      role: { in: ["owner", "superadmin"] },
    },
    select: { email: true },
  })

  if (!owner) {
    console.error(`[email] No owner found for tenant ${tenantId}`)
    return false
  }

  return sendEmail(tenantId, { to: owner.email, subject, html })
}

/**
 * Validates that SMTP credentials exist and can connect.
 * Does NOT send an email, just verifies the SMTP connection.
 */
export async function validateSmtpCredentials(tenantId: string): Promise<boolean> {
  const creds = await getSmtpCredentials(tenantId)
  if (!creds) return false

  const transporter = createTransporter(creds)

  try {
    await transporter.verify()
    return true
  } catch (error) {
    console.error(`[email] SMTP verification failed for tenant ${tenantId}:`, error)
    return false
  }
}
