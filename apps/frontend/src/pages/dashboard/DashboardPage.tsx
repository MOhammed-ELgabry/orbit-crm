import BusinessDashboard from "../../Components/Dashboard/BusinessDashboard";

/**
 * Business-type routing lives inside BusinessDashboard itself (it reads
 * company.businessType from AuthContext, which comes from GET
 * /companies/me — the authenticated session's own company, never
 * client-supplied/guessable frontend state). See config/businessType.ts
 * for the 3 supported types and their labels/icon/accent.
 */
export default function DashboardPage() {
  return (
    <div className="p-4">
      <BusinessDashboard />
    </div>
  );
}