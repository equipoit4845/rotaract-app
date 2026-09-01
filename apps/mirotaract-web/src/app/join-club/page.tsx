import { JoinClubContainer } from "@/features/applications/containers/join-club-container";
import { DashboardShell } from "@/features/shell/dashboard-shell";

export default function JoinClubPage() {
  return (
    <DashboardShell activePath="/join-club" allowWithoutOrganization>
      <JoinClubContainer />
    </DashboardShell>
  );
}
