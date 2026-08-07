import { Injectable, Logger } from "@nestjs/common";

export type EmailMessage = {
  to: string;
  subject: string;
  html: string;
  text?: string;
  idempotencyKey?: string;
};

/**
 * Thin client for the ClickMail transactional email API
 * (POST {baseUrl}/v1/emails, Bearer auth, JSON error envelope).
 * Delivery failures are logged and swallowed: a verification/reset/
 * invitation token remains valid and usable even if the email that
 * carries it could not be sent, matching kernel-spec.md's decision to
 * keep token issuance decoupled from delivery.
 */
@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);
  private readonly apiKey = process.env.CLICKMAIL_API_KEY;
  private readonly baseUrl = (
    process.env.CLICKMAIL_BASE_URL ?? "http://localhost:3000"
  ).replace(/\/$/, "");
  private readonly fromAddress =
    process.env.CLICKMAIL_FROM_ADDRESS ??
    "Mi Rotaract <no-reply@mirotaract.org>";

  async sendEmail(message: EmailMessage): Promise<void> {
    if (!this.apiKey) {
      this.logger.debug(
        `CLICKMAIL_API_KEY is not configured; skipping email to ${message.to}`,
      );
      return;
    }
    try {
      const response = await fetch(`${this.baseUrl}/v1/emails`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.apiKey}`,
          ...(message.idempotencyKey
            ? { "idempotency-key": message.idempotencyKey }
            : {}),
        },
        body: JSON.stringify({
          from: this.fromAddress,
          to: [message.to],
          subject: message.subject,
          html: message.html,
          text: message.text,
        }),
      });
      if (!response.ok) {
        const body = await response.text().catch(() => "");
        this.logger.warn(
          `ClickMail rejected an email to ${message.to}: ${response.status} ${body}`,
        );
      }
    } catch (error) {
      this.logger.warn(
        `ClickMail delivery failed for ${message.to}: ${error instanceof Error ? error.message : "unknown error"}`,
      );
    }
  }
}
