export type ServiceIdentity = {
  subject: string;
  audience: "institutional-kernel";
  scopes: string[];
};

// La verificación criptográfica de JWT/mTLS se incorpora junto con Identity.
export function requireServiceScope(
  identity: ServiceIdentity,
  scope: string,
): void {
  if (!identity.scopes.includes(scope))
    throw new Error(`Missing service scope: ${scope}`);
}
