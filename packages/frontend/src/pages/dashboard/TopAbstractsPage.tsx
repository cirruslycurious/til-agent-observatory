/**
 * Top Abstracts Dashboard Page
 * Displays top 10 abstracts with filters for vendor, conference, topic
 */

import { DashboardLayout } from '../../components/dashboard';
import { TopAbstractsTab } from '../../components/dashboard/TopAbstractsTab';

export function TopAbstractsPage() {
  return (
    <DashboardLayout>
      <TopAbstractsTab />
    </DashboardLayout>
  );
}
