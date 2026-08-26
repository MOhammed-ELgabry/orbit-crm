import Analytics from "../../Components/Dashboard/Analytics";
import DashboardChart from "../../Components/Dashboard/DashboardChart";
import RecentPatients from "../../Components/Dashboard/RecentPatients";
import UpcomingAppointments from "../../Components/Dashboard/UpcomingAppointments";
import OverviewStats from "../../Components/Dashboard/OverviewStats/OverviewStats";

export default function DashboardPage() {
  return (
    <div className="p-4">
      <OverviewStats />

      <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <DashboardChart />
        <Analytics />
      </div>

      <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <RecentPatients />
        <UpcomingAppointments />
      </div>
    </div>
  );
}
