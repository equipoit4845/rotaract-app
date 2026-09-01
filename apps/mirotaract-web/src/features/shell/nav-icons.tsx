import type { ReactNode } from "react";

type IconName =
  | "home"
  | "clubs"
  | "people"
  | "members"
  | "authorities"
  | "periods"
  | "applications"
  | "transfers";

const paths: Record<IconName, ReactNode> = {
  home: <path d="M3 10.5 12 3l9 7.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 19.5v-9Zm6 10.5v-6h6v6" />,
  clubs: <path d="M3 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16M3 21h18M7 7h2m-2 4h2m4-4h2m-2 4h2M6 21v-5h6v5" />,
  people: <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m14-10a4 4 0 1 0 0-8m6 18v-2a4 4 0 0 0-3-3.87M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" />,
  members: <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2m15-10a4 4 0 1 0 0-8M9 11a4 4 0 1 0 0-8m8 12 2 2 4-4" />,
  authorities: <path d="m12 3 2.4 4.86 5.36.78-3.88 3.78.92 5.34L12 15.23l-4.8 2.53.92-5.34-3.88-3.78 5.36-.78L12 3Z" />,
  periods: <path d="M7 3v3m10-3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Zm3 8h3v3H8v-3Z" />,
  applications: <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Zm0 0v6h6M8 13h8m-8 4h6" />,
  transfers: <path d="M7 7h11m-3-3 3 3-3 3M17 17H6m3-3-3 3 3 3" />,
};

/** App-level icon adapter. It has no Kernel semantics and keeps the shared
 * icon package independent from this administrative navigation. */
export function NavIcon({ name }: { name: IconName }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}
