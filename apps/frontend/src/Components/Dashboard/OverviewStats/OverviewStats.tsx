import AppointmentsStatsCard from "./AppointmentsStatsCard";
import PatientsStatsCard from "./PatientsStatsCard";
import TreatmentsStatsCard from "./TreatmentsStatsCard";
import RevenueStatsCard from "./RevenueStatsCard";
import PendingAppointmentsCard from "./PendingAppointmentsCard";

export default function OverviewStats() {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      <AppointmentsStatsCard />
      <PatientsStatsCard />
      <PendingAppointmentsCard />
      <TreatmentsStatsCard />
      <RevenueStatsCard />
    </div>
  );
}
