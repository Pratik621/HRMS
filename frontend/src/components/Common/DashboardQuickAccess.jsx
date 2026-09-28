import React from 'react';
import AttendanceCard from './AttendanceCard';
import HolidayCountdownCard from './HolidayCountdownCard';
import LeaveBalanceRingsCard from './LeaveBalanceRingsCard';
import AttendanceInsightsCard from './AttendanceInsightsCard';
import RegularizationStatsWidget from './RegularizationStatsWidget';
import OnLeaveTodayCard from './OnLeaveTodayCard';
import CelebrationsCard from './CelebrationsCard';
import PostComposerCard from './PostComposerCard';
import { QA_ANIMATIONS_CSS } from './quickAccessTheme';

const QUICK_ACCESS_CSS = `
  /* =========================================================
     MAIN DASHBOARD LAYOUT
     ========================================================= */

  .dash-quick-access {
    width: 100%;
    display: grid;
    grid-template-columns: 380px minmax(0, 1fr);
    gap: 18px;
    margin-bottom: 24px;
    align-items: start;
  }

  /* =========================================================
     LEFT COLUMN
     ========================================================= */

  .dash-quick-access__left {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  /* =========================================================
     RIGHT COLUMN
     ========================================================= */

  .dash-quick-access__right {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  /* =========================================================
     LOWER DASHBOARD CARDS
     ========================================================= */

 .dash-quick-access__lower-cards {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
  align-items: stretch;
}

.dash-quick-access__lower-card {
  min-width: 0;
  min-height: 0;
  display: flex;
  align-items: stretch;
}

.dash-quick-access__lower-card > * {
  width: 100%;
  height: 100%;
}

  /* =========================================================
     TABLET
     ========================================================= */

  @media (max-width: 1100px) {
    .dash-quick-access {
      grid-template-columns: 340px minmax(0, 1fr);
      gap: 16px;
    }

    .dash-quick-access__lower-cards {
      grid-template-columns: 1fr;
    }
  }

  /* =========================================================
     MOBILE / SMALL TABLET
     ========================================================= */

  @media (max-width: 900px) {
    .dash-quick-access {
      grid-template-columns: 1fr;
      gap: 16px;
    }

    .dash-quick-access__left,
    .dash-quick-access__right {
      width: 100%;
    }

    .dash-quick-access__lower-cards {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  /* =========================================================
     MOBILE
     ========================================================= */

  @media (max-width: 600px) {
    .dash-quick-access {
      gap: 14px;
      margin-bottom: 18px;
    }

    .dash-quick-access__left,
    .dash-quick-access__right {
      gap: 14px;
    }

    .dash-quick-access__lower-cards {
      grid-template-columns: 1fr;
      gap: 14px;
    }
  }
`;

export default function DashboardQuickAccess({
  employeeId,
  leaveBalance,
  leaveBalanceLoading,
  onLeaveScope = 'department',
  department,
  attendance,
  activeSession,
  onClockIn,
  onRequestClockOut,
  clockLoading,
  readOnly = false,
  readOnlyMessage,
  disabledMobile = false,
  canClockOut = true,
  shiftTiming,
  footerExtra,
  unlimitedBreaks = false,
  managerId,
  hideClockToggle = false,
  belowInsights = null,
}) {
  return (
    <div className="dash-quick-access">
      <style>
        {QUICK_ACCESS_CSS}
        {QA_ANIMATIONS_CSS}
      </style>

      {/* =====================================================
          LEFT COLUMN
          ===================================================== */}

      <div className="dash-quick-access__left">

        {/* Time Today */}
        <AttendanceCard
          attendance={attendance}
          activeSession={activeSession}
          onClockIn={onClockIn}
          onRequestClockOut={onRequestClockOut}
          clockLoading={clockLoading}
          readOnly={readOnly}
          readOnlyMessage={readOnlyMessage}
          disabledMobile={disabledMobile}
          canClockOut={canClockOut}
          shiftTiming={shiftTiming}
          footerExtra={footerExtra}
          unlimitedBreaks={unlimitedBreaks}
          hideClockToggle={hideClockToggle}
        />

        {/* Additional employee widgets */}
        <div className="dash-quick-access__lower-cards">

          <div className="dash-quick-access__lower-card">
            <RegularizationStatsWidget
              managerId={managerId}
            />
          </div>

          <div className="dash-quick-access__lower-card">
            <HolidayCountdownCard />
          </div>

          <div className="dash-quick-access__lower-card">
            <LeaveBalanceRingsCard
              suppliedBalance={leaveBalance}
              suppliedLoading={leaveBalanceLoading}
              employeeId={employeeId}
            />
          </div>

          <div className="dash-quick-access__lower-card">
            <OnLeaveTodayCard
              scope={onLeaveScope}
              department={department}
              managerId={managerId}
            />
          </div>

        </div>
      </div>

      {/* =====================================================
          RIGHT COLUMN
          ===================================================== */}

      <div className="dash-quick-access__right">

        {/* Posts / Quick Actions */}
        <PostComposerCard />

        {/* Celebrations */}
        <CelebrationsCard />

        {/* Attendance Insights */}
        <AttendanceInsightsCard
          employeeId={employeeId}
        />

        {/* Anything supplied by parent */}
        {belowInsights}

      </div>
    </div>
  );
}