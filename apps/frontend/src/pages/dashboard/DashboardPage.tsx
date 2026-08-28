import Analytics from "../../Components/Dashboard/Analytics/Analytics";
import DashboardChart from "../../Components/Dashboard/DashboardChart/DashboardChart";
import OverviewStats from "../../Components/Dashboard/OverviewStats/OverviewStats";

import RecentPatients from "../../Components/Dashboard/RecentPatients/RecentPatients";
import UpcomingAppointments from "../../Components/Dashboard/UpcomingAppointments/UpcomingAppointments";

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
