import { webUrl } from "../shared/web-url";
import type { EmailMessage } from "./notification.service";

export const APPLICATION_SUBMITTED = "kernel.membership-application.submitted.v1";
export const APPLICATION_APPROVED = "kernel.membership-application.approved.v1";
export const APPLICATION_REJECTED = "kernel.membership-application.rejected.v1";
export const APPLICATION_EMAIL_EVENTS = [
  APPLICATION_SUBMITTED,
  APPLICATION_APPROVED,
  APPLICATION_REJECTED,
];

export type Recipient = { personId: string; email: string; name: string };

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function paragraphs(text: string): string {
  return escapeHtml(text).replace(/\r?\n/g, "<br>");
}

/** Email to the club presidency: a person asked to join the club. */
export function submittedEmail(input: {
  applicationId: string;
  recipient: Recipient;
  requesterName: string;
  clubName: string;
  message: string | null;
  /** True when the club has no presidency and Comité IT is told instead. */
  fallback: boolean;
}): EmailMessage {
  const link = webUrl(`/applications/${input.applicationId}`);
  const club = escapeHtml(input.clubName);
  const requester = escapeHtml(input.requesterName);
  const intro = input.fallback
    ? `<p><strong>${club}</strong> no tiene presidencia vigente en Mi Rotaract, por eso este aviso llega al Comité IT del Distrito 4845.</p>`
    : "";
  const message = input.message
    ? `<p>Su mensaje:</p><blockquote style="margin:0 0 16px;padding-left:12px;border-left:3px solid #d41367">${paragraphs(input.message)}</blockquote>`
    : "";
  return {
    to: input.recipient.email,
    subject: `${input.requesterName} quiere sumarse a ${input.clubName}`,
    html: `${intro}<p>Hola ${escapeHtml(input.recipient.name)}:</p><p><strong>${requester}</strong> solicitó ingresar a <strong>${club}</strong>.</p>${message}<p>Podés aprobar o rechazar la solicitud desde Mi Rotaract:</p><p><a href="${link}">Revisar la solicitud</a></p>`,
    text: `${input.requesterName} solicitó ingresar a ${input.clubName}.${input.message ? `\n\nSu mensaje:\n${input.message}` : ""}\n\nRevisá la solicitud: ${link}`,
    idempotencyKey: `application-submitted:${input.applicationId}:${input.recipient.personId}`,
  };
}

/** Email to the applicant: the presidency approved the request. */
export function approvedEmail(input: {
  applicationId: string;
  recipient: Recipient;
  clubName: string;
}): EmailMessage {
  const link = webUrl("/dashboard");
  const club = escapeHtml(input.clubName);
  return {
    to: input.recipient.email,
    subject: `¡Bienvenida/o a ${input.clubName}!`,
    html: `<p>Hola ${escapeHtml(input.recipient.name)}:</p><p>La presidencia de <strong>${club}</strong> aprobó tu solicitud. Ya sos parte del club en Mi Rotaract.</p><p><a href="${link}">Entrar a Mi Rotaract</a></p>`,
    text: `La presidencia de ${input.clubName} aprobó tu solicitud. Ya sos parte del club en Mi Rotaract: ${link}`,
    idempotencyKey: `application-approved:${input.applicationId}`,
  };
}

/** Email to the applicant: the presidency rejected the request. */
export function rejectedEmail(input: {
  applicationId: string;
  recipient: Recipient;
  clubName: string;
  reason: string | null;
}): EmailMessage {
  const link = webUrl("/join-club");
  const club = escapeHtml(input.clubName);
  const reason = input.reason
    ? `<p>Motivo:</p><blockquote style="margin:0 0 16px;padding-left:12px;border-left:3px solid #d41367">${paragraphs(input.reason)}</blockquote>`
    : "";
  return {
    to: input.recipient.email,
    subject: `Tu solicitud a ${input.clubName} no fue aprobada`,
    html: `<p>Hola ${escapeHtml(input.recipient.name)}:</p><p>La presidencia de <strong>${club}</strong> no aprobó tu solicitud de ingreso.</p>${reason}<p>Si creés que es un error, hablá con el club. También podés pedir ingreso a otro club:</p><p><a href="${link}">Buscar un club</a></p>`,
    text: `La presidencia de ${input.clubName} no aprobó tu solicitud de ingreso.${input.reason ? `\n\nMotivo:\n${input.reason}` : ""}\n\nBuscar un club: ${link}`,
    idempotencyKey: `application-rejected:${input.applicationId}`,
  };
}
