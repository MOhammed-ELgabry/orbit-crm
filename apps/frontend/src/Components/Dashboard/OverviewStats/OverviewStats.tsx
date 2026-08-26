import AppointmentsStatsCard from "./AppointmentsStatsCard";
import PatientsStatsCard from "./PatientsStatsCard";
import TreatmentsStatsCard from "./TreatmentsStatsCard";
import RevenueStatsCard from "./RevenueStatsCard";
import PendingAppointmentsCard from "./PendingAppointmentsCard";

export default function OverviewStats() {
  return (
    <div className="grid grid-cols-5 gap-3">
      <AppointmentsStatsCard />
      <PatientsStatsCard />
      <PendingAppointmentsCard />
      <TreatmentsStatsCard />
      <RevenueStatsCard />
    </div>
  );
}
