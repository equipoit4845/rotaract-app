export function webUrl(path: string): string {
  const base = (
    process.env.KERNEL_PUBLIC_WEB_URL ?? "http://localhost:3000"
  ).replace(/\/$/, "");
  return `${base}${path}`;
}
